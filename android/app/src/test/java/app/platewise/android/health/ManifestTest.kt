package app.platewise.android.health

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Element

/** The manifest declares what Health Connect needs to list and ask for Platewise's access. */
class ManifestTest {
    private val androidNs = "http://schemas.android.com/apk/res/android"

    private val root: Element by lazy {
        val file = File(System.getProperty("platewise.manifest") ?: "src/main/AndroidManifest.xml")
        val factory = DocumentBuilderFactory.newInstance().apply { isNamespaceAware = true }
        factory.newDocumentBuilder().parse(file).documentElement
    }

    private fun elements(tag: String, under: Element = root): List<Element> {
        val nodes = under.getElementsByTagName(tag)
        return (0 until nodes.length).map { nodes.item(it) as Element }
    }

    private fun Element.android(name: String): String = getAttributeNS(androidNs, name)

    private fun usesPermissions(): Set<String> = elements("uses-permission").map { it.android("name") }.toSet()

    @Test
    fun declaresExactlyTheHealthPermissionsOfTheKinds() {
        val health = usesPermissions().filter { it.startsWith("android.permission.health.") }.toSet()
        val expected = ReadKind.entries.map { it.permission }.toSet() + WriteKind.entries.map { it.permission }
        assertEquals(expected, health)
    }

    @Test
    fun declaresTheCameraForPhotosAndBarcodes() {
        assertTrue("android.permission.CAMERA" in usesPermissions())
        val camera = elements("uses-feature").single { it.android("name") == "android.hardware.camera" }
        assertEquals("false", camera.android("required"))
    }

    @Test
    fun canSeeTheHealthConnectApp() {
        val queries = elements("queries").single()
        val packages = elements("package", queries).map { it.android("name") }
        assertEquals(listOf(HEALTH_CONNECT_PACKAGE), packages)
    }

    @Test
    fun theRationaleActionOpensThePrivacyNote() {
        val activity = elements("activity").single { it.android("name") == ".health.PrivacyNoteActivity" }
        assertEquals("true", activity.android("exported"))
        val actions = elements("action", activity).map { it.android("name") }
        assertEquals(listOf("androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE"), actions)
    }

    @Test
    fun thePermissionUsageAliasOpensThePrivacyNoteForTheSystemOnly() {
        val alias = elements("activity-alias").single()
        assertEquals(".health.PrivacyNoteActivity", alias.android("targetActivity"))
        assertEquals("true", alias.android("exported"))
        assertEquals("android.permission.START_VIEW_PERMISSION_USAGE", alias.android("permission"))
        assertEquals(listOf("android.intent.action.VIEW_PERMISSION_USAGE"), elements("action", alias).map { it.android("name") })
        assertEquals(
            listOf("android.intent.category.HEALTH_PERMISSIONS"),
            elements("category", alias).map { it.android("name") },
        )
    }

    @Test
    fun appDataStaysOutOfCloudBackup() {
        assertEquals("false", elements("application").single().android("allowBackup"))
    }
}
