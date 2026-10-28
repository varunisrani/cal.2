package app.platewise.android.walk

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import app.platewise.android.R
import java.text.NumberFormat

private const val LOG_TAG = "PlatewiseWalk"

/**
 * The walk's notifications on their own channel: "Walk in progress" (or paused) while a walk is
 * recorded, which is also the foreground service's notification, and "Walk ended" after Stop was
 * tapped there. Tapping either opens the app.
 */
internal object WalkNotifications {
    const val CHANNEL_ID = "platewise-walk"

    /** Outside the reminders' ids (11 to 9 000). */
    const val WALK_ID = 15_001
    const val ENDED_ID = 15_002

    private const val ACTION_REQUEST_PAUSE = 1
    private const val ACTION_REQUEST_RESUME = 2
    private const val ACTION_REQUEST_STOP = 3

    @Volatile
    private var channelReady = false

    fun ensureChannel(context: Context) {
        if (channelReady) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.walk_channel_name),
            NotificationManager.IMPORTANCE_LOW,
        )
        channel.description = context.getString(R.string.walk_channel_description)
        channel.setShowBadge(false)
        manager.createNotificationChannel(channel)
        channelReady = true
    }

    private fun openApp(context: Context): PendingIntent? {
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(
            context,
            0,
            launch,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }

    private fun action(context: Context, requestCode: Int, action: String): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            requestCode,
            Intent(context, WalkActionReceiver::class.java).setAction(action),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

    /** What the walk's line says: its distance when GPS is recorded, its steps when counted. */
    fun detailOf(context: Context, walk: WalkRecorder): String {
        val locale = context.resources.configuration.locales[0]
        val parts = ArrayList<String>()
        if (walk.recordsLocation) parts += distanceText(walk.distanceM, usesMiles(locale.country), locale)
        if (walk.countsSteps) {
            val count = walk.stepCount
            val formatted = NumberFormat.getIntegerInstance(locale).format(count)
            parts += context.resources.getQuantityString(R.plurals.walk_steps, count.coerceAtMost(Int.MAX_VALUE.toLong()).toInt(), formatted)
        }
        return parts.joinToString(" · ")
    }

    /**
     * The notification for [walk] at [now] (a placeholder when there is none: the service must
     * show one before it can stop). Running, Android's own chronometer counts the time.
     */
    fun walkNotification(context: Context, walk: WalkRecorder?, now: Long): Notification {
        ensureChannel(context)
        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_platewise)
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(openApp(context))
        if (walk == null) return builder.setContentTitle(context.getString(R.string.walk_running_title)).build()
        val detail = detailOf(context, walk)
        if (walk.phase == WalkPhase.RUNNING) {
            builder.setContentTitle(context.getString(R.string.walk_running_title))
                .setContentText(detail.ifEmpty { null })
                .setUsesChronometer(true)
                .setShowWhen(true)
                .setWhen(now - walk.activeMillis(now))
                .addAction(0, context.getString(R.string.walk_pause), action(context, ACTION_REQUEST_PAUSE, WalkActionReceiver.ACTION_PAUSE))
        } else {
            val elapsed = elapsedText(walk.activeMillis(now))
            builder.setContentTitle(context.getString(R.string.walk_paused_title))
                .setContentText(listOf(elapsed, detail).filter { it.isNotEmpty() }.joinToString(" · "))
                .setShowWhen(false)
                .addAction(0, context.getString(R.string.walk_resume), action(context, ACTION_REQUEST_RESUME, WalkActionReceiver.ACTION_RESUME))
        }
        builder.addAction(0, context.getString(R.string.walk_stop), action(context, ACTION_REQUEST_STOP, WalkActionReceiver.ACTION_STOP))
        return builder.build()
    }

    /** What the walk notification shows, to post it again only when that changed. */
    fun keyOf(context: Context, walk: WalkRecorder, now: Long): String {
        val clock = if (walk.phase == WalkPhase.RUNNING) (now - walk.activeMillis(now)) / 1_000 else walk.activeMillis(now) / 1_000
        return "${walk.id}|${walk.phase}|$clock|${detailOf(context, walk)}"
    }

    fun endedNotification(context: Context, walk: WalkRecorder, now: Long): Notification {
        ensureChannel(context)
        val summary = listOf(elapsedText(walk.activeMillis(now)), detailOf(context, walk)).filter { it.isNotEmpty() }
        return NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_platewise)
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            .setContentTitle(context.getString(R.string.walk_ended_title))
            .setContentText(summary.joinToString(" · "))
            .setStyle(
                NotificationCompat.BigTextStyle()
                    .bigText(summary.joinToString(" · ") + "\n" + context.getString(R.string.walk_ended_text)),
            )
            .setSilent(true)
            .setAutoCancel(true)
            .setContentIntent(openApp(context))
            .build()
    }

    /** Posts [notification]; without the notification permission Android shows nothing. */
    fun show(context: Context, id: Int, notification: Notification) {
        val manager = NotificationManagerCompat.from(context)
        if (!manager.areNotificationsEnabled()) return
        try {
            manager.notify(id, notification)
        } catch (error: SecurityException) {
            Log.w(LOG_TAG, "walk notification not shown (${error.javaClass.simpleName})")
        }
    }

    fun cancel(context: Context, id: Int) {
        NotificationManagerCompat.from(context).cancel(id)
    }
}
