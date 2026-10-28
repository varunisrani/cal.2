package app.platewise.android.drive

import android.accounts.Account
import android.app.Activity
import android.app.PendingIntent
import android.util.Log
import androidx.activity.result.ActivityResult
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.gms.auth.api.identity.AuthorizationClient
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.ClearTokenRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.auth.api.identity.RevokeAccessRequest
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.Scope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await
import org.json.JSONObject

private const val LOG_TAG = "PlatewiseDrive"

/** The account type of Google accounts on Android. */
private const val GOOGLE_ACCOUNT_TYPE = "com.google"

/**
 * The `Drive` plugin of the contract in docs/plan/phases/P15-walks-and-drive-backup.md: an access
 * token for the person's Google Drive (`drive.file` only) from Google's Authorization API, which
 * matches this app to its OAuth client by package name and signing key, so no client id is here.
 * The web app makes every Drive call itself. Rejections carry the contract's codes.
 */
@CapacitorPlugin(name = "Drive")
class DrivePlugin : Plugin() {
    // Main: Google's screen is launched from here; the Google calls themselves do not block.
    private val work = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    /** One authorization or sign-out at a time, so at most one Google screen is open. */
    private val oneAtATime = Mutex()

    private var consentScreen: ActivityResultLauncher<IntentSenderRequest>? = null
    private var consentAnswer: CompletableDeferred<ActivityResult>? = null

    /** The last token handed out in this run, for signOut to clear from Play services' cache. */
    private var lastToken: String? = null

    override fun load() {
        // Android only lets a launcher be registered while the activity is being created.
        consentScreen = bridge.registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { result ->
            consentAnswer?.complete(result)
        }
    }

    override fun handleOnDestroy() {
        work.cancel()
    }

    /** `{ interactive }` → `{ accessToken, email }`; see the task note for every rejection. */
    @PluginMethod
    fun authorize(call: PluginCall) {
        val interactive = call.getBoolean("interactive", false) == true
        work.launch {
            try {
                val grant = oneAtATime.withLock { grantOf(interactive) }
                val result = JSObject()
                // Null must be put as JSON null: putting null removes the key.
                grant.toWire().forEach { (key, value) -> result.put(key, value ?: JSONObject.NULL) }
                call.resolve(result)
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                reject(call, error)
            }
        }
    }

    /** Gives Drive access back and forgets the account; never rejects. */
    @PluginMethod
    fun signOut(call: PluginCall) {
        work.launch {
            oneAtATime.withLock {
                val token = lastToken
                lastToken = null
                val account = DriveAccount.remembered(context)
                DriveAccount.forget(context)
                quietly("reach Google Play services") {
                    if (playServicesFailure(GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context)) != null) {
                        return@quietly
                    }
                    val client = Identity.getAuthorizationClient(context)
                    if (account != null) quietly("revoke") { revoke(client, account) }
                    if (token != null) quietly("clear token") { client.clearToken(ClearTokenRequest.builder().setToken(token).build()).await() }
                    // Google's remembered choice of account for this app: the next connect asks again.
                    // (Deprecated with the rest of the sign-in client, still the only call for it.)
                    @Suppress("DEPRECATION")
                    quietly("sign out") { Identity.getSignInClient(context).signOut().await() }
                }
            }
            call.resolve()
        }
    }

    private suspend fun revoke(client: AuthorizationClient, account: String) {
        val request = RevokeAccessRequest.builder()
            .setAccount(Account(account, GOOGLE_ACCOUNT_TYPE))
            .setScopes(listOf(Scope(DRIVE_FILE_SCOPE)))
            .build()
        client.revokeAccess(request).await()
    }

    /**
     * Asks Google without showing anything first; when Google needs the person (first connect, a
     * revoked grant) and the call is interactive, opens Google's own screen and reads its answer.
     */
    private suspend fun grantOf(interactive: Boolean): DriveGrant {
        playServicesFailure(GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context))?.let { throw it }
        val client = Identity.getAuthorizationClient(activity)
        val request = AuthorizationRequest.builder().setRequestedScopes(listOf(Scope(DRIVE_FILE_SCOPE))).build()
        var result = google { client.authorize(request).await() }
        if (result.hasResolution()) {
            if (!interactive) {
                throw DriveFailure(DriveFailureCode.CANCELLED, "Google needs the person to allow Drive access (ask with interactive: true)")
            }
            result = answerOf(client, result.pendingIntent ?: throw DriveFailure(DriveFailureCode.UNKNOWN, "Google gave no screen to ask on"))
        }
        val token = result.accessToken ?: throw DriveFailure(DriveFailureCode.UNKNOWN, "Google gave no access token")
        lastToken = token
        @Suppress("DEPRECATION")
        val account = result.toGoogleSignInAccount()
        val name = account?.account?.name ?: account?.email
        name?.let { DriveAccount.remember(context, it) }
        return DriveGrant(token, account?.email ?: name)
    }

    /** Google's screen, and the result it hands back (or why there is none). */
    private suspend fun answerOf(client: AuthorizationClient, screen: PendingIntent): AuthorizationResult {
        val launcher = consentScreen ?: throw DriveFailure(DriveFailureCode.UNKNOWN, "no screen to show Google's question on")
        val answer = CompletableDeferred<ActivityResult>()
        consentAnswer = answer
        val closed = try {
            launcher.launch(IntentSenderRequest.Builder(screen).build())
            answer.await()
        } finally {
            consentAnswer = null
        }
        val data = closed.data ?: throw DriveFailure(DriveFailureCode.CANCELLED, "Google's screen was closed")
        val result = google { client.getAuthorizationResultFromIntent(data) }
        if (closed.resultCode != Activity.RESULT_OK && result.accessToken == null) {
            throw DriveFailure(DriveFailureCode.CANCELLED, "Google's screen was closed")
        }
        return result
    }

    /** Runs a Google call, turning its status into the contract's codes. */
    private inline fun <T> google(block: () -> T): T = try {
        block()
    } catch (error: ApiException) {
        throw driveFailureOfStatus(error.statusCode)
    }

    private suspend fun quietly(what: String, block: suspend () -> Unit) {
        try {
            block()
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Log.w(LOG_TAG, "signOut could not $what (${error.javaClass.simpleName})")
        }
    }

    private fun reject(call: PluginCall, error: Throwable) {
        val failure = error as? DriveFailure
            ?: DriveFailure(DriveFailureCode.UNKNOWN, "Google Drive authorization failed (${error.javaClass.simpleName})")
        Log.w(LOG_TAG, "${call.methodName} failed: ${failure.code.wire}")
        call.reject(failure.message, failure.code.wire)
    }
}
