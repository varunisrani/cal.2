package app.platewise.android.walk

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Element

/** The manifest declares what the walk recorder needs, and nothing that reaches past it. */
class WalkManifestTest {
    private val androidNs = "http://schemas.android.com/apk/res/android"

    private val root: Element by lazy {
        val file = File(System.getProperty("platewise.manifest") ?: "src/main/AndroidManifest.xml")
        val factory = DocumentBuilderFactory.newInstance().apply { isNamespaceAware = true }
        factory.newDocumentBuilder().parse(file).documentElement
    }

    private fun elements(tag: String): List<Element> {
        val nodes = root.getElementsByTagName(tag)
        return (0 until nodes.length).map { nodes.item(it) as Element }
    }

    private fun Element.android(name: String): String = getAttributeNS(androidNs, name)

    private val permissions: Set<String> by lazy { elements("uses-permission").map { it.android("name") }.toSet() }

    @Test
    fun declaresLocationStepsAndTheForegroundServiceTypes() {
        val needed = listOf(
            "ACCESS_FINE_LOCATION",
            "ACCESS_COARSE_LOCATION",
            "ACTIVITY_RECOGNITION",
            "FOREGROUND_SERVICE",
            "FOREGROUND_SERVICE_LOCATION",
            "FOREGROUND_SERVICE_HEALTH",
            "POST_NOTIFICATIONS",
        ).map { "android.permission.$it" }
        assertTrue(permissions.containsAll(needed))
    }

    @Test
    fun neverAsksForBackgroundLocation() {
        assertTrue("android.permission.ACCESS_BACKGROUND_LOCATION" !in permissions)
    }

    @Test
    fun theServiceIsPrivateAndTypedForLocationAndHealth() {
        val service = elements("service").single { it.android("name") == ".walk.WalkService" }
        assertEquals("false", service.android("exported"))
        assertEquals(setOf("location", "health"), service.android("foregroundServiceType").split('|').toSet())
    }

    @Test
    fun theNotificationButtonsReachOnlyOurReceiver() {
        val receiver = elements("receiver").single { it.android("name") == ".walk.WalkActionReceiver" }
        assertEquals("false", receiver.android("exported"))
    }

    @Test
    fun phonesWithoutGpsOrAStepCounterCanStillInstall() {
        val features = elements("uses-feature").associate { it.android("name") to it.android("required") }
        assertEquals("false", features["android.hardware.location.gps"])
        assertEquals("false", features["android.hardware.sensor.stepcounter"])
    }
}
