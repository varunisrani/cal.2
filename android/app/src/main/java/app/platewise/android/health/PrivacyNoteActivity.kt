package app.platewise.android.health

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import app.platewise.android.R

/**
 * The short note on health data that Health Connect opens from its permission screens (the
 * rationale action up to Android 13, the permission-usage alias from Android 14). The text is in
 * res/values/strings.xml.
 */
class PrivacyNoteActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.privacy_note)
    }
}
