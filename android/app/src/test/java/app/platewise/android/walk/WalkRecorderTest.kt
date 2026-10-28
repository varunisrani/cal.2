package app.platewise.android.walk

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WalkRecorderTest {
    private val t0 = 1_793_000_000_000L
    private val id = "walk-1"
    private val metresPerStep = 11.1195 // 0.0001° of latitude

    private fun at(seconds: Int): Long = t0 + seconds * 1_000L

    private fun fix(seconds: Int, northSteps: Double) = Fix(at(seconds), 52.52 + northSteps * 0.0001, 13.405, 6.0)

    /** A walk and every event it produced, as the file would hold them. */
    private class Recorded(val walk: WalkRecorder, val events: MutableList<WalkEvent>) {
        fun add(more: List<WalkEvent>) = events.addAll(more)
    }

    private fun begin(location: Boolean = true, steps: Boolean = true): Recorded {
        val (walk, events) = WalkRecorder.begin(id, t0, location, steps)
        return Recorded(walk, events.toMutableList())
    }

    @Test
    fun aNewWalkRunsFromItsStartWithAZeroStepSample() {
        val (walk, events) = WalkRecorder.begin(id, t0, recordsLocation = true, countsSteps = true)
        assertEquals(listOf(WalkEvent.Started(id, t0, true, true), WalkEvent.Steps(t0, 0, null)), events)
        assertEquals(WalkPhase.RUNNING, walk.phase)
        val wire = walk.toWire(at(65))
        assertEquals("walk-1", wire["id"])
        assertEquals("running", wire["state"])
        assertEquals("2026-10-26T07:33:20Z", wire["startedAt"])
        assertEquals(65L, wire["activeSeconds"])
        assertEquals(emptyList<Any>(), wire["points"])
        assertEquals(listOf(mapOf("t" to "2026-10-26T07:33:20Z", "steps" to 0L)), wire["steps"])
        assertEquals(true, wire["locationGranted"])
        assertEquals(true, wire["stepsGranted"])
        assertFalse("endedAt" in wire)
    }

    @Test
    fun aWalkWithoutStepsHasNoSamples() {
        val (walk, events) = WalkRecorder.begin(id, t0, recordsLocation = false, countsSteps = false)
        assertEquals(1, events.size)
        walk.onStepCounter(500)
        walk.onStepCounter(600)
        assertTrue(walk.sampleSteps(at(10)).isEmpty())
        assertEquals(0L, walk.stepCount)
        assertEquals(false, walk.toWire(at(10))["stepsGranted"])
    }

    @Test
    fun pausesAreLeftOutOfTheActiveTime() {
        val walk = begin().walk
        walk.pause(at(60))
        assertEquals(WalkPhase.PAUSED, walk.phase)
        assertEquals(60_000L, walk.activeMillis(at(100)))
        walk.resume(at(90))
        assertEquals(120_000L, walk.activeMillis(at(150)))
        walk.pause(at(200))
        walk.end(at(260))
        assertEquals(170_000L, walk.activeMillis(at(999)))
    }

    @Test
    fun pauseAndResumeTwiceChangeNothing() {
        val walk = begin().walk
        assertEquals(2, walk.pause(at(10)).size)
        assertTrue(walk.pause(at(20)).isEmpty())
        assertEquals(2, walk.resume(at(30)).size)
        assertTrue(walk.resume(at(40)).isEmpty())
        assertEquals(20_000L, walk.activeMillis(at(40)))
    }

    @Test
    fun aClockThatGoesBackNeitherShrinksNorRewindsTheWalk() {
        val walk = begin().walk
        walk.sampleSteps(at(100))
        assertEquals(100_000L, walk.activeMillis(at(50)))
        val pause = walk.pause(at(80))
        assertEquals(WalkEvent.Paused(at(100)), pause.last())
        assertEquals(0L, WalkRecorder.begin(id, t0, false, false).first.activeMillis(t0 - 5_000))
    }

    @Test
    fun pointsAreKeptOnlyWhileRunningAndOnlyWithARoute() {
        val recorded = begin()
        val walk = recorded.walk
        assertEquals(1, walk.offer(fix(2, 0.0)).size)
        walk.pause(at(10))
        assertTrue(walk.offer(fix(12, 1.0)).isEmpty())
        walk.resume(at(20))
        // Taken before the resume: it belongs to the pause.
        assertTrue(walk.offer(fix(19, 1.0)).isEmpty())
        assertEquals(1, walk.offer(fix(22, 1.0)).size)
        assertEquals(2, walk.pointCount)

        val noRoute = begin(location = false).walk
        assertTrue(noRoute.offer(fix(2, 0.0)).isEmpty())
        assertEquals(0, noRoute.pointCount)
    }

    @Test
    fun distanceFollowsEachStretchAndNeverCrossesAPauseOrAJump() {
        val walk = begin().walk
        walk.offer(fix(0, 0.0))
        walk.offer(fix(2, 1.0))
        walk.offer(fix(4, 2.0))
        assertEquals(2 * metresPerStep, walk.distanceM, 0.01)
        walk.pause(at(5))
        walk.resume(at(60))
        // 30 steps north while paused: the new stretch starts there.
        walk.offer(fix(62, 32.0))
        walk.offer(fix(64, 33.0))
        assertEquals(3 * metresPerStep, walk.distanceM, 0.01)
        // A jump of 550 m that three fixes confirm: walked from there on, not across.
        walk.offer(fix(66, 83.0))
        walk.offer(fix(68, 84.0))
        walk.offer(fix(70, 85.0))
        assertEquals(5 * metresPerStep, walk.distanceM, 0.01)
        assertEquals(8, walk.pointCount)
    }

    @Test
    fun stepsCountWhileRunningAndArePutInSamples() {
        val walk = begin().walk
        walk.onStepCounter(10_000)
        walk.onStepCounter(10_018)
        assertEquals(listOf(WalkEvent.Steps(at(10), 18, 10_018)), walk.sampleSteps(at(10)))
        walk.onStepCounter(10_030)
        val pause = walk.pause(at(15))
        assertEquals(listOf(WalkEvent.Steps(at(15), 30, 10_030), WalkEvent.Paused(at(15))), pause)
        assertTrue(walk.sampleSteps(at(20)).isEmpty())
        walk.onStepCounter(10_090)
        val resume = walk.resume(at(30))
        assertEquals(listOf(WalkEvent.Resumed(at(30)), WalkEvent.Steps(at(30), 30, 10_090)), resume)
        walk.onStepCounter(10_100)
        walk.end(at(40))
        assertEquals(40L, walk.stepCount)
        val samples = walk.toWire(at(40))["steps"] as List<*>
        assertEquals(listOf(0L, 18L, 30L, 30L, 40L), samples.map { (it as Map<*, *>)["steps"] })
    }

    @Test
    fun anEndedWalkIsPausedWithItsEndAndTakesNothingMore() {
        val walk = begin().walk
        walk.offer(fix(2, 0.0))
        val end = walk.end(at(100))
        assertEquals(WalkEvent.Ended(at(100)), end.last())
        assertEquals(WalkPhase.ENDED, walk.phase)
        val wire = walk.toWire(at(500))
        assertEquals("paused", wire["state"])
        assertEquals("2026-10-26T07:35:00Z", wire["endedAt"])
        assertEquals(100L, wire["activeSeconds"])
        assertTrue(walk.offer(fix(102, 1.0)).isEmpty())
        assertTrue(walk.pause(at(103)).isEmpty())
        assertTrue(walk.resume(at(104)).isEmpty())
        assertTrue(walk.end(at(105)).isEmpty())
        assertTrue(walk.sampleSteps(at(106)).isEmpty())
        walk.onStepCounter(5)
        walk.onStepCounter(50)
        assertEquals(0L, walk.stepCount)
    }

    @Test
    fun aWalkReadBackFromItsEventsIsTheSameWalkAndCountsOn() {
        val recorded = begin()
        val walk = recorded.walk
        walk.onStepCounter(7_000)
        recorded.add(walk.offer(fix(2, 0.0)))
        recorded.add(walk.offer(fix(4, 1.0)))
        walk.onStepCounter(7_010)
        recorded.add(walk.sampleSteps(at(10)))
        recorded.add(walk.pause(at(12)))
        walk.onStepCounter(7_050)
        recorded.add(walk.resume(at(40)))
        recorded.add(walk.offer(fix(42, 9.0)))
        recorded.add(walk.offer(fix(44, 10.0)))
        walk.onStepCounter(7_065)
        recorded.add(walk.sampleSteps(at(50)))

        val lines = listOf(WALK_LOG_HEADER) + recorded.events.map(::lineOf)
        val again = WalkRecorder.replay(eventsOf(lines)!!)!!
        assertEquals(walk.toWire(at(60)), again.toWire(at(60)))
        assertEquals(walk.distanceM, again.distanceM, 0.0)

        // The step baseline came back with the last sample: the counter goes on from there.
        again.onStepCounter(7_080)
        assertEquals(40L, again.stepCount)
        // So does the GPS anchor: a reachable fix continues the stretch.
        again.offer(fix(46, 11.0))
        assertEquals(walk.distanceM + metresPerStep, again.distanceM, 0.01)
    }

    @Test
    fun replayNeedsAStartAndIgnoresWhatFollowsTheEnd() {
        assertNull(WalkRecorder.replay(emptyList()))
        assertNull(WalkRecorder.replay(listOf(WalkEvent.Paused(t0))))
        val walk = WalkRecorder.replay(
            listOf(
                WalkEvent.Started(id, t0, true, true),
                WalkEvent.Ended(at(30)),
                WalkEvent.Resumed(at(40)),
                WalkEvent.Point(RoutePoint(at(41), 1.0, 1.0, 5.0), newStretch = true),
            ),
        )!!
        assertEquals(WalkPhase.ENDED, walk.phase)
        assertEquals(0, walk.pointCount)
        assertEquals(30_000L, walk.activeMillis(at(100)))
    }
}
