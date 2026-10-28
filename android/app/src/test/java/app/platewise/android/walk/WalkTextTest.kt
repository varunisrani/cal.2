package app.platewise.android.walk

import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WalkTextTest {
    @Test
    fun distancesInKmOrMilesInThePhonesNumberStyle() {
        assertEquals("2.31 km", distanceText(2_314.0, miles = false, Locale.UK))
        assertEquals("1.44 mi", distanceText(2_314.0, miles = true, Locale.US))
        assertEquals("2,31 km", distanceText(2_314.0, miles = false, Locale.GERMANY))
        assertEquals("0.00 km", distanceText(0.0, miles = false, Locale.UK))
    }

    @Test
    fun milesWhereTheRegionUsesThem() {
        assertTrue(usesMiles("US"))
        assertTrue(usesMiles("lr"))
        assertTrue(usesMiles("MM"))
        assertFalse(usesMiles("GB"))
        assertFalse(usesMiles("DE"))
        assertFalse(usesMiles(""))
    }

    @Test
    fun elapsedTimeReadsLikeAClock() {
        assertEquals("0:00", elapsedText(0))
        assertEquals("0:00", elapsedText(-5_000))
        assertEquals("4:05", elapsedText(245_999))
        assertEquals("59:59", elapsedText(3_599_000))
        assertEquals("1:02:03", elapsedText(3_723_000))
    }

    private val asked = mapOf("location" to "prompt-with-rationale", "activity" to "denied", "notifications" to "granted")

    @Test
    fun permissionStatesAreCapacitorsFromAndroid13() {
        assertEquals(asked, walkPermissionStates(34, asked, notificationsOn = true))
        // Allowed, but the app's notifications are switched off in Android's settings.
        assertEquals("denied", walkPermissionStates(34, asked, notificationsOn = false)["notifications"])
    }

    @Test
    fun olderAndroidsHaveNoActivityOrNotificationQuestion() {
        val android9 = walkPermissionStates(28, asked, notificationsOn = true)
        assertEquals("granted", android9["activity"])
        assertEquals("granted", android9["notifications"])
        assertEquals("prompt-with-rationale", android9["location"])
        val android12 = walkPermissionStates(32, mapOf("activity" to "granted"), notificationsOn = false)
        assertEquals(mapOf("location" to "prompt", "activity" to "granted", "notifications" to "denied"), android12)
    }
}
