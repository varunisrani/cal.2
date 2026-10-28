package app.platewise.android.health

import androidx.health.connect.client.records.ExerciseSessionRecord
import java.lang.reflect.Modifier
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import kotlin.math.roundToLong

/** A measured amount, or null when it is missing, negative or not a number. */
private fun usable(value: Double?): Double? = value?.takeIf { it.isFinite() && it >= 0.0 }

/** A total rounded to a whole number (steps, kcal, metres), or null when there is none. */
fun wholeOrNull(value: Double?): Long? = usable(value)?.roundToLong()

// --- Daily totals ---------------------------------------------------------------------------

/** One day's totals from Health Connect's per-day aggregation; null where it reported nothing. */
data class DayTotals(
    val steps: Long? = null,
    val activeKcal: Double? = null,
    val totalKcal: Double? = null,
    val distanceM: Double? = null,
)

/** A day of `readDailyTotals`, in the contract's shape. */
data class DailyRow(
    val day: String,
    val steps: Long?,
    val activeKcal: Long?,
    val totalKcal: Long?,
    val distanceM: Long?,
) {
    fun toWire(): Map<String, Any?> = mapOf(
        "day" to day,
        "steps" to steps,
        "activeKcal" to activeKcal,
        "totalKcal" to totalKcal,
        "distanceM" to distanceM,
    )
}

/**
 * One row per day of [range], oldest first. A kind that is not granted is null on every day,
 * and a granted kind is null on a day Health Connect had nothing for; a real zero stays 0.
 */
fun dailyRows(range: DayRange, granted: Set<ReadKind>, totals: Map<LocalDate, DayTotals>): List<DailyRow> =
    range.days.map { day ->
        val found = totals[day] ?: DayTotals()
        fun <T> ifGranted(kind: ReadKind, value: T?): T? = if (kind in granted) value else null
        DailyRow(
            day = dayKeyOf(day),
            steps = ifGranted(ReadKind.STEPS, found.steps?.takeIf { it >= 0 }),
            activeKcal = ifGranted(ReadKind.ACTIVE_CALORIES, wholeOrNull(found.activeKcal)),
            totalKcal = ifGranted(ReadKind.TOTAL_CALORIES, wholeOrNull(found.totalKcal)),
            distanceM = ifGranted(ReadKind.DISTANCE, wholeOrNull(found.distanceM)),
        )
    }

// --- Exercise sessions ----------------------------------------------------------------------

/** What the plugin keeps of one exercise session record. */
data class SessionFacts(
    val id: String,
    val origin: String,
    val typeCode: Int,
    val title: String?,
    val start: Instant,
    val end: Instant,
    val startOffset: ZoneOffset?,
)

/** A session of `readExerciseSessions`, in the contract's shape. */
data class SessionRow(
    val id: String,
    val day: String,
    val start: String,
    val end: String,
    val type: String,
    val title: String?,
    val activeKcal: Long?,
    val source: String,
) {
    fun toWire(): Map<String, Any?> = mapOf(
        "id" to id,
        "day" to day,
        "start" to start,
        "end" to end,
        "type" to type,
        "title" to title,
        "activeKcal" to activeKcal,
        "source" to source,
    )
}

/**
 * The sessions to show, oldest first: those another app wrote, that start on a day of [range]
 * and that end after they start. Platewise's own records (by data origin) and rows without an
 * id are left out.
 */
fun foreignSessions(
    sessions: List<SessionFacts>,
    ownPackage: String,
    range: DayRange,
    phoneZone: ZoneId,
): List<SessionFacts> = sessions
    .filter { it.origin != ownPackage && it.id.isNotBlank() && it.end.isAfter(it.start) }
    .filter { localDayOf(it.start, it.startOffset, phoneZone) in range }
    .sortedWith(compareBy<SessionFacts> { it.start }.thenBy { it.id })

fun sessionRow(session: SessionFacts, activeKcal: Long?, phoneZone: ZoneId): SessionRow = SessionRow(
    id = session.id,
    day = dayKeyOf(localDayOf(session.start, session.startOffset, phoneZone)),
    start = session.start.toString(),
    end = session.end.toString(),
    type = ExerciseTypeNames.nameOf(session.typeCode),
    title = session.title?.trim()?.takeIf { it.isNotEmpty() },
    activeKcal = activeKcal,
    source = session.origin,
)

/**
 * A session's active calories: what the app that recorded the session measured over its time,
 * else what any app measured over that time (a watch often records the burn while a phone app
 * holds the session). The second read runs only when the first finds nothing.
 */
