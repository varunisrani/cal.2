package app.platewise.android.drive

import app.platewise.android.PhaseContract
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DriveTest {
    private val contract = PhaseContract("P15-walks-and-drive-backup.md")
    private val methods: Map<String, String> by lazy { contract.methods("DrivePlugin") }

    @Test
    fun googleStatusesBecomeTheContractCodes() {
        val expected = mapOf(
            10 to DriveFailureCode.NOT_CONFIGURED, // DEVELOPER_ERROR: no OAuth client for this package and key
            12_500 to DriveFailureCode.NOT_CONFIGURED, // the older sign-in failure for the same problem
            16 to DriveFailureCode.CANCELLED,
            12_501 to DriveFailureCode.CANCELLED,
            17 to DriveFailureCode.UNAVAILABLE, // API_NOT_CONNECTED
            2 to DriveFailureCode.UNAVAILABLE, // Play services too old
            3 to DriveFailureCode.UNAVAILABLE, // Play services disabled
            7 to DriveFailureCode.UNKNOWN, // NETWORK_ERROR: try again later
            8 to DriveFailureCode.UNKNOWN,
            15 to DriveFailureCode.UNKNOWN,
            4 to DriveFailureCode.UNKNOWN,
            99_999 to DriveFailureCode.UNKNOWN,
        )
        expected.forEach { (status, code) -> assertEquals("status $status", code, driveCodeOfStatus(status)) }
    }

    @Test
    fun aFailureNamesItsStatusAndCode() {
        val failure = driveFailureOfStatus(10)
        assertEquals(DriveFailureCode.NOT_CONFIGURED, failure.code)
        assertTrue(failure.message!!.endsWith("(status 10)"))
    }

    @Test
    fun playServicesMustBeUsable() {
        assertNull(playServicesFailure(0))
        for (state in listOf(1, 2, 3, 9, 18)) assertEquals(DriveFailureCode.UNAVAILABLE, playServicesFailure(state)!!.code)
    }

    @Test
    fun theScopeIsDriveFileOnly() {
        assertEquals("https://www.googleapis.com/auth/drive.file", DRIVE_FILE_SCOPE)
    }

    @Test
    fun theContractMethodsArePluginMethods() {
        val declared = DrivePlugin::class.java.declaredMethods
            .filter { it.isAnnotationPresent(PluginMethod::class.java) }
            .map { it.name }
            .toSet()
        assertEquals(methods.keys, declared)
        assertEquals(setOf("authorize", "signOut"), declared)
    }

    @Test
    fun authorizeTakesAndAnswersTheContractFields() {
        val line = methods.getValue("authorize")
        assertEquals(setOf("interactive"), PhaseContract.objectAfter(line, "o: "))
        assertEquals(PhaseContract.objectAfter(line, "Promise<"), DriveGrant("token", null).toWire().keys)
        assertTrue(line.contains("email: string | null"))
        assertEquals(mapOf("accessToken" to "t", "email" to null), DriveGrant("t", null).toWire())
    }

    @Test
    fun rejectionCodesMatchTheContract() {
        val codes = PhaseContract.quoted(methods.getValue("authorize").substringAfter("rejects"))
        assertEquals(codes, DriveFailureCode.entries.map { it.wire }.toSet())
    }

    @Test
    fun thePluginIsRegisteredAsDrive() {
        assertEquals("Drive", DrivePlugin::class.java.getAnnotation(CapacitorPlugin::class.java)!!.name)
    }
}
