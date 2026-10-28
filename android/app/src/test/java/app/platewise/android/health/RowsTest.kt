package app.platewise.android.health

import androidx.health.connect.client.records.ExerciseSessionRecord
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class RowsTest {
    private val own = "app.platewise.android"
    private val watch = "com.example.watch"
    private val phoneZone: ZoneId = ZoneId.of("Europe/Berlin")
    private val october = DayRange.fromArgs(mapOf("from" to "2026-10-26", "to" to "2026-10-28"))
    private val everyRead = ReadKind.entries.toSet()

    // --- Daily totals ---

    @Test
    fun everyDayOfTheRangeHasOneRowInOrder() {
        val rows = dailyRows(october, everyRead, mapOf(LocalDate.of(2026, 10, 27) to DayTotals(steps = 8012)))
        assertEquals(listOf("2026-10-26", "2026-10-27", "2026-10-28"), rows.map { it.day })
        assertEquals(listOf(null, 8012L, null), rows.map { it.steps })
    }

    @Test
    fun aKindThatIsNotGrantedIsNullEvenWithData() {
        val totals = mapOf(LocalDate.of(2026, 10, 26) to DayTotals(steps = 100, activeKcal = 250.4, totalKcal = 2100.6, distanceM = 812.5))
        val row = dailyRows(october, setOf(ReadKind.ACTIVE_CALORIES, ReadKind.WEIGHT), totals).first()
        assertEquals(DailyRow("2026-10-26", null, 250L, null, null), row)
    }

    @Test
    fun totalsAreRoundedAndRealZerosKept() {
        val totals = mapOf(LocalDate.of(2026, 10, 28) to DayTotals(steps = 0, activeKcal = 0.0, totalKcal = 1999.5, distanceM = 0.4))
        val row = dailyRows(october, everyRead, totals).last()
        assertEquals(DailyRow("2026-10-28", 0L, 0L, 2000L, 0L), row)
    }

    @Test
    fun negativeOrBrokenValuesCountAsNoData() {
        val totals = mapOf(
            LocalDate.of(2026, 10, 26) to DayTotals(steps = -5, activeKcal = Double.NaN, totalKcal = -1.0, distanceM = Double.POSITIVE_INFINITY),
        )
        assertEquals(DailyRow("2026-10-26", null, null, null, null), dailyRows(october, everyRead, totals).first())
    }

    @Test
    fun aDayOutsideTheRangeIsIgnored() {
        val rows = dailyRows(october, everyRead, mapOf(LocalDate.of(2026, 10, 29) to DayTotals(steps = 4)))
        assertEquals(3, rows.size)
        assertEquals(listOf<Long?>(null, null, null), rows.map { it.steps })
    }

    // --- Sessions ---

    private fun session(id: String, origin: String, start: String, end: String, offset: ZoneOffset? = ZoneOffset.ofHours(1)) =
        SessionFacts(id, origin, ExerciseSessionRecord.EXERCISE_TYPE_RUNNING, "  Morning run ", Instant.parse(start), Instant.parse(end), offset)

    @Test
    fun ownBrokenAndOutOfRangeSessionsAreLeftOutAndTheRestSorted() {
        val sessions = listOf(
            session("b", watch, "2026-10-27T17:00:00Z", "2026-10-27T18:00:00Z"),
            session("ours", own, "2026-10-27T06:00:00Z", "2026-10-27T07:00:00Z"),
            session("a", watch, "2026-10-26T06:00:00Z", "2026-10-26T06:30:00Z"),
            session("backwards", watch, "2026-10-27T09:00:00Z", "2026-10-27T09:00:00Z"),
            session("", watch, "2026-10-27T10:00:00Z", "2026-10-27T11:00:00Z"),
            // 23:30 UTC on the 28th is 00:30 on the 29th at UTC+1: outside the range.
            session("late", watch, "2026-10-28T23:30:00Z", "2026-10-29T00:30:00Z"),
            // 23:30 UTC on the 25th is 00:30 on the 26th at UTC+1: inside.
            session("early", watch, "2026-10-25T23:30:00Z", "2026-10-26T00:10:00Z"),
        )
        val kept = foreignSessions(sessions, own, october, phoneZone)
        assertEquals(listOf("early", "a", "b"), kept.map { it.id })
    }

    @Test
    fun aSessionRowHasTheContractValues() {
        val facts = session("s1", watch, "2026-10-27T06:00:00Z", "2026-10-27T06:45:30Z")
        val row = sessionRow(facts, 412L, phoneZone)
        assertEquals(
            SessionRow("s1", "2026-10-27", "2026-10-27T06:00:00Z", "2026-10-27T06:45:30Z", "running", "Morning run", 412L, watch),
            row,
        )
        assertNull(sessionRow(facts.copy(title = "   "), null, phoneZone).title)
    }

    @Test
    fun aSessionWithoutAnOffsetTakesThePhonesDay() {
        val facts = session("s2", watch, "2026-10-26T23:30:00Z", "2026-10-27T00:30:00Z", offset = null)
        // Berlin is UTC+1 after 25 October: 00:30 on the 27th.
        assertEquals("2026-10-27", sessionRow(facts, null, phoneZone).day)
    }

    @Test
    fun exerciseTypesAreNamedInCamelCaseAndUnknownOnesAreOther() {
        assertEquals("running", ExerciseTypeNames.nameOf(ExerciseSessionRecord.EXERCISE_TYPE_RUNNING))
        assertEquals("strengthTraining", ExerciseTypeNames.nameOf(ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING))
        assertEquals(
            "highIntensityIntervalTraining",
            ExerciseTypeNames.nameOf(ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING),
        )
        assertEquals("bikingStationary", ExerciseTypeNames.nameOf(ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY))
        assertEquals("other", ExerciseTypeNames.nameOf(ExerciseSessionRecord.EXERCISE_TYPE_OTHER_WORKOUT))
        assertEquals("other", ExerciseTypeNames.nameOf(9_999))
        assertEquals("frisbeeDisc", ExerciseTypeNames.camelCase("FRISBEE_DISC"))
    }

    @Test
    fun sessionCaloriesComeFromTheRecordingAppFirst() = runBlocking {
        var askedEveryApp = 0
        val kcal = sessionCalories(fromRecordingApp = { 312.6 }, fromAnyApp = { askedEveryApp++; 999.0 })
        assertEquals(313L, kcal)
        assertEquals(0, askedEveryApp)
    }

    @Test
    fun sessionCaloriesFallBackToEveryAppWhenTheRecordingAppHasNone() = runBlocking {
        assertEquals(180L, sessionCalories(fromRecordingApp = { null }, fromAnyApp = { 180.2 }))
        assertEquals(180L, sessionCalories(fromRecordingApp = { 0.0 }, fromAnyApp = { 180.2 }))
        assertNull(sessionCalories(fromRecordingApp = { 0.0 }, fromAnyApp = { 0.3 }))
        assertNull(sessionCalories(fromRecordingApp = { Double.NaN }, fromAnyApp = { null }))
    }

    // --- Weights ---

    @Test
    fun weightsLeaveOutOurOwnAndBrokenOnesAndAreSortedToTheGram() {
        val weights = listOf(
            WeightFacts("w2", watch, Instant.parse("2026-10-28T06:00:00Z"), ZoneOffset.ofHours(1), 72.30000000001),
            WeightFacts("mine", own, Instant.parse("2026-10-27T06:00:00Z"), ZoneOffset.ofHours(1), 72.0),
            WeightFacts("w1", "com.example.scale", Instant.parse("2026-10-26T06:00:00Z"), null, 72.4567),
            WeightFacts("zero", watch, Instant.parse("2026-10-27T07:00:00Z"), null, 0.0),
            WeightFacts("before", watch, Instant.parse("2026-10-25T06:00:00Z"), null, 73.0),
        )
        val rows = weightRows(weights, own, october, phoneZone)
        assertEquals(
            listOf(
                WeightRow("w1", "2026-10-26T06:00:00Z", 72.457, "com.example.scale"),
                WeightRow("w2", "2026-10-28T06:00:00Z", 72.3, watch),
            ),
            rows,
        )
    }

    // --- Paging ---

    @Test
    fun aPagedReadFollowsEveryToken() = runBlocking {
        val pages = mapOf(null to (listOf(1, 2) to "p2"), "p2" to (listOf(3) to "p3"), "p3" to (listOf(4) to null))
        val asked = mutableListOf<String?>()
        val all = readEveryPage { token -> asked += token; pages.getValue(token) }
        assertEquals(listOf(1, 2, 3, 4), all)
        assertEquals(listOf(null, "p2", "p3"), asked)
    }

    @Test
    fun aFailedPageFailsTheWholeRead() {
        assertThrows(IllegalStateException::class.java) {
            runBlocking {
                readEveryPage { token -> if (token == null) listOf(1) to "p2" else throw IllegalStateException("page") }
            }
        }
    }

    @Test
    fun aTokenThatNeverEndsStops() {
        assertThrows(IllegalStateException::class.java) {
            runBlocking { readEveryPage { listOf(1) to "again" } }
        }
    }

    // --- Heart rate ---

    @Test
    fun heartRateKeepsTheWindowsSamplesInOrder() {
        val window = TimeWindow.fromArgs(mapOf("start" to "2026-10-27T07:00:00Z", "end" to "2026-10-27T07:30:00Z"))
        fun at(time: String, bpm: Long) = HeartRateFacts(Instant.parse(time), bpm)
        val rows = heartRateRows(
            listOf(
                at("2026-10-27T07:10:00Z", 121),
                at("2026-10-27T06:59:59Z", 88), // the record began before the walk
                at("2026-10-27T07:00:00Z", 96),
                at("2026-10-27T07:30:00Z", 110),
                at("2026-10-27T07:30:01Z", 101),
                at("2026-10-27T07:05:00Z", 0), // not a heart rate
                at("2026-10-27T07:06:00Z", 301),
                at("2026-10-27T07:10:00Z", 119), // a second source at the same time
            ),
            window,
        )
        assertEquals(
            listOf("2026-10-27T07:00:00Z" to 96L, "2026-10-27T07:10:00Z" to 119L, "2026-10-27T07:10:00Z" to 121L, "2026-10-27T07:30:00Z" to 110L),
            rows.map { it.time to it.bpm },
        )
        assertEquals(mapOf("t" to "2026-10-27T07:00:00Z", "bpm" to 96L), rows.first().toWire())
    }
}
