package app.platewise.android.health

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class DayKeysTest {
    private fun invalid(block: () -> Unit) {
        val failure = assertThrows(HealthFailure::class.java) { block() }
        assertEquals(FailureCode.INVALID_INPUT, failure.code)
    }

    @Test
    fun parsesOnlyRealDaysInIsoForm() {
        assertEquals(LocalDate.of(2024, 2, 29), parseDayKey("2024-02-29", "from"))
        for (bad in listOf("2026-02-29", "2026-13-01", "2026-1-5", "26-10-27", "2026-10-27T00:00", " 2026-10-27", "", null, 20261027)) {
            invalid { parseDayKey(bad, "from") }
        }
    }

    @Test
    fun aRangeListsEveryDayOnceInOrder() {
        val range = DayRange.fromArgs(mapOf("from" to "2026-02-27", "to" to "2026-03-02"))
        assertEquals(listOf("2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"), range.days.map(::dayKeyOf))
        assertEquals(1, DayRange.fromArgs(mapOf("from" to "2026-10-27", "to" to "2026-10-27")).days.size)
    }

    @Test
    fun aRangeIsAskedForInLocalTimeFromMidnightToMidnight() {
        val range = DayRange.fromArgs(mapOf("from" to "2026-10-01", "to" to "2026-10-30"))
        assertEquals(LocalDateTime.of(2026, 10, 1, 0, 0), range.localStart)
        assertEquals(LocalDateTime.of(2026, 10, 31, 0, 0), range.localEnd)
        assertTrue(LocalDate.of(2026, 10, 30) in range)
        assertFalse(LocalDate.of(2026, 10, 31) in range)
        assertFalse(LocalDate.of(2026, 9, 30) in range)
    }

    @Test
    fun rejectsReversedMissingAndOverlongRanges() {
        invalid { DayRange.fromArgs(mapOf("from" to "2026-10-27", "to" to "2026-10-26")) }
        invalid { DayRange.fromArgs(mapOf("from" to "2026-10-27")) }
        invalid { DayRange.fromArgs(mapOf("from" to "2025-01-01", "to" to "2026-01-02")) }
        assertEquals(366, DayRange.fromArgs(mapOf("from" to "2024-01-01", "to" to "2024-12-31")).days.size)
    }

    @Test
    fun anInstantFallsOnTheDayOfTheClockItWasRecordedWith() {
        val instant = Instant.parse("2026-10-27T22:30:00Z")
        val london = ZoneId.of("Europe/London")
        // Recorded in New York (UTC-4): still the 27th there, though the phone is now in Kolkata.
        assertEquals(LocalDate.of(2026, 10, 27), localDayOf(instant, ZoneOffset.ofHours(-4), ZoneId.of("Asia/Kolkata")))
        // No offset on the record: the phone's zone decides (London is UTC+0 after 25 October).
        assertEquals(LocalDate.of(2026, 10, 27), localDayOf(instant, null, london))
        assertEquals(LocalDate.of(2026, 10, 28), localDayOf(instant, null, ZoneId.of("Asia/Kolkata")))
    }

    @Test
    fun theDayOfAnInstantFollowsDaylightSavingChanges() {
        val berlin = ZoneId.of("Europe/Berlin")
        // 29 March 2026: clocks go from 02:00 to 03:00 in Berlin, so 22:30 UTC is 00:30 next day.
        assertEquals(LocalDate.of(2026, 3, 30), localDayOf(Instant.parse("2026-03-29T22:30:00Z"), null, berlin))
        // The day before, 23:30 UTC is still 00:30 (UTC+1).
        assertEquals(LocalDate.of(2026, 3, 29), localDayOf(Instant.parse("2026-03-28T23:30:00Z"), null, berlin))
        assertEquals(LocalDate.of(2026, 3, 28), localDayOf(Instant.parse("2026-03-28T22:59:59Z"), null, berlin))
    }

    @Test
    fun aHeartRateWindowIsTwoInstantsAtMostADayApart() {
        val window = TimeWindow.fromArgs(mapOf("start" to "2026-10-27T07:00:00Z", "end" to "2026-10-27T07:45:00Z"))
        assertEquals(Instant.parse("2026-10-27T07:00:00Z"), window.start)
        assertTrue(Instant.parse("2026-10-27T07:45:00Z") in window)
        assertFalse(Instant.parse("2026-10-27T07:45:00.001Z") in window)
        TimeWindow.fromArgs(mapOf("start" to "2026-10-27T07:00:00Z", "end" to "2026-10-28T07:00:00Z"))
        for (args in listOf(
            mapOf("start" to "2026-10-27T07:00:00Z", "end" to "2026-10-27T07:00:00Z"),
            mapOf("start" to "2026-10-27T07:00:00Z", "end" to "2026-10-28T07:00:01Z"),
            mapOf("start" to "2026-10-27", "end" to "2026-10-28T07:00:00Z"),
            mapOf("start" to "2026-10-27T07:00:00Z"),
        )) {
            invalid { TimeWindow.fromArgs(args) }
        }
    }
}
