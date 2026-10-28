package app.platewise.android.walk

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RouteFilterTest {
    private val t0 = 1_793_000_000_000L

    /** About 11.1 m per 0.0001° of latitude. */
    private fun fix(seconds: Int, northSteps: Double, accuracy: Double? = 8.0, east: Double = 0.0) =
        Fix(t0 + seconds * 1_000L, 52.52 + northSteps * 0.0001, 13.405 + east * 0.0001, accuracy)

    @Test
    fun haversineMatchesKnownDistances() {
        // One degree along the equator and 0.0001° along a meridian on the mean-radius sphere.
        assertEquals(111_195.08, haversineM(0.0, 0.0, 0.0, 1.0), 0.01)
        assertEquals(11.1195, haversineM(52.52, 13.405, 52.5201, 13.405), 0.0001)
        assertEquals(0.0, haversineM(52.52, 13.405, 52.52, 13.405), 0.0)
        // Half the world round, with no rounding trouble at the far side.
        assertEquals(Math.PI * 6_371_008.8, haversineM(0.0, 0.0, 0.0, 180.0), 0.01)
    }

    @Test
    fun unusableFixesAreDropped() {
        assertNull(routePointOf(fix(0, 0.0, accuracy = null)))
        assertNull(routePointOf(fix(0, 0.0, accuracy = 50.1)))
        assertNull(routePointOf(fix(0, 0.0, accuracy = Double.NaN)))
        assertNull(routePointOf(fix(0, 0.0, accuracy = -1.0)))
        assertNull(routePointOf(Fix(t0, 91.0, 0.0, 5.0)))
        assertNull(routePointOf(Fix(t0, 0.0, -180.5, 5.0)))
        assertNull(routePointOf(Fix(t0, Double.NaN, 0.0, 5.0)))
        assertNull(routePointOf(Fix(0L, 1.0, 1.0, 5.0)))
        assertEquals(50.0, routePointOf(fix(0, 0.0, accuracy = 50.0))!!.accuracyM, 0.0)
    }

    @Test
    fun keptPointsAreRoundedAsStored() {
        val point = routePointOf(Fix(t0, 52.520_000_123_456, 13.404_999_987_654, 7.849))!!
        assertEquals(52.5200001, point.lat, 0.0)
        assertEquals(13.405, point.lon, 0.0)
        assertEquals(7.8, point.accuracyM, 0.0)
        assertEquals(mapOf("t" to "2026-10-26T07:33:20Z", "lat" to 52.5200001, "lon" to 13.405, "accuracyM" to 7.8), point.toWire())
    }

    @Test
    fun theFirstPointStartsAStretchAndReachablePointsFollowIt() {
        val filter = RouteFilter()
        assertEquals(Kept(listOf(routePointOf(fix(0, 0.0))!!), newStretch = true), filter.offer(fix(0, 0.0)))
        val next = filter.offer(fix(2, 1.0))
        assertEquals(1, next.points.size)
        assertFalse(next.newStretch)
        // Not newer than the last kept point.
        assertEquals(Kept.NONE, filter.offer(fix(2, 2.0)))
        assertEquals(Kept.NONE, filter.offer(fix(1, 2.0)))
    }

    @Test
    fun theSpeedLimitAllowsForBothFixesAccuracy() {
        val a = routePointOf(fix(0, 0.0, accuracy = 10.0))!!
        // 2 s at 8 m/s is 16 m, plus the combined error √(10² + 10²) ≈ 14.14 m: 30.14 m.
        val within = RoutePoint(a.time + 2_000, a.lat + 30.0 / 111_195.08, a.lon, 10.0)
        val beyond = RoutePoint(a.time + 2_000, a.lat + 30.5 / 111_195.08, a.lon, 10.0)
        assertTrue(reachable(a, within))
        assertFalse(reachable(a, beyond))
        assertFalse(reachable(a, a))
    }

    @Test
    fun aLoneSpikeIsNeverKept() {
        val filter = RouteFilter()
        filter.offer(fix(0, 0.0))
        assertEquals(Kept.NONE, filter.offer(fix(2, 50.0)))
        val back = filter.offer(fix(4, 1.0))
        assertEquals(listOf(routePointOf(fix(4, 1.0))!!), back.points)
        assertFalse(back.newStretch)
    }

    @Test
    fun threeAgreeingJumpsAreKeptAsANewStretch() {
        val filter = RouteFilter()
        filter.offer(fix(0, 0.0))
        // 550 m north in 2 s, then walking on from there.
        assertEquals(Kept.NONE, filter.offer(fix(2, 50.0)))
        assertEquals(Kept.NONE, filter.offer(fix(4, 51.0)))
        val confirmed = filter.offer(fix(6, 52.0))
        assertEquals(listOf(50.0, 51.0, 52.0).mapIndexed { i, n -> routePointOf(fix(2 + 2 * i, n))!! }, confirmed.points)
        assertTrue(confirmed.newStretch)
        val after = filter.offer(fix(8, 53.0))
        assertEquals(1, after.points.size)
        assertFalse(after.newStretch)
    }

    @Test
    fun jumpsThatDisagreeStartTheCountAgain() {
        val filter = RouteFilter()
        filter.offer(fix(0, 0.0))
        filter.offer(fix(2, 50.0))
        filter.offer(fix(4, 51.0))
        // Somewhere else again: the two held back no longer count.
        assertEquals(Kept.NONE, filter.offer(fix(6, -60.0)))
        assertEquals(Kept.NONE, filter.offer(fix(8, -61.0)))
        assertEquals(3, filter.offer(fix(10, -62.0)).points.size)
    }

    @Test
    fun afterARestartTheNextFixStartsAStretch() {
        val filter = RouteFilter()
        filter.offer(fix(0, 0.0))
        filter.restart()
        val far = filter.offer(fix(600, 400.0))
        assertEquals(1, far.points.size)
        assertTrue(far.newStretch)
    }
}
