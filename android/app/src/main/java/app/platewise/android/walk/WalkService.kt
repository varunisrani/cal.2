package app.platewise.android.walk

import android.Manifest
import android.app.Service
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.core.app.ServiceCompat

private const val LOG_TAG = "PlatewiseWalk"

/** The beat of the service: notification refresh and the GPS on/off check. */
private const val TICK_MS = 2_000L

/** How often a step sample is written while the walk runs. */
private const val STEP_SAMPLE_MS = 10_000L

/** GPS updates: at most every 2 s, and only after moving 5 m (no standing-still jitter). */
private const val GPS_INTERVAL_MS = 2_000L
private const val GPS_MIN_DISTANCE_M = 5f

/**
 * Records the walk with the screen off: a foreground service (location and/or health type) that
 * listens to the GPS and the step counter and hands every reading to [WalkSession]. It holds no
 * walk state of its own, so the system may restart it (START_STICKY) and it carries on from the
 * walk file. GPS is on only while the walk runs; the step counter stays on during a pause so the
 * baseline follows the steps that are not counted.
 */
class WalkService : Service() {
    private val main = Handler(Looper.getMainLooper())
    private var gpsOn = false
    private var stepsOn = false
    private var lastSampleAt = 0L

    private val ticker = object : Runnable {
        override fun run() {
            try {
                tick()
            } catch (error: RuntimeException) {
                // One missed beat; the next one tries again.
                Log.w(LOG_TAG, "walk tick failed (${error.javaClass.simpleName})")
            }
            main.postDelayed(this, TICK_MS)
        }
    }

    private val gps = object : LocationListener {
        override fun onLocationChanged(location: Location) {
            WalkSession.onFix(applicationContext, fixOf(location))
        }

        // Abstract before Android 11: these must exist or the platform's call fails.
        override fun onProviderEnabled(provider: String) = Unit

        override fun onProviderDisabled(provider: String) = Unit

        // Called up to Android 9 only.
        @Suppress("OVERRIDE_DEPRECATION")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
    }

    private val stepCounter = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent) {
            val value = event.values.firstOrNull() ?: return
            WalkSession.onStepCounter(applicationContext, value.toLong())
        }

        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val now = System.currentTimeMillis()
        val walk = WalkSession.current(applicationContext)
        val types = WalkSession.serviceTypes(applicationContext, walk)
        try {
            // Must come first: a service started as a foreground one has seconds to say so.
            ServiceCompat.startForeground(
                this,
                WalkNotifications.WALK_ID,
                WalkSession.notification(applicationContext, now),
                types,
            )
        } catch (error: RuntimeException) {
            // A permission taken away, or a restart Android does not allow from the background:
            // the walk stays in its file and the app starts the service again when it opens.
            Log.w(LOG_TAG, "walk service not in the foreground (${error.javaClass.simpleName})")
            stopSelf()
            return START_NOT_STICKY
        }
        if (walk == null || walk.phase == WalkPhase.ENDED || types == 0) {
            stopSelf()
            return START_NOT_STICKY
        }
        isRunning = true
        lastSampleAt = now
        startStepCounter(walk)
        updateGps(walk)
        main.removeCallbacks(ticker)
        main.postDelayed(ticker, TICK_MS)
        return START_STICKY
    }

    private fun tick() {
        val now = System.currentTimeMillis()
        val sampleDue = now - lastSampleAt >= STEP_SAMPLE_MS || now < lastSampleAt
        val walk = WalkSession.onTick(applicationContext, now, sampleDue)
        if (sampleDue) lastSampleAt = now
        if (walk == null || walk.phase == WalkPhase.ENDED) {
            stopSelf()
            return
        }
        updateGps(walk)
    }

    private fun startStepCounter(walk: WalkRecorder) {
        if (stepsOn || !walk.countsSteps || !WalkSession.stepsAllowed(applicationContext)) return
        val sensors = getSystemService(SensorManager::class.java) ?: return
        val sensor = sensors.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) ?: return
        // No batching: readings arrive as steps are taken, so a pause cuts at the right step.
        stepsOn = sensors.registerListener(stepCounter, sensor, SensorManager.SENSOR_DELAY_NORMAL, 0)
    }

    private fun updateGps(walk: WalkRecorder) {
        val wanted = walk.recordsLocation && walk.phase == WalkPhase.RUNNING &&
            WalkSession.granted(applicationContext, Manifest.permission.ACCESS_FINE_LOCATION)
        if (wanted == gpsOn) return
        val locations = getSystemService(LocationManager::class.java) ?: return
        if (!wanted) {
            locations.removeUpdates(gps)
            gpsOn = false
            return
        }
        gpsOn = try {
            locations.requestLocationUpdates(LocationManager.GPS_PROVIDER, GPS_INTERVAL_MS, GPS_MIN_DISTANCE_M, gps, Looper.getMainLooper())
            true
        } catch (error: SecurityException) {
            Log.w(LOG_TAG, "GPS refused (${error.javaClass.simpleName})")
            false
        } catch (error: IllegalArgumentException) {
            // No GPS provider on this device.
            Log.w(LOG_TAG, "no GPS (${error.javaClass.simpleName})")
            false
        }
    }

    override fun onDestroy() {
        main.removeCallbacks(ticker)
        if (stepsOn) getSystemService(SensorManager::class.java)?.unregisterListener(stepCounter)
        if (gpsOn) getSystemService(LocationManager::class.java)?.removeUpdates(gps)
        stepsOn = false
        gpsOn = false
        isRunning = false
        super.onDestroy()
    }

    companion object {
        /** True while the service records (it lives in the app's one process). */
        @Volatile
        var isRunning: Boolean = false
            private set

        /** A fix with its wall-clock time, from the fix's age (the GPS clock may differ from the phone's). */
        private fun fixOf(location: Location): Fix {
            val ageMs = ((SystemClock.elapsedRealtimeNanos() - location.elapsedRealtimeNanos) / 1_000_000).coerceAtLeast(0L)
            return Fix(
                time = System.currentTimeMillis() - ageMs,
                lat = location.latitude,
                lon = location.longitude,
                accuracyM = if (location.hasAccuracy()) location.accuracy.toDouble() else null,
            )
        }
    }
}
