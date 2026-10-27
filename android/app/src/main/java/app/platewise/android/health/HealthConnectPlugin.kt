package app.platewise.android.health

import android.content.ActivityNotFoundException
import android.content.Intent
import android.health.connect.HealthConnectException
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.activity.result.ActivityResult
import androidx.annotation.RequiresApi
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

private const val LOG_TAG = "PlatewiseHealth"

/**
 * The `HealthConnect` plugin of the contract in docs/plan/phases/P11-android-and-health-connect.md.
 * This file only moves values between Capacitor and the gateway: arguments become plain maps
 * and lists, results become JSON, and every error becomes one of the contract's codes.
 */
@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {
    private val work = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private lateinit var gateway: HealthConnectGateway

    override fun load() {
        gateway = HealthConnectGateway(context.applicationContext)
    }

    override fun handleOnDestroy() {
        work.cancel()
    }

    @PluginMethod
    fun availability(call: PluginCall) = answer(call) {
        mapOf("status" to gateway.availability().wire)
    }

    @PluginMethod
    fun grantedPermissions(call: PluginCall) = answer(call) {
        gateway.requireAvailable()
        gateway.grants().toWire()
    }

    /** Opens Health Connect's permission screen for the kinds not granted yet. */
    @PluginMethod
    override fun requestPermissions(call: PluginCall) {
        work.launch {
            try {
                gateway.requireAvailable()
                val wanted = KindSet.fromRequest(argsOf(call))
                val missing = wanted.permissions - gateway.grantedPermissions()
                if (missing.isEmpty()) {
                    call.resolve(toJs(gateway.grants().toWire()))
                    return@launch
                }
                val intent = gateway.permissionRequestIntent(missing)
                withContext(Dispatchers.Main) { startActivityForResult(call, intent, "permissionScreenClosed") }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                reject(call, error)
            }
        }
    }

    /** The screen's own answer is not used: the grants are asked for again once it closes. */
    @ActivityCallback
    private fun permissionScreenClosed(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        answer(call) { gateway.grants().toWire() }
    }

    @PluginMethod
    fun openHealthConnectSettings(call: PluginCall) = answer(call) {
        val targets = healthScreenTargets(gateway.availability(), Build.VERSION.SDK_INT, context.packageName)
        val opened = withContext(Dispatchers.Main) { targets.any(::tryToOpen) }
        if (!opened) throw HealthFailure(FailureCode.NOT_AVAILABLE, "no Health Connect screen can be opened on this phone")
        null
    }

    private fun tryToOpen(target: ScreenTarget): Boolean {
        val intent = Intent(target.action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        target.uri?.let { intent.data = Uri.parse(it) }
        target.targetPackage?.let { intent.setPackage(it) }
        target.extras.forEach { (key, value) -> intent.putExtra(key, value) }
        return try {
            activity.startActivity(intent)
            true
        } catch (_: ActivityNotFoundException) {
            false
        } catch (_: SecurityException) {
            false
        }
    }

    @PluginMethod
    fun readDailyTotals(call: PluginCall) = answer(call) {
        val range = DayRange.fromArgs(argsOf(call))
        gateway.requireAvailable()
        mapOf("days" to gateway.dailyTotals(range).map { it.toWire() })
    }

    @PluginMethod
    fun readExerciseSessions(call: PluginCall) = answer(call) {
        val range = DayRange.fromArgs(argsOf(call))
        gateway.requireAvailable()
        mapOf("sessions" to gateway.exerciseSessions(range).map { it.toWire() })
    }

    @PluginMethod
    fun readWeights(call: PluginCall) = answer(call) {
        val range = DayRange.fromArgs(argsOf(call))
        gateway.requireAvailable()
        mapOf("weights" to gateway.weights(range).map { it.toWire() })
    }

    @PluginMethod
    fun writeNutrition(call: PluginCall) = answer(call) {
        val meals = nutritionWrites(argsOf(call), Instant.now())
        gateway.requireAvailable()
        if (meals.isNotEmpty()) gateway.writeNutrition(meals)
        null
    }

    @PluginMethod
    fun deleteNutrition(call: PluginCall) = answer(call) {
        val ids = clientIdsToDelete(argsOf(call))
        gateway.requireAvailable()
        if (ids.isNotEmpty()) gateway.deleteNutrition(ids)
        null
    }

    @PluginMethod
    fun writeWeight(call: PluginCall) = answer(call) {
        val weighIn = weightWrite(argsOf(call), Instant.now())
        gateway.requireAvailable()
        gateway.writeWeight(weighIn)
        null
    }

    @PluginMethod
    fun deleteWeight(call: PluginCall) = answer(call) {
        val ids = clientIdsToDelete(argsOf(call))
        gateway.requireAvailable()
        if (ids.isNotEmpty()) gateway.deleteWeight(ids)
        null
    }

    /** Runs [block] off the main thread and settles the call with its map (null: no value). */
    private fun answer(call: PluginCall, block: suspend () -> Map<String, Any?>?) {
        work.launch {
            try {
                val result = block()
                if (result == null) call.resolve() else call.resolve(toJs(result))
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                reject(call, error)
            }
        }
    }

    private fun reject(call: PluginCall, error: Throwable) {
        val code = failureCodeOf(error, ::isRateLimit)
        // The class name only: messages from Health Connect could carry health values.
        Log.w(LOG_TAG, "${call.methodName} failed: ${code.wire} (${error.javaClass.simpleName})")
        call.reject(failureMessageOf(error, code), code.wire)
    }

    private fun isRateLimit(error: Throwable): Boolean =
        mentionsRateLimit(error) ||
            (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && isPlatformRateLimit(error))

    @RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
    private fun isPlatformRateLimit(error: Throwable): Boolean =
        error is HealthConnectException && error.errorCode == HealthConnectException.ERROR_RATE_LIMIT_EXCEEDED

    private fun argsOf(call: PluginCall): Map<String, Any?> = plainObject(call.data)

    private fun plainObject(json: JSONObject): Map<String, Any?> =
        json.keys().asSequence().associateWith { plainValue(json.opt(it)) }

    private fun plainValue(value: Any?): Any? = when (value) {
        null, JSONObject.NULL -> null
        is JSONObject -> plainObject(value)
        is JSONArray -> (0 until value.length()).map { plainValue(value.opt(it)) }
        else -> value
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
