package app.platewise.android.health

import androidx.health.connect.client.records.MealType
import java.time.Duration
import java.time.Instant
import java.time.format.DateTimeParseException

/** Longest client id we pass on; ours are UUIDs, far shorter. */
const val MAX_CLIENT_ID_LENGTH = 200

/** Health Connect's upper limits for these fields. */
const val MAX_ENERGY_KCAL = 100_000.0
const val MAX_MACRO_GRAMS = 100_000.0
const val MAX_WEIGHT_KG = 1_000.0

/** A meal is written as a one-minute interval from its time: Health Connect needs an interval. */
val MEAL_DURATION: Duration = Duration.ofMinutes(1)

/** The contract's meal types and the Health Connect constant each one is written as. */
enum class MealSlot(val wire: String, val healthConnectType: Int) {
    BREAKFAST("breakfast", MealType.MEAL_TYPE_BREAKFAST),
    LUNCH("lunch", MealType.MEAL_TYPE_LUNCH),
    DINNER("dinner", MealType.MEAL_TYPE_DINNER),
    SNACK("snack", MealType.MEAL_TYPE_SNACK),
}

/** One meal, checked and ready to write. */
data class NutritionWrite(
    val clientId: String,
    val start: Instant,
    val name: String?,
    val mealType: Int,
    val kcal: Double,
    val proteinG: Double?,
    val carbsG: Double?,
    val fatG: Double?,
) {
    val end: Instant get() = start.plus(MEAL_DURATION)
}

/** One weigh-in, checked and ready to write. */
data class WeightWrite(val clientId: String, val time: Instant, val kg: Double)

private fun clientIdOf(value: Any?, field: String): String {
    val id = value as? String ?: invalidInput("$field must be a string")
    if (id.isBlank()) invalidInput("$field is empty")
    if (id.length > MAX_CLIENT_ID_LENGTH) invalidInput("$field is longer than $MAX_CLIENT_ID_LENGTH characters")
    return id
}

/** An ISO-8601 instant that is not in the future: Health Connect keeps what already happened. */
private fun pastInstantOf(value: Any?, field: String, now: Instant): Instant {
    val text = value as? String ?: invalidInput("$field must be an ISO-8601 time")
    val instant = try {
        Instant.parse(text)
    } catch (_: DateTimeParseException) {
        invalidInput("$field is not an ISO-8601 time: \"$text\"")
    }
    if (instant.isAfter(now)) invalidInput("$field is in the future")
    return instant
}

private fun amountOf(value: Any?, field: String, max: Double): Double {
    val number = (value as? Number)?.toDouble() ?: invalidInput("$field must be a number")
    if (!number.isFinite() || number < 0.0 || number > max) invalidInput("$field must be between 0 and $max")
    return number
}

private fun optionalAmountOf(value: Any?, field: String, max: Double): Double? =
    if (value == null) null else amountOf(value, field, max)

private fun mealTypeOf(value: Any?): Int {
    if (value == null) return MealType.MEAL_TYPE_UNKNOWN
    val name = value as? String ?: invalidInput("mealType must be a string or null")
    return MealSlot.entries.firstOrNull { it.wire == name }?.healthConnectType
        ?: invalidInput("unknown mealType \"$name\"")
}

private fun fieldsOf(value: Any?, what: String): Map<*, *> = value as? Map<*, *> ?: invalidInput("$what must be an object")

/** The `records` of `writeNutrition`, each checked; one bad record stops the whole call. */
fun nutritionWrites(args: Map<String, Any?>, now: Instant): List<NutritionWrite> {
    val records = args["records"] as? List<*> ?: invalidInput("records must be a list")
    val writes = records.mapIndexed { index, raw ->
        val fields = fieldsOf(raw, "records[$index]")
        val at = "records[$index]"
        NutritionWrite(
            clientId = clientIdOf(fields["clientId"], "$at.clientId"),
            start = pastInstantOf(fields["time"], "$at.time", now),
            name = (fields["name"] as? String ?: invalidInput("$at.name must be a string")).trim().ifEmpty { null },
            mealType = mealTypeOf(fields["mealType"]),
            kcal = amountOf(fields["kcal"], "$at.kcal", MAX_ENERGY_KCAL),
            proteinG = optionalAmountOf(fields["proteinG"], "$at.proteinG", MAX_MACRO_GRAMS),
            carbsG = optionalAmountOf(fields["carbsG"], "$at.carbsG", MAX_MACRO_GRAMS),
            fatG = optionalAmountOf(fields["fatG"], "$at.fatG", MAX_MACRO_GRAMS),
        )
    }
    val repeated = writes.groupingBy { it.clientId }.eachCount().filterValues { it > 1 }.keys
    if (repeated.isNotEmpty()) invalidInput("clientId repeated in one call: ${repeated.first()}")
    return writes
}

/** The `{ clientId, time, kg }` of `writeWeight`. */
fun weightWrite(args: Map<String, Any?>, now: Instant): WeightWrite {
    val kg = amountOf(args["kg"], "kg", MAX_WEIGHT_KG)
    if (kg <= 0.0) invalidInput("kg must be more than 0")
    return WeightWrite(
        clientId = clientIdOf(args["clientId"], "clientId"),
        time = pastInstantOf(args["time"], "time", now),
        kg = kg,
    )
}

/** The `clientIds` of the delete calls, without repeats. */
fun clientIdsToDelete(args: Map<String, Any?>): List<String> {
    val ids = args["clientIds"] as? List<*> ?: invalidInput("clientIds must be a list")
    return ids.mapIndexed { index, id -> clientIdOf(id, "clientIds[$index]") }.distinct()
}

/**
 * Client record versions that only grow. Health Connect keeps a record written under a client
 * id until a write with a higher version replaces it, so each write takes the clock in
 * milliseconds, or one more than the last version when the clock has not moved on (or went back).
 */
class VersionClock(private val clock: () -> Long = System::currentTimeMillis) {
    private var last = 0L

    @Synchronized
    fun next(): Long {
        val version = maxOf(clock(), last + 1)
        last = version
        return version
    }
}
