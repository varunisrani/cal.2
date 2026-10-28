package app.platewise.android.walk

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class StepTallyTest {
    @Test
    fun theFirstReadingIsOnlyTheBaseline() {
        val tally = StepTally()
        assertNull(tally.baseline)
        tally.onReading(48_211, counting = true)
        assertEquals(0L, tally.total)
        assertEquals(48_211L, tally.baseline)
    }

    @Test
    fun laterReadingsAddWhatTheCounterMovedOn() {
        val tally = StepTally()
        listOf(1_000L, 1_012L, 1_012L, 1_090L).forEach { tally.onReading(it, counting = true) }
        assertEquals(90L, tally.total)
    }

    @Test
    fun aCounterThatStartedAgainCountsAllOfItsNewValue() {
        val tally = StepTally(total = 500, baseline = 70_000)
        tally.onReading(35, counting = true)
        assertEquals(535L, tally.total)
        tally.onReading(60, counting = true)
        assertEquals(560L, tally.total)
    }

    @Test
    fun pausedReadingsMoveTheBaselineWithoutCounting() {
        val tally = StepTally()
        tally.onReading(2_000, counting = true)
        tally.onReading(2_100, counting = true)
        tally.onReading(2_400, counting = false)
        tally.onReading(2_410, counting = true)
        assertEquals(110L, tally.total)
    }

    @Test
    fun aTallyReadBackGoesOnFromItsSample() {
        val tally = StepTally(total = 1_234, baseline = 9_000)
        tally.onReading(9_050, counting = true)
        assertEquals(1_284L, tally.total)
        val noReadingYet = StepTally(total = 0, baseline = null)
        noReadingYet.onReading(9_050, counting = true)
        assertEquals(0L, noReadingYet.total)
    }

    @Test
    fun negativeReadingsAreIgnored() {
        val tally = StepTally(total = 10, baseline = 100)
        tally.onReading(-1, counting = true)
        assertEquals(10L, tally.total)
        assertEquals(100L, tally.baseline)
    }
}
