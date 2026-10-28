package app.platewise.android.walk

import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WalkLogTest {
    private val t0 = 1_793_000_000_000L
    private val id = "6f1c2a7e-0b8d-4c3e-9a51-2d7f0e4b8c19"

    private val events = listOf(
        WalkEvent.Started(id, t0, location = true, steps = false),
        WalkEvent.Point(RoutePoint(t0 + 2_000, 52.5200001, 13.405, 7.8), newStretch = true),
        WalkEvent.Point(RoutePoint(t0 + 4_000, -33.8688197, 151.2092955, 50.0), newStretch = false),
        WalkEvent.Point(RoutePoint(t0 + 5_000, 0.0001, -0.00005, 0.0), newStretch = false),
        WalkEvent.Steps(t0 + 10_000, 0, null),
        WalkEvent.Steps(t0 + 20_000, 37, 48_248),
        WalkEvent.Paused(t0 + 30_000),
        WalkEvent.Resumed(t0 + 90_000),
        WalkEvent.Ended(t0 + 120_000),
    )

    @Test
    fun everyEventSurvivesItsLine() {
        for (event in events) assertEquals(event, eventOf(lineOf(event)))
    }

    @Test
    fun linesLookAsTheFormatSays() {
        assertEquals("start $id $t0 1 0", lineOf(events[0]))
        assertEquals("p ${t0 + 2_000} 52.5200001 13.405 7.8 1", lineOf(events[1]))
        assertEquals("s ${t0 + 10_000} 0 -", lineOf(events[4]))
        assertEquals("s ${t0 + 20_000} 37 48248", lineOf(events[5]))
        assertEquals("pause ${t0 + 30_000}", lineOf(events[6]))
        assertEquals("resume ${t0 + 90_000}", lineOf(events[7]))
        assertEquals("end ${t0 + 120_000}", lineOf(events[8]))
    }

    @Test
    fun numbersUseAPointWhateverThePhonesLanguage() {
        val before = Locale.getDefault()
        try {
            Locale.setDefault(Locale.GERMANY)
            assertEquals("p ${t0 + 2_000} 52.5200001 13.405 7.8 1", lineOf(events[1]))
        } finally {
            Locale.setDefault(before)
        }
    }

    @Test
    fun tornUnknownAndOutOfRangeLinesReadAsNothing() {
        val bad = listOf(
            "",
            "p ${t0 + 2_000} 52.52",
            "p ${t0 + 2_000} 52.52 13.405 7.8 2",
            "p ${t0 + 2_000} 52.52 13.405 75 1",
            "p ${t0 + 2_000} 95 13.405 7 1",
            "s ${t0 + 1} -4 -",
            "s ${t0 + 1} 4 x",
            "s ${t0 + 1} 4",
            "pause",
            "pause 0",
            "pause -5",
            "end soon",
            "resume ${t0} extra",
            "start bad/id $t0 1 1",
            "start $id $t0 yes 1",
            "jump $t0",
        )
        for (line in bad) assertNull(line, eventOf(line))
    }

    @Test
    fun aFileIsAHeaderAStartAndWhatFollows() {
        val lines = listOf(WALK_LOG_HEADER) + events.map(::lineOf)
        assertEquals(events, eventsOf(lines))
        // A torn line in the middle (the process died while appending) is skipped.
        val torn = lines.take(3) + "p 17930000" + lines.drop(3)
        assertEquals(events, eventsOf(torn))
    }

    @Test
    fun withoutTheHeaderOrTheStartThereIsNoWalk() {
        val body = events.map(::lineOf)
        assertNull(eventsOf(emptyList()))
        assertNull(eventsOf(body))
        assertNull(eventsOf(listOf("platewise-walk 2") + body))
        assertNull(eventsOf(listOf(WALK_LOG_HEADER) + body.drop(1)))
        assertEquals(listOf(events[0]), eventsOf(listOf(WALK_LOG_HEADER, body[0], "")))
    }

    @Test
    fun timesBecomeIsoInstants() {
        assertEquals("2026-10-26T07:33:20Z", isoTime(t0))
        assertEquals("2026-10-26T07:33:20.250Z", isoTime(t0 + 250))
    }
}
