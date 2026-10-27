package app.platewise.android

import android.os.Bundle
import app.platewise.android.health.HealthConnectPlugin
import com.getcapacitor.BridgeActivity

/** The app's one screen: Capacitor's WebView showing the web build, with our native plugin. */
class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // The bridge starts inside super.onCreate and only knows plugins registered before it.
        registerPlugin(HealthConnectPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
