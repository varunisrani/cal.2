package app.platewise.android.walk

import android.Manifest
import android.app.Notification
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import java.io.File
import java.io.IOException
import java.util.UUID

private const val LOG_TAG = "PlatewiseWalk"

/** The walk file, in the app's own files folder (removed with the app, never in a backup). */
private const val WALK_FILE = "walk/current.walk"

/**
 * The one walk of this process, shared by the plugin, the service and the notification's
 * buttons: read from its file the first time it is needed, changed only through
 * [WalkRecorder] (every change appended to the file), and kept until the app discards it.
 * Everything here runs under one lock; callers pass the application context.
 */
internal object WalkSession {
    private var loaded = false
    private var file: WalkFile? = null
    private var walk: WalkRecorder? = null
    private var shownKey: String? = null

    private fun fileOf(context: Context): WalkFile =
        file ?: WalkFile(File(context.filesDir, WALK_FILE)).also { file = it }

    private fun walkOf(context: Context): WalkRecorder? {
        if (!loaded) {
            loaded = true
            walk = try {
                fileOf(context).load()?.let(WalkRecorder::replay)
            } catch (error: IOException) {
                Log.w(LOG_TAG, "walk file unreadable (${error.javaClass.simpleName})")
                null
            }
        }
        return walk
    }

    private fun record(context: Context, events: List<WalkEvent>) {
        if (events.isEmpty()) return
        try {
            fileOf(context).append(events)
        } catch (error: IOException) {
            // The walk goes on in memory; a later event may still reach the file.
            Log.w(LOG_TAG, "walk file not written (${error.javaClass.simpleName})")
        }
    }

    @Synchronized
    fun current(context: Context): WalkRecorder? = walkOf(context)

    /** The walk notification as it should look now (for the service's start). */
    @Synchronized
    fun notification(context: Context, now: Long): Notification =
        WalkNotifications.walkNotification(context, walkOf(context), now)

    /** The walk in the contract's shape, or null when there is none. */
    @Synchronized
    fun snapshot(context: Context, now: Long): Map<String, Any?>? = walkOf(context)?.toWire(now)

    /** A new walk, or the walk in progress when there is one; an ended walk is replaced. */
    @Synchronized
    fun start(context: Context, now: Long, recordsLocation: Boolean, countsSteps: Boolean): Map<String, Any?> {
        walkOf(context)?.takeIf { it.phase != WalkPhase.ENDED }?.let { ongoing ->
            keepRecording(context, now)
            return ongoing.toWire(now)
        }
        val (started, events) = WalkRecorder.begin(UUID.randomUUID().toString(), now, recordsLocation, countsSteps)
        fileOf(context).create(events)
        walk = started
        shownKey = null
        WalkNotifications.cancel(context, WalkNotifications.ENDED_ID)
        keepRecording(context, now)
        return started.toWire(now)
    }

    @Synchronized
    fun pause(context: Context, now: Long): Map<String, Any?>? = change(context, now) { it.pause(now) }

    @Synchronized
    fun resume(context: Context, now: Long): Map<String, Any?>? = change(context, now) { it.resume(now) }

    private fun change(context: Context, now: Long, step: (WalkRecorder) -> List<WalkEvent>): Map<String, Any?>? {
        val current = walkOf(context) ?: return null
        if (current.phase != WalkPhase.ENDED) {
            record(context, step(current))
            keepRecording(context, now)
        }
        return current.toWire(now)
    }

    /**
     * Ends the walk and keeps it in its file until [discard]. From the notification the app may
     * be closed, so a "Walk ended" notification leads back to it.
     */
    @Synchronized
    fun stop(context: Context, now: Long, fromNotification: Boolean): Map<String, Any?>? {
        val current = walkOf(context) ?: return null
        if (current.phase == WalkPhase.ENDED) return current.toWire(now)
        record(context, current.end(now))
        context.stopService(Intent(context, WalkService::class.java))
        WalkNotifications.cancel(context, WalkNotifications.WALK_ID)
        shownKey = null
        if (fromNotification) {
            WalkNotifications.show(context, WalkNotifications.ENDED_ID, WalkNotifications.endedNotification(context, current, now))
        }
        return current.toWire(now)
    }

    /** Forgets the walk, ended or not: no service, no notification, no file. */
    @Synchronized
    fun discard(context: Context) {
        walkOf(context)
        context.stopService(Intent(context, WalkService::class.java))
        WalkNotifications.cancel(context, WalkNotifications.WALK_ID)
        WalkNotifications.cancel(context, WalkNotifications.ENDED_ID)
        fileOf(context).delete()
        walk = null
        shownKey = null
    }

    /** At app start: a walk that was running or paused when the process ended records again. */
    @Synchronized
    fun resumeRecording(context: Context, now: Long) {
        if (walkOf(context)?.phase.let { it == WalkPhase.RUNNING || it == WalkPhase.PAUSED }) keepRecording(context, now)
    }

    // --- The service's side ---------------------------------------------------------------

    @Synchronized
    fun onFix(context: Context, fix: Fix) {
        walkOf(context)?.let { record(context, it.offer(fix)) }
    }

    @Synchronized
    fun onStepCounter(context: Context, counter: Long) {
        walkOf(context)?.onStepCounter(counter)
    }

    /** The service's 2-second beat: the step sample when due, and the notification when it changed. */
    @Synchronized
    fun onTick(context: Context, now: Long, sampleSteps: Boolean): WalkRecorder? {
        val current = walkOf(context) ?: return null
        if (current.phase == WalkPhase.ENDED) return current
        if (sampleSteps) record(context, current.sampleSteps(now))
        refreshNotification(context, current, now)
        return current
    }

    /** The foreground service types the walk needs and may use now; 0 when it needs none. */
    fun serviceTypes(context: Context, walk: WalkRecorder?): Int {
        var types = 0
        if (walk == null || walk.recordsLocation) {
            if (granted(context, Manifest.permission.ACCESS_FINE_LOCATION)) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        }
        if (walk == null || walk.countsSteps) {
            if (stepsAllowed(context)) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
        }
        return types
    }

    fun granted(context: Context, permission: String): Boolean =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    /** The step counter needs the activity permission from Android 10. */
    fun stepsAllowed(context: Context): Boolean =
        Build.VERSION.SDK_INT < API_ACTIVITY_PERMISSION || granted(context, Manifest.permission.ACTIVITY_RECOGNITION)

    /**
     * Keeps a running or paused walk recorded: starts the service when the walk has something to
     * sense and the service is not running (only allowed while the app is in front or from the
     * notification), and shows the walk's notification. A walk with neither GPS nor steps needs
     * no service: its time comes from its timestamps.
     */
    private fun keepRecording(context: Context, now: Long) {
        val current = walk ?: return
        if (current.phase == WalkPhase.ENDED) return
        if (!WalkService.isRunning && serviceTypes(context, current) != 0) {
            try {
                ContextCompat.startForegroundService(context, Intent(context, WalkService::class.java))
            } catch (error: RuntimeException) {
                Log.w(LOG_TAG, "walk service not started (${error.javaClass.simpleName})")
            }
        }
        shownKey = null
        refreshNotification(context, current, now)
    }

    private fun refreshNotification(context: Context, current: WalkRecorder, now: Long) {
        val key = WalkNotifications.keyOf(context, current, now)
        if (key == shownKey) return
        shownKey = key
        WalkNotifications.show(context, WalkNotifications.WALK_ID, WalkNotifications.walkNotification(context, current, now))
    }
}
