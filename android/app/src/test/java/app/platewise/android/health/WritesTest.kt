package app.platewise.android.health

import androidx.health.connect.client.records.MealType
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class WritesTest {
    private val now = Instant.parse("2026-10-27T12:00:00Z")

    private fun meal(vararg changes: Pair<String, Any?>): Map<String, Any?> = mapOf<String, Any?>(
        "clientId" to "entry-1",
        "time" to "2026-10-27T07:30:00Z",
        "name" to "Porridge with berries",
        "mealType" to "breakfast",
        "kcal" to 420,
        "proteinG" to 14.5,
        "carbsG" to 61,
        "fatG" to null,
    ) + changes

    private fun invalid(block: () -> Unit): String {
        val failure = assertThrows(HealthFailure::class.java) { block() }
        assertEquals(FailureCode.INVALID_INPUT, failure.code)
        return failure.message!!
    }

    @Test
    fun aMealBecomesAOneMinuteNutritionWrite() {
        val write = nutritionWrites(mapOf("records" to listOf(meal())), now).single()
        assertEquals("entry-1", write.clientId)
        assertEquals(Instant.parse("2026-10-27T07:30:00Z"), write.start)
        assertEquals(Instant.parse("2026-10-27T07:31:00Z"), write.end)
        assertEquals("Porridge with berries", write.name)
        assertEquals(MealType.MEAL_TYPE_BREAKFAST, write.mealType)
        assertEquals(420.0, write.kcal, 0.0)
        assertEquals(14.5, write.proteinG!!, 0.0)
        assertEquals(61.0, write.carbsG!!, 0.0)
        assertNull(write.fatG)
    }

    @Test
    fun mealTypesMapToHealthConnectAndNullIsUnknown() {
        val expected = mapOf(
            "breakfast" to MealType.MEAL_TYPE_BREAKFAST,
            "lunch" to MealType.MEAL_TYPE_LUNCH,
            "dinner" to MealType.MEAL_TYPE_DINNER,
            "snack" to MealType.MEAL_TYPE_SNACK,
            null to MealType.MEAL_TYPE_UNKNOWN,
        )
        expected.forEach { (wire, type) ->
            assertEquals(type, nutritionWrites(mapOf("records" to listOf(meal("mealType" to wire))), now).single().mealType)
        }
        invalid { nutritionWrites(mapOf("records" to listOf(meal("mealType" to "brunch"))), now) }
    }

    @Test
    fun aBlankNameIsWrittenWithoutOne() {
        assertNull(nutritionWrites(mapOf("records" to listOf(meal("name" to "   "))), now).single().name)
    }

    @Test
    fun anEmptyListWritesNothing() {
        assertTrue(nutritionWrites(mapOf("records" to emptyList<Any>()), now).isEmpty())
    }

    @Test
    fun badMealsStopTheWholeCall() {
        val bad = listOf(
            meal("clientId" to ""),
            meal("clientId" to "x".repeat(MAX_CLIENT_ID_LENGTH + 1)),
            meal("clientId" to 7),
            meal("time" to "yesterday"),
            meal("time" to "2026-10-27T07:30:00"),
            meal("time" to "2026-10-27T12:00:01Z"),
            meal("kcal" to null),
            meal("kcal" to -1),
            meal("kcal" to 100_001),
            meal("kcal" to Double.NaN),
            meal("proteinG" to "12"),
            meal("fatG" to 100_000.5),
            meal("name" to null),
        )
        for (record in bad) {
            invalid { nutritionWrites(mapOf("records" to listOf(meal("clientId" to "fine"), record)), now) }
        }
        invalid { nutritionWrites(mapOf("records" to "not a list"), now) }
        invalid { nutritionWrites(mapOf("records" to listOf("not an object")), now) }
    }

    @Test
    fun aMealTimedNowIsAcceptedButNotOneInTheFuture() {
        assertEquals(now, nutritionWrites(mapOf("records" to listOf(meal("time" to now.toString()))), now).single().start)
        val message = invalid { nutritionWrites(mapOf("records" to listOf(meal("time" to "2026-10-28T07:00:00Z"))), now) }
        assertTrue(message.contains("future"))
    }

    @Test
    fun oneCallMayNotRepeatAClientId() {
        invalid { nutritionWrites(mapOf("records" to listOf(meal(), meal())), now) }
    }

    @Test
    fun aWeighInIsChecked() {
        val write = weightWrite(mapOf("clientId" to "w-1", "time" to "2026-10-27T06:10:00Z", "kg" to 71.8), now)
        assertEquals(WeightWrite("w-1", Instant.parse("2026-10-27T06:10:00Z"), 71.8), write)
        for (kg in listOf(0, -3, 1000.5, "70", null)) {
            invalid { weightWrite(mapOf("clientId" to "w-1", "time" to "2026-10-27T06:10:00Z", "kg" to kg), now) }
        }
        invalid { weightWrite(mapOf("clientId" to "w-1", "time" to "2026-10-27T13:00:00Z", "kg" to 70), now) }
        assertEquals(1000.0, weightWrite(mapOf("clientId" to "w", "time" to "2026-10-27T06:10:00Z", "kg" to 1000), now).kg, 0.0)
    }

    @Test
    fun deletesTakeDistinctClientIds() {
        assertEquals(listOf("a", "b"), clientIdsToDelete(mapOf("clientIds" to listOf("a", "b", "a"))))
        assertTrue(clientIdsToDelete(mapOf("clientIds" to emptyList<String>())).isEmpty())
        invalid { clientIdsToDelete(mapOf("clientIds" to listOf("a", ""))) }
        invalid { clientIdsToDelete(mapOf("clientIds" to "a")) }
        invalid { clientIdsToDelete(emptyMap()) }
    }

    @Test
    fun versionsOnlyGrowEvenWhenTheClockStandsStillOrGoesBack() {
        val ticks = ArrayDeque(listOf(5_000L, 5_000L, 4_000L, 9_000L))
        val clock = VersionClock { ticks.removeFirst() }
        assertEquals(listOf(5_000L, 5_001L, 5_002L, 9_000L), List(4) { clock.next() })
    }
}
