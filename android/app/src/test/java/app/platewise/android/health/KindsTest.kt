package app.platewise.android.health

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class KindsTest {
    @Test
    fun permissionNamesAreTheOnesTheClientLibraryUses() {
        val expected = mapOf(
            ReadKind.STEPS.permission to HealthPermission.getReadPermission(StepsRecord::class),
            ReadKind.ACTIVE_CALORIES.permission to HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
            ReadKind.TOTAL_CALORIES.permission to HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
            ReadKind.DISTANCE.permission to HealthPermission.getReadPermission(DistanceRecord::class),
            ReadKind.EXERCISE.permission to HealthPermission.getReadPermission(ExerciseSessionRecord::class),
            ReadKind.WEIGHT.permission to HealthPermission.getReadPermission(WeightRecord::class),
            WriteKind.NUTRITION.permission to HealthPermission.getWritePermission(NutritionRecord::class),
            WriteKind.WEIGHT.permission to HealthPermission.getWritePermission(WeightRecord::class),
        )
        expected.forEach { (ours, library) -> assertEquals(library, ours) }
    }

    @Test
    fun grantsBecomeKindsInContractOrderIgnoringOtherPermissions() {
        val granted = setOf(
            WriteKind.WEIGHT.permission,
            ReadKind.WEIGHT.permission,
            ReadKind.STEPS.permission,
            "android.permission.health.READ_HEART_RATE",
            "android.permission.CAMERA",
        )
        val wire = KindSet.fromGranted(granted).toWire()
        assertEquals(listOf("steps", "weight"), wire["read"])
        assertEquals(listOf("weight"), wire["write"])
    }

    @Test
    fun nothingGrantedIsTwoEmptyLists() {
        assertEquals(mapOf("read" to emptyList<String>(), "write" to emptyList<String>()), KindSet.fromGranted(emptySet()).toWire())
    }

    @Test
    fun aRequestNamesKindsAndTheirPermissions() {
        val asked = KindSet.fromRequest(mapOf("read" to listOf("distance", "steps", "steps"), "write" to listOf("nutrition")))
        assertEquals(setOf(ReadKind.DISTANCE, ReadKind.STEPS), asked.read)
        assertEquals(
            setOf(ReadKind.DISTANCE.permission, ReadKind.STEPS.permission, WriteKind.NUTRITION.permission),
            asked.permissions,
        )
    }

    @Test
    fun aMissingListAsksForNothing() {
        val asked = KindSet.fromRequest(mapOf("read" to listOf("weight")))
        assertTrue(asked.write.isEmpty())
        assertEquals(setOf(ReadKind.WEIGHT), asked.read)
    }

    @Test
    fun unknownOrMistypedKindsAreInvalidInput() {
        for (args in listOf(
            mapOf("read" to listOf("heartRate")),
            mapOf("write" to listOf("steps")),
            mapOf("read" to "steps"),
            mapOf("read" to listOf(3)),
        )) {
            val failure = assertThrows(HealthFailure::class.java) { KindSet.fromRequest(args) }
            assertEquals(FailureCode.INVALID_INPUT, failure.code)
        }
    }

    @Test
    fun availabilityFollowsTheSdkStatus() {
        val available = HealthConnectClient.SDK_AVAILABLE
        val update = HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED
        val unavailable = HealthConnectClient.SDK_UNAVAILABLE
        assertEquals(Availability.AVAILABLE, availabilityOf(available, 30, providerInstalled = true))
        assertEquals(Availability.AVAILABLE, availabilityOf(available, 35, providerInstalled = false))
        // Android 9-13: the client says "update required" for a missing app too.
        assertEquals(Availability.NOT_INSTALLED, availabilityOf(update, 31, providerInstalled = false))
        assertEquals(Availability.UPDATE_REQUIRED, availabilityOf(update, 31, providerInstalled = true))
        // Android 14+: Health Connect is part of the system; the old app package does not matter.
        assertEquals(Availability.UPDATE_REQUIRED, availabilityOf(update, 34, providerInstalled = false))
        assertEquals(Availability.NOT_SUPPORTED, availabilityOf(unavailable, 26, providerInstalled = false))
        assertEquals(Availability.NOT_SUPPORTED, availabilityOf(unavailable, 34, providerInstalled = false))
    }

    @Test
    fun settingsOpenOurAccessPageFromAndroid14() {
        val targets = healthScreenTargets(Availability.AVAILABLE, 34, "app.platewise.android")
        assertEquals("android.health.connect.action.MANAGE_HEALTH_PERMISSIONS", targets.first().action)
        assertEquals("app.platewise.android", targets.first().extras["android.intent.extra.PACKAGE_NAME"])
        assertEquals("android.health.connect.action.HEALTH_HOME_SETTINGS", targets.last().action)
    }

    @Test
    fun settingsOpenTheHealthConnectAppBeforeAndroid14() {
        val targets = healthScreenTargets(Availability.AVAILABLE, 33, "app.platewise.android")
        assertEquals(listOf("androidx.health.ACTION_HEALTH_CONNECT_SETTINGS"), targets.map { it.action })
    }

    @Test
    fun aMissingOrOldHealthConnectOpensItsStoreListing() {
        for (state in listOf(Availability.NOT_INSTALLED, Availability.UPDATE_REQUIRED)) {
            val targets = healthScreenTargets(state, 30, "app.platewise.android")
            assertEquals(2, targets.size)
            assertEquals("com.android.vending", targets[0].targetPackage)
            assertTrue(targets[0].uri!!.startsWith("market://details?id=$HEALTH_CONNECT_PACKAGE"))
            assertEquals("https://play.google.com/store/apps/details?id=$HEALTH_CONNECT_PACKAGE", targets[1].uri)
        }
    }

    @Test
    fun anUnsupportedPhoneHasNothingToOpen() {
        assertTrue(healthScreenTargets(Availability.NOT_SUPPORTED, 26, "app.platewise.android").isEmpty())
    }
}
