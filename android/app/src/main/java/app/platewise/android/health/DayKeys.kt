package app.platewise.android.health

import java.time.DateTimeException
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit

/** The longest range one read may span, in days (a leap year). */
const val MAX_RANGE_DAYS = 366L

private val DAY_KEY_SHAPE = Regex("""\d{4}-\d{2}-\d{2}""")

/** A diary day key (`2026-10-27`) as a date; anything else, or a date that does not exist, is invalid. */
fun parseDayKey(value: Any?, field: String): LocalDate {
    val text = value as? String ?: invalidInput("$field must be a day key (YYYY-MM-DD)")
    if (!DAY_KEY_SHAPE.matches(text)) invalidInput("$field must be a day key (YYYY-MM-DD), not \"$text\"")
    return try {
        LocalDate.parse(text)
    } catch (_: DateTimeException) {
        invalidInput("$field is not a real date: \"$text\"")
    }
}

/** The day key of a date: the ISO form the web app's diary uses. */
fun dayKeyOf(day: LocalDate): String = day.toString()

/**
 * An inclusive range of diary days, as the read calls take it. Health Connect is asked in local
 * time, from the first day's midnight to the midnight after the last day, so each record falls
 * on the day of its own clock.
 */
data class DayRange(val first: LocalDate, val last: LocalDate) {
    init {
        require(!last.isBefore(first)) { "last day before first day" }
    }

    /** Every day of the range, oldest first. */
    val days: List<LocalDate>
        get() = generateSequence(first) { it.plusDays(1) }.takeWhile { !it.isAfter(last) }.toList()

    val localStart: LocalDateTime get() = first.atStartOfDay()
    val localEnd: LocalDateTime get() = last.plusDays(1).atStartOfDay()

    operator fun contains(day: LocalDate): Boolean = !day.isBefore(first) && !day.isAfter(last)

    companion object {
        /** The `{ from, to }` argument of the read calls. */
        fun fromArgs(args: Map<String, Any?>): DayRange {
            val first = parseDayKey(args["from"], "from")
            val last = parseDayKey(args["to"], "to")
            if (last.isBefore(first)) invalidInput("to is before from")
            if (ChronoUnit.DAYS.between(first, last) + 1 > MAX_RANGE_DAYS) {
                invalidInput("a read covers at most $MAX_RANGE_DAYS days")
            }
            return DayRange(first, last)
        }
    }
}

/**
 * The diary day an instant belongs to: the date on the clock it was recorded with when the
 * record carries its zone offset, else the date on the phone's clock. This is the same rule
 * Health Connect's local-time reads use, so a session, a weigh-in and the day totals agree.
 */
fun localDayOf(instant: Instant, recordedOffset: ZoneOffset?, phoneZone: ZoneId): LocalDate =
    instant.atZone(recordedOffset ?: phoneZone).toLocalDate()

/** The longest window one heart-rate read may span. */
val MAX_WINDOW: Duration = Duration.ofHours(24)

/** A span of time between two instants, as `readHeartRate` takes it (a walk's start and end). */
data class TimeWindow(val start: Instant, val end: Instant) {
    operator fun contains(instant: Instant): Boolean = !instant.isBefore(start) && !instant.isAfter(end)

    companion object {
        private fun instantOf(value: Any?, field: String): Instant {
            val text = value as? String ?: invalidInput("$field must be an ISO-8601 time")
            return try {
                Instant.parse(text)
            } catch (_: DateTimeException) {
                invalidInput("$field is not an ISO-8601 time: \"$text\"")
            }
        }

        /** The `{ start, end }` argument of `readHeartRate`. */
        fun fromArgs(args: Map<String, Any?>): TimeWindow {
            val start = instantOf(args["start"], "start")
            val end = instantOf(args["end"], "end")
            if (!end.isAfter(start)) invalidInput("end must be after start")
            if (Duration.between(start, end) > MAX_WINDOW) invalidInput("a read covers at most ${MAX_WINDOW.toHours()} hours")
            return TimeWindow(start, end)
        }
    }
}
