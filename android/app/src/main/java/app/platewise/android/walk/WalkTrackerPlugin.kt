package app.platewise.android.walk

import android.Manifest
import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorManager
import android.location.LocationManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject

private const val LOG_TAG = "PlatewiseWalk"

/** How often `walkUpdate` carries the walk while the app listens and is in front. */
private const val UPDATE_MS = 2_000L

/** The event the contract names for live updates. */
internal const val WALK_UPDATE = "walkUpdate"
private const val LOCATION = "location"
private const val ACTIVITY = "activity"
private const val NOTIFICATIONS = "notifications"

/** A call that cannot be answered, with the code the web app sees. */
class WalkFailure(val code: String, message: String) : Exception(message)

/**
 * The `WalkTracker` plugin of the contract in docs/plan/phases/P15-walks-and-drive-backup.md. It
 * moves values between Capacitor and [WalkSession], asks Android for the permissions, and sends
 * `walkUpdate` events. Calls without a walk reject with `noWalk`; anything unexpected, `unknown`.
 */
@CapacitorPlugin(
    name = "WalkTracker",
    permissions = [
        // Both, as Android 12+ wants them asked together; only fine location gives a route.
        Permission(alias = LOCATION, strings = [Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION]),
        Permission(alias = ACTIVITY, strings = [Manifest.permission.ACTIVITY_RECOGNITION]),
        Permission(alias = NOTIFICATIONS, strings = [Manifest.permission.POST_NOTIFICATIONS]),
    ],
)
class WalkTrackerPlugin : Plugin() {
    private val work = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @Volatile
    private var inFront = true

    private val app: Context get() = context.applicationContext

    override fun load() {
        WalkSession.resumeRecording(app, System.currentTimeMillis())
        work.launch {
            while (isActive) {
                delay(UPDATE_MS)
                sendUpdate()
            }
        }
    }

    override fun handleOnResume() {
        inFront = true
    }

    override fun handleOnPause() {
        inFront = false
    }

    override fun handleOnDestroy() {
        work.cancel()
    }

    private fun sendUpdate() {
        if (!inFront || !hasListeners(WALK_UPDATE)) return
        try {
            val snapshot = WalkSession.snapshot(app, System.currentTimeMillis()) ?: return
            notifyListeners(WALK_UPDATE, toJs(snapshot))
        } catch (error: RuntimeException) {
            // A missed update is replaced by the next one; it must never end the app.
            Log.w(LOG_TAG, "walkUpdate not sent (${error.javaClass.simpleName})")
        }
    }

    private fun walkPermissions(): Map<String, String> = walkPermissionStates(
        apiLevel = Build.VERSION.SDK_INT,
        asked = permissionStates.mapValues { it.value.toString() },
        notificationsOn = NotificationManagerCompat.from(app).areNotificationsEnabled(),
    )

    @PluginMethod
    override fun checkPermissions(call: PluginCall) {
        call.resolve(toJs(walkPermissions()))
    }

    /** Asks Android for the chosen ones that are not granted yet (notifications are asked elsewhere). */
    @PluginMethod
    override fun requestPermissions(call: PluginCall) {
        val states = walkPermissions()
        val aliases = buildList {
            if (call.getBoolean(LOCATION, false) == true && states[LOCATION] != "granted") add(LOCATION)
            if (call.getBoolean(ACTIVITY, false) == true && states[ACTIVITY] != "granted") add(ACTIVITY)
        }
        if (aliases.isEmpty()) {
            call.resolve(toJs(states))
            return
        }
        requestPermissionForAliases(aliases.toTypedArray(), call, "permissionsAnswered")
    }

    @PermissionCallback
    private fun permissionsAnswered(call: PluginCall) {
        call.resolve(toJs(walkPermissions()))
    }

    private fun hasGps(): Boolean =
        app.getSystemService(LocationManager::class.java)?.allProviders?.contains(LocationManager.GPS_PROVIDER) == true

    private fun hasStepCounter(): Boolean =
        app.getSystemService(SensorManager::class.java)?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null

    @PluginMethod
    fun start(call: PluginCall) = answer(call) { now ->
        val withRoute = call.getBoolean("withRoute", false) == true
        WalkSession.start(
            app,
            now,
            recordsLocation = withRoute && WalkSession.granted(app, Manifest.permission.ACCESS_FINE_LOCATION) && hasGps(),
            countsSteps = WalkSession.stepsAllowed(app) && hasStepCounter(),
        )
    }

    @PluginMethod
    fun pause(call: PluginCall) = answer(call) { now -> WalkSession.pause(app, now) ?: noWalk() }

    @PluginMethod
    fun resume(call: PluginCall) = answer(call) { now -> WalkSession.resume(app, now) ?: noWalk() }

    @PluginMethod
    fun stop(call: PluginCall) = answer(call) { now -> WalkSession.stop(app, now, fromNotification = false) ?: noWalk() }

    @PluginMethod
    fun discard(call: PluginCall) = answer(call) {
        WalkSession.discard(app)
        null
    }

    /** The walk in progress, or ended and not discarded; no value at all when there is none. */
    @PluginMethod
    fun current(call: PluginCall) = answer(call) { now ->
        WalkSession.resumeRecording(app, now)
        WalkSession.snapshot(app, now)
    }

    private fun noWalk(): Nothing = throw WalkFailure("noWalk", "no walk in progress")

    /** Runs [block] off the main thread and settles the call with its map (null: no value). */
    private fun answer(call: PluginCall, block: (now: Long) -> Map<String, Any?>?) {
        work.launch {
            try {
                val result = block(System.currentTimeMillis())
                if (result == null) call.resolve() else call.resolve(toJs(result))
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                val code = (error as? WalkFailure)?.code ?: "unknown"
                Log.w(LOG_TAG, "${call.methodName} failed: $code (${error.javaClass.simpleName})")
                call.reject((error as? WalkFailure)?.message ?: "walk call failed (${error.javaClass.simpleName})", code)
            }
        }
    }

    private fun toJs(map: Map<String, Any?>): JSObject {
        val out = JSObject()
        map.forEach { (key, value) -> out.put(key, jsValue(value)) }
        return out
    }

    /** JSON for a result value; null must become JSON null, since putting null removes the key. */
    private fun jsValue(value: Any?): Any = when (value) {
        null -> JSONObject.NULL
        is Map<*, *> -> JSObject().also { obj -> value.forEach { (k, v) -> obj.put(k.toString(), jsValue(v)) } }
        is List<*> -> JSArray().also { array -> value.forEach { array.put(jsValue(it)) } }
        else -> value
    }
}
