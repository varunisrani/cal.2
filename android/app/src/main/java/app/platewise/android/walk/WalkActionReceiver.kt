package app.platewise.android.walk

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/** The walk notification's buttons: Pause, Resume and Stop, also with the app closed. */
class WalkActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        val now = System.currentTimeMillis()
        try {
            when (intent.action) {
                ACTION_PAUSE -> WalkSession.pause(app, now)
                ACTION_RESUME -> WalkSession.resume(app, now)
                ACTION_STOP -> WalkSession.stop(app, now, fromNotification = true)
            }
        } catch (error: RuntimeException) {
            // A button that did nothing is better than a crash; the walk stays in its file.
            Log.w("PlatewiseWalk", "walk button failed (${error.javaClass.simpleName})")
        }
    }

    companion object {
        const val ACTION_PAUSE = "app.platewise.android.walk.PAUSE"
        const val ACTION_RESUME = "app.platewise.android.walk.RESUME"
        const val ACTION_STOP = "app.platewise.android.walk.STOP"
    }
}
