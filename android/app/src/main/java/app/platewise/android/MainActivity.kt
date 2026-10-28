package app.platewise.android

import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import app.platewise.android.health.HealthConnectPlugin
import com.getcapacitor.BridgeActivity

/** The app's one screen: Capacitor's WebView showing the web build, with our native plugin. */
class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // The bridge starts inside super.onCreate and only knows plugins registered before it.
        registerPlugin(HealthConnectPlugin::class.java)
        super.onCreate(savedInstanceState)
        bridge?.webView?.let(::keepClearOfBarsAndKeyboard)
    }

    /**
     * Keeps the WebView inside the system bars and above the on-screen keyboard. From Android 15
     * the window is edge to edge and is not resized for the keyboard, so the WebView takes the
     * insets as margins itself: top and sides from the bars and the cutout, the bottom from
     * whichever is taller, the keyboard or the navigation bar. This replaces Capacitor's own
     * handler (off in capacitor.config.json), which knew only the bars. Up to Android 14 the
     * window's content frame takes the bars and, with the manifest's adjustResize, the keyboard
     * itself and hands on consumed insets, so every margin stays 0 there.
     */
    private fun keepClearOfBarsAndKeyboard(webView: View) {
        ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
            )
            val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
            val margins = view.layoutParams as ViewGroup.MarginLayoutParams
            margins.setMargins(bars.left, bars.top, bars.right, maxOf(bars.bottom, keyboard.bottom))
            view.layoutParams = margins
            // Consumed, as Capacitor's handler did: the page's safe-area insets stay 0, so
            // nothing is padded twice.
            WindowInsetsCompat.CONSUMED
        }
    }
}
