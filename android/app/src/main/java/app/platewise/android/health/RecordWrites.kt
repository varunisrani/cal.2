package app.platewise.android.health

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Mass
import java.time.ZoneId
import kotlin.reflect.KClass

/** How many records one insert or delete call carries; larger batches are split. */
private const val RECORDS_PER_CALL = 100

/**
 * Our id as Health Connect's client record id, with a version that only grows: writing the same
 * id again replaces the record, and a delete by that id removes it.
 */
private fun ownedBy(clientId: String, versions: VersionClock): Metadata =
    Metadata.manualEntry(clientRecordId = clientId, clientRecordVersion = versions.next())

/** Meals as nutrition records, each carrying the phone's zone offset at its time. */
internal suspend fun HealthConnectClient.insertMeals(meals: List<NutritionWrite>, versions: VersionClock, zone: ZoneId) {
    val records = meals.map { meal ->
        NutritionRecord(
            metadata = ownedBy(meal.clientId, versions),
            name = meal.name,
            mealType = meal.mealType,
            startTime = meal.start,
            endTime = meal.end,
            startZoneOffset = zone.rules.getOffset(meal.start),
            endZoneOffset = zone.rules.getOffset(meal.end),
            energy = Energy.kilocalories(meal.kcal),
            protein = meal.proteinG?.let { Mass.grams(it) },
            totalCarbohydrate = meal.carbsG?.let { Mass.grams(it) },
            totalFat = meal.fatG?.let { Mass.grams(it) },
        )
    }
    records.chunked(RECORDS_PER_CALL).forEach { insertRecords(it) }
}

internal suspend fun HealthConnectClient.insertWeighIn(weighIn: WeightWrite, versions: VersionClock, zone: ZoneId) {
    val record = WeightRecord(
        metadata = ownedBy(weighIn.clientId, versions),
        weight = Mass.kilograms(weighIn.kg),
        time = weighIn.time,
        zoneOffset = zone.rules.getOffset(weighIn.time),
    )
    insertRecords(listOf(record))
}

internal suspend fun HealthConnectClient.deleteMeals(clientIds: List<String>) =
    deleteByClientIds(NutritionRecord::class, clientIds)

internal suspend fun HealthConnectClient.deleteWeighIns(clientIds: List<String>) =
    deleteByClientIds(WeightRecord::class, clientIds)

/** Health Connect lets an app delete only its own records, so these ids can only reach ours. */
private suspend fun HealthConnectClient.deleteByClientIds(type: KClass<out Record>, clientIds: List<String>) {
    clientIds.chunked(RECORDS_PER_CALL).forEach { ids ->
        deleteRecords(recordType = type, recordIdsList = emptyList(), clientRecordIdsList = ids)
    }
}
