package app.platewise.android.walk

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class WalkFileTest {
    @get:Rule
    val folder = TemporaryFolder()

    private val t0 = 1_793_000_000_000L
    private val start = WalkEvent.Started("walk-1", t0, location = true, steps = true)
    private val point = WalkEvent.Point(RoutePoint(t0 + 2_000, 52.52, 13.405, 6.0), newStretch = true)
    private val sample = WalkEvent.Steps(t0 + 10_000, 12, 4_012)

    private fun file(): File = File(folder.root, "walk/current.walk")

    @Test
    fun aNewWalkIsWrittenAndEventsAreAppended() {
        val store = WalkFile(file())
        assertNull(store.load())
        store.create(listOf(start))
        store.append(listOf(point))
        store.append(emptyList())
        store.append(listOf(sample, WalkEvent.Paused(t0 + 12_000)))
        assertEquals(listOf(start, point, sample, WalkEvent.Paused(t0 + 12_000)), store.load())
        assertEquals(WALK_LOG_HEADER, file().readLines().first())
        assertFalse(File(folder.root, "walk/current.walk.new").exists())
    }

    @Test
    fun aNewWalkReplacesTheOldOne() {
        val store = WalkFile(file())
        store.create(listOf(start, point))
        val next = WalkEvent.Started("walk-2", t0 + 99_000, location = false, steps = true)
        store.create(listOf(next))
        assertEquals(listOf(next), store.load())
    }

    @Test
    fun aTornLastLineIsSkippedAndTheNextEventStartsItsOwnLine() {
        val store = WalkFile(file())
        store.create(listOf(start, point))
        file().appendText("s ${t0 + 10_000} 1")
        assertEquals(listOf(start, point), store.load())
        store.append(listOf(sample))
        assertEquals(listOf(start, point, sample), store.load())
    }

    @Test
    fun aFileWithoutAWalkReadsAsNone() {
        file().parentFile!!.mkdirs()
        file().writeText("something else\n")
        assertNull(WalkFile(file()).load())
    }

    @Test
    fun deleteRemovesTheWalk() {
        val store = WalkFile(file())
        store.create(listOf(start))
        store.delete()
        assertFalse(file().exists())
        assertNull(store.load())
        store.delete()
    }
}
