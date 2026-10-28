package app.platewise.android.walk

/** Where a walk is. An ended walk reads as `paused` on the wire, with its `endedAt`. */
enum class WalkPhase(val wire: String) {
    RUNNING("running"),
    PAUSED("paused"),
    ENDED("paused"),
}

/** One step sample as the web app reads it. */
data class StepSampleRow(val time: Long, val steps: Long) {
    fun toWire(): Map<String, Any?> = mapOf("t" to isoTime(time), "steps" to steps)
}

/**
 * One walk: what was recorded and the rules for recording more. Every change goes through an
 * event, the same events the walk file holds, so a walk read back from its file is the walk that
 * was recorded. The live calls answer the events they applied, for the caller to append.
 */
class WalkRecorder private constructor(start: WalkEvent.Started) {
    val id: String = start.id
    val startedAt: Long = start.time

    /** True when the walk records GPS points (location granted and a route asked for). */
    val recordsLocation: Boolean = start.location

    /** True when the walk counts steps (activity allowed and a step counter present). */
    val countsSteps: Boolean = start.steps

    private val points = ArrayList<RoutePoint>()
    private val samples = ArrayList<StepSampleRow>()
    private val filter = RouteFilter()
    private var tally = StepTally()
    private var pausedMillis = 0L
    private var pausedSince: Long? = null
    private var lastTime = start.time

    /** When the walk last started running: fixes taken before it belong to a pause (or to no walk). */
    private var runningSince = start.time

    var endedAt: Long? = null
        private set

    /** Metres walked: the sum along each stretch of kept points, never across a gap. */
    var distanceM: Double = 0.0
        private set

    val phase: WalkPhase
        get() = when {
            endedAt != null -> WalkPhase.ENDED
            pausedSince != null -> WalkPhase.PAUSED
            else -> WalkPhase.RUNNING
        }

    val stepCount: Long get() = tally.total

    /** Time spent walking up to [now] (or the end), without pauses; never negative. */
    fun activeMillis(now: Long): Long {
        val until = endedAt ?: maxOf(now, lastTime)
        val openPause = pausedSince?.let { until - it } ?: 0L
        return (until - startedAt - pausedMillis - openPause).coerceAtLeast(0L)
    }

    private fun apply(event: WalkEvent) {
        if (endedAt != null) return
        when (event) {
            is WalkEvent.Started -> return
            is WalkEvent.Point -> {
                val previous = points.lastOrNull()
                if (previous != null && !event.newStretch) distanceM += haversineM(previous, event.point)
                points += event.point
                filter.anchorAt(event.point)
            }
            is WalkEvent.Steps -> {
                samples += StepSampleRow(event.time, event.total)
                tally = StepTally(event.total, event.counter)
            }
            is WalkEvent.Paused -> if (pausedSince == null) pausedSince = event.time
            is WalkEvent.Resumed -> pausedSince?.let { since ->
                pausedMillis += (event.time - since).coerceAtLeast(0L)
                pausedSince = null
                runningSince = event.time
                filter.restart()
            }
            is WalkEvent.Ended -> {
                pausedSince?.let { since -> pausedMillis += (event.time - since).coerceAtLeast(0L) }
                pausedSince = null
                endedAt = event.time
            }
        }
        lastTime = maxOf(lastTime, event.time)
    }

    private fun applyAll(events: List<WalkEvent>): List<WalkEvent> {
        events.forEach(::apply)
        return events
    }

    /** A clock reading no earlier than the last event, so the file's times never go back. */
    private fun clamp(now: Long): Long = maxOf(now, lastTime)

    /** A GPS fix; kept points while the walk runs (see [RouteFilter]). */
    fun offer(fix: Fix): List<WalkEvent> {
        if (phase != WalkPhase.RUNNING || !recordsLocation || fix.time < runningSince) return emptyList()
        val kept = filter.offer(fix)
        return applyAll(kept.points.mapIndexed { index, point -> WalkEvent.Point(point, kept.newStretch && index == 0) })
    }

    /** A step counter reading: counted while running, otherwise it only moves the baseline. */
    fun onStepCounter(counter: Long) {
        if (!countsSteps || endedAt != null) return
        tally.onReading(counter, counting = phase == WalkPhase.RUNNING)
    }

    private fun sampleAt(time: Long): WalkEvent.Steps = WalkEvent.Steps(time, tally.total, tally.baseline)

    /** The 10-second step sample, while the walk runs and counts steps. */
    fun sampleSteps(now: Long): List<WalkEvent> {
        if (phase != WalkPhase.RUNNING || !countsSteps) return emptyList()
        return applyAll(listOf(sampleAt(clamp(now))))
    }

    fun pause(now: Long): List<WalkEvent> {
        if (phase != WalkPhase.RUNNING) return emptyList()
        val time = clamp(now)
        return applyAll(listOfNotNull(sampleAt(time).takeIf { countsSteps }, WalkEvent.Paused(time)))
    }

    fun resume(now: Long): List<WalkEvent> {
        if (phase != WalkPhase.PAUSED) return emptyList()
        val time = clamp(now)
        return applyAll(listOfNotNull(WalkEvent.Resumed(time), sampleAt(time).takeIf { countsSteps }))
    }

    fun end(now: Long): List<WalkEvent> {
        if (phase == WalkPhase.ENDED) return emptyList()
        val time = clamp(now)
        val last = sampleAt(time).takeIf { countsSteps && phase == WalkPhase.RUNNING }
        return applyAll(listOfNotNull(last, WalkEvent.Ended(time)))
    }

    /** The walk in the contract's `WalkSnapshot` shape, plus `endedAt` once it has ended. */
    fun toWire(now: Long): Map<String, Any?> {
        val wire = linkedMapOf<String, Any?>(
            "id" to id,
            "state" to phase.wire,
            "startedAt" to isoTime(startedAt),
            "activeSeconds" to activeMillis(now) / 1000,
            "points" to points.map { it.toWire() },
            "steps" to samples.map { it.toWire() },
            "locationGranted" to recordsLocation,
            "stepsGranted" to countsSteps,
        )
        endedAt?.let { wire["endedAt"] = isoTime(it) }
        return wire
    }

    val pointCount: Int get() = points.size
    val sampleCount: Int get() = samples.size

    companion object {
        /** A new walk and the events that begin its file: the start, and a 0-step sample when counting. */
        fun begin(id: String, now: Long, recordsLocation: Boolean, countsSteps: Boolean): Pair<WalkRecorder, List<WalkEvent>> {
            require(isWalkId(id)) { "walk id must be letters, digits and dashes" }
            val start = WalkEvent.Started(id, now, recordsLocation, countsSteps)
            val walk = WalkRecorder(start)
            return walk to listOf(start) + walk.applyAll(listOfNotNull(walk.sampleAt(now).takeIf { countsSteps }))
        }

        /** The walk a file's events describe; events after its end are ignored. */
        fun replay(events: List<WalkEvent>): WalkRecorder? {
            val start = events.firstOrNull() as? WalkEvent.Started ?: return null
            return WalkRecorder(start).also { walk -> events.drop(1).forEach(walk::apply) }
        }
    }
}
