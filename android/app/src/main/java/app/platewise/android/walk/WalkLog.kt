package app.platewise.android.walk

import java.time.Instant

/**
 * The walk file's format: one event per line, appended as they happen, so a crash can lose at
 * most a torn last line. The first line names the format and its version:
 *
 *     platewise-walk 1
 *     start <id> <time> <location 0|1> <steps 0|1>
 *     p <time> <lat> <lon> <accuracyM> <new stretch 0|1>
 *     s <time> <steps since start> <step counter, or ->
 *     pause <time>
 *     resume <time>
 *     end <time>
 *
 * Times are epoch milliseconds; numbers use '.' whatever the phone's language.
 */
const val WALK_LOG_HEADER = "platewise-walk 1"

private val WALK_ID = Regex("""[A-Za-z0-9-]{1,64}""")

/** An epoch-millisecond time as the ISO-8601 instant the web app reads (`2026-10-28T07:30:00Z`). */
fun isoTime(epochMillis: Long): String = Instant.ofEpochMilli(epochMillis).toString()

fun isWalkId(value: String): Boolean = WALK_ID.matches(value)

/** What can happen to a walk, in the order it happened. */
sealed interface WalkEvent {
    val time: Long

    data class Started(val id: String, override val time: Long, val location: Boolean, val steps: Boolean) : WalkEvent

    data class Point(val point: RoutePoint, val newStretch: Boolean) : WalkEvent {
        override val time: Long get() = point.time
    }

    /** A step sample: steps since the start, and the counter value they were counted up to. */
    data class Steps(override val time: Long, val total: Long, val counter: Long?) : WalkEvent

    data class Paused(override val time: Long) : WalkEvent

    data class Resumed(override val time: Long) : WalkEvent

    data class Ended(override val time: Long) : WalkEvent
}

private fun flag(value: Boolean): String = if (value) "1" else "0"

fun lineOf(event: WalkEvent): String = when (event) {
    is WalkEvent.Started -> "start ${event.id} ${event.time} ${flag(event.location)} ${flag(event.steps)}"
    is WalkEvent.Point -> event.point.let {
        "p ${it.time} ${it.lat} ${it.lon} ${it.accuracyM} ${flag(event.newStretch)}"
    }
    is WalkEvent.Steps -> "s ${event.time} ${event.total} ${event.counter ?: "-"}"
    is WalkEvent.Paused -> "pause ${event.time}"
    is WalkEvent.Resumed -> "resume ${event.time}"
    is WalkEvent.Ended -> "end ${event.time}"
}

private fun flagOf(text: String): Boolean? = when (text) {
    "1" -> true
    "0" -> false
    else -> null
}

/** The event a line holds, or null for a line that is torn, unknown or out of range. */
fun eventOf(line: String): WalkEvent? {
    val parts = line.trim().split(' ')
    if (parts[0] == "start") {
        if (parts.size != 5 || !isWalkId(parts[1])) return null
        val startTime = parts[2].toLongOrNull()?.takeIf { it > 0L } ?: return null
        return WalkEvent.Started(parts[1], startTime, flagOf(parts[3]) ?: return null, flagOf(parts[4]) ?: return null)
    }
    val time = parts.getOrNull(1)?.toLongOrNull()?.takeIf { it > 0L } ?: return null
    return when (parts[0]) {
        "p" -> {
            if (parts.size != 6) return null
            val fix = Fix(time, parts[2].toDoubleOrNull() ?: return null, parts[3].toDoubleOrNull() ?: return null, parts[4].toDoubleOrNull())
            val point = routePointOf(fix) ?: return null
            WalkEvent.Point(point, flagOf(parts[5]) ?: return null)
        }
        "s" -> {
            if (parts.size != 4) return null
            val total = parts[2].toLongOrNull()?.takeIf { it >= 0L } ?: return null
            val counter = if (parts[3] == "-") null else parts[3].toLongOrNull()?.takeIf { it >= 0L } ?: return null
            WalkEvent.Steps(time, total, counter)
        }
        "pause" -> if (parts.size == 2) WalkEvent.Paused(time) else null
        "resume" -> if (parts.size == 2) WalkEvent.Resumed(time) else null
        "end" -> if (parts.size == 2) WalkEvent.Ended(time) else null
        else -> null
    }
}

/**
 * The events of a walk file, or null when it holds no walk: no header, another format or
 * version, or no start right after the header. Unreadable lines after that are skipped.
 */
fun eventsOf(lines: List<String>): List<WalkEvent>? {
    if (lines.firstOrNull()?.trim() != WALK_LOG_HEADER) return null
    val start = lines.getOrNull(1)?.let(::eventOf) as? WalkEvent.Started ?: return null
    return listOf(start) + lines.drop(2).mapNotNull(::eventOf)
}
