package app.platewise.android.drive

import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.api.CommonStatusCodes

/** The one scope Platewise asks for: files Platewise itself made in the person's Drive. */
const val DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file"

/** The codes `authorize` rejects with, spelled as the plugin contract spells them. */
enum class DriveFailureCode(val wire: String) {
    NOT_CONFIGURED("notConfigured"),
    CANCELLED("cancelled"),
    UNAVAILABLE("unavailable"),
    UNKNOWN("unknown"),
}

/** A failure carrying the code the web app will see; the message never holds a token. */
class DriveFailure(val code: DriveFailureCode, message: String) : Exception(message)

/** What `authorize` answers: the access token, and the account's email when Google gave it. */
class DriveGrant(val accessToken: String, val email: String?) {
    fun toWire(): Map<String, Any?> = mapOf("accessToken" to accessToken, "email" to email)
}

/**
 * Google's older sign-in status codes, which Google Play services still reports for some
 * authorization failures (the library no longer ships the class that named them).
 */
const val SIGN_IN_FAILED = 12_500
const val SIGN_IN_CANCELLED = 12_501

/**
 * The contract's code for a Google status code. A developer error, or the sign-in failure that
 * the same problem gives, means no OAuth client matches this build's package and signing key.
 * Errors that Google Play services is too old or not connected are `unavailable`; network,
 * timeouts and the rest are `unknown` (worth trying again later).
 */
@Suppress("DEPRECATION") // the two Play services states still arrive as statuses
fun driveCodeOfStatus(statusCode: Int): DriveFailureCode = when (statusCode) {
    CommonStatusCodes.DEVELOPER_ERROR, SIGN_IN_FAILED -> DriveFailureCode.NOT_CONFIGURED
    CommonStatusCodes.CANCELED, SIGN_IN_CANCELLED -> DriveFailureCode.CANCELLED
    CommonStatusCodes.API_NOT_CONNECTED,
    CommonStatusCodes.SERVICE_VERSION_UPDATE_REQUIRED,
    CommonStatusCodes.SERVICE_DISABLED,
    -> DriveFailureCode.UNAVAILABLE
    else -> DriveFailureCode.UNKNOWN
}

/** The rejection for a Google status code: its code, and a message naming the status number. */
fun driveFailureOfStatus(statusCode: Int): DriveFailure {
    val code = driveCodeOfStatus(statusCode)
    val what = when (code) {
        DriveFailureCode.NOT_CONFIGURED -> "this build is not registered with Google for Drive"
        DriveFailureCode.CANCELLED -> "Google Drive access was not given"
        DriveFailureCode.UNAVAILABLE -> "Google Play services cannot be used"
        DriveFailureCode.UNKNOWN -> "Google Drive authorization failed"
    }
    return DriveFailure(code, "$what (status $statusCode)")
}

/**
 * Null when Google Play services can be used ([ConnectionResult.SUCCESS]); otherwise the
 * `unavailable` failure for its state (missing, disabled, invalid, updating or too old).
 */
fun playServicesFailure(availability: Int): DriveFailure? =
    if (availability == ConnectionResult.SUCCESS) {
        null
    } else {
        DriveFailure(DriveFailureCode.UNAVAILABLE, "Google Play services cannot be used on this phone (state $availability)")
    }