suspend fun sessionCalories(
    fromRecordingApp: suspend () -> Double?,
    fromAnyApp: suspend () -> Double?,
): Long? {
    wholeOrNull(fromRecordingApp())?.takeIf { it > 0 }?.let { return it }
    return wholeOrNull(fromAnyApp())?.takeIf { it > 0 }
}

/**
 * Exercise type names for the contract's `type`: the Health Connect constant's name in camel
 * case (`EXERCISE_TYPE_STRENGTH_TRAINING` → `strengthTraining`). "Other workout" and numbers
 * this client does not know read as `other`.
 */
object ExerciseTypeNames {
    private const val CONSTANT_PREFIX = "EXERCISE_TYPE_"
    const val OTHER = "other"

    private val byCode: Map<Int, String> by lazy {
        ExerciseSessionRecord::class.java.fields
            .filter { Modifier.isStatic(it.modifiers) && it.type == Int::class.javaPrimitiveType }
            .filter { it.name.startsWith(CONSTANT_PREFIX) }
            .associate { it.getInt(null) to camelCase(it.name.removePrefix(CONSTANT_PREFIX)) }
    }

    fun nameOf(code: Int): String = byCode[code]?.takeUnless { it == "otherWorkout" } ?: OTHER

    /** `HIGH_INTENSITY_INTERVAL_TRAINING` → `highIntensityIntervalTraining`. */
    fun camelCase(constant: String): String = constant.lowercase().split('_')
        .filter { it.isNotEmpty() }
        .mapIndexed { index, word -> if (index == 0) word else word.replaceFirstChar { it.uppercaseChar() } }
        .joinToString("")
}

// --- Weights --------------------------------------------------------------------------------

/** What the plugin keeps of one weight record. */
data class WeightFacts(
    val id: String,
    val origin: String,
    val time: Instant,
    val offset: ZoneOffset?,
    val kg: Double,
)

/** A weigh-in of `readWeights`, in the contract's shape. */
data class WeightRow(val id: String, val time: String, val kg: Double, val source: String) {
    fun toWire(): Map<String, Any?> = mapOf("id" to id, "time" to time, "kg" to kg, "source" to source)
}

/**
 * Other apps' weigh-ins on the days of [range], oldest first, in kilograms to the gram
 * (Health Connect stores grams, so the double can carry noise past the third decimal).
 */
fun weightRows(weights: List<WeightFacts>, ownPackage: String, range: DayRange, phoneZone: ZoneId): List<WeightRow> =
    weights
        .filter { it.origin != ownPackage && it.id.isNotBlank() && it.kg.isFinite() && it.kg > 0.0 }
        .filter { localDayOf(it.time, it.offset, phoneZone) in range }
        .sortedWith(compareBy<WeightFacts> { it.time }.thenBy { it.id })
        .map { WeightRow(it.id, it.time.toString(), (it.kg * 1000).roundToLong() / 1000.0, it.origin) }

// --- Heart rate -----------------------------------------------------------------------------

/** Health Connect's range for a heart-rate sample, in beats per minute. */
val HEART_RATE_RANGE: LongRange = 1L..300L

/** One heart-rate sample as Health Connect holds it (any app's). */
data class HeartRateFacts(val time: Instant, val bpm: Long)

/** A sample of `readHeartRate`, in the contract's shape. */
data class HeartRateRow(val time: String, val bpm: Long) {
    fun toWire(): Map<String, Any?> = mapOf("t" to time, "bpm" to bpm)
}

/**
 * The samples inside [window], oldest first. Records that only overlap the window bring samples
 * from outside it, which are left out, as are values Health Connect would not hold.
 */
fun heartRateRows(samples: List<HeartRateFacts>, window: TimeWindow): List<HeartRateRow> = samples
    .filter { it.time in window && it.bpm in HEART_RATE_RANGE }
    .sortedWith(compareBy<HeartRateFacts> { it.time }.thenBy { it.bpm })
    .map { HeartRateRow(it.time.toString(), it.bpm) }

// --- Paging ---------------------------------------------------------------------------------

/** Pages one read may follow before the plugin gives up on a token that never ends. */
const val MAX_PAGES = 500

/**
 * Every record of a paged read: [readPage] gets the token of the page to read (null for the
 * first) and answers with that page's records and the next token (null after the last page).
 * A failed page fails the whole read, so part of a list never passes for all of it.
 */
suspend fun <T> readEveryPage(readPage: suspend (pageToken: String?) -> Pair<List<T>, String?>): List<T> {
    val records = ArrayList<T>()
    var token: String? = null
    repeat(MAX_PAGES) {
        val (page, next) = readPage(token)
        records += page
        if (next.isNullOrEmpty()) return records
        token = next
    }
    throw IllegalStateException("Health Connect kept returning more pages")
}
