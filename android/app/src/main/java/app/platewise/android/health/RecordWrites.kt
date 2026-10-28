package app.platewise.android.health

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.Device
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Length
import androidx.health.connect.client.units.Mass
import java.time.ZoneId
import java.time.ZoneOffset
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

/**
 * A walk as an exercise session of type walking plus the [parts] chosen for it, over the walk's
 * whole time, in one insert (Health Connect writes all of them or none). They are recorded by
 * the phone while the person walked, so their metadata says "actively recorded" on a phone.
 */
internal suspend fun HealthConnectClient.insertWalk(
    walk: WalkWrite,
    parts: List<WalkPart>,
    versions: VersionClock,
    zone: ZoneId,
    phone: Device,
) {
    val startOffset = zone.rules.getOffset(walk.start)
    val endOffset = zone.rules.getOffset(walk.end)
    fun metadataOf(part: WalkPart) = Metadata.activelyRecorded(phone, walk.recordId(part), versions.next())
    val records = parts.map { part -> walkRecord(walk, part, startOffset, endOffset, metadataOf(part)) }
    insertRecords(records)
}

private fun walkRecord(
    walk: WalkWrite,
    part: WalkPart,
    startOffset: ZoneOffset,
    endOffset: ZoneOffset,
    metadata: Metadata,
): Record = when (part) {
    WalkPart.EXERCISE -> ExerciseSessionRecord(
        startTime = walk.start,
        startZoneOffset = startOffset,
        endTime = walk.end,
        endZoneOffset = endOffset,
        metadata = metadata,
        exerciseType = ExerciseSessionRecord.EXERCISE_TYPE_WALKING,
    )
    WalkPart.DISTANCE -> DistanceRecord(
        startTime = walk.start,
        startZoneOffset = startOffset,
        endTime = walk.end,
        endZoneOffset = endOffset,
        distance = Length.meters(walk.distanceM),
        metadata = metadata,
    )
    WalkPart.ACTIVE_CALORIES -> ActiveCaloriesBurnedRecord(
        startTime = walk.start,
        startZoneOffset = startOffset,
        endTime = walk.end,
        endZoneOffset = endOffset,
        energy = Energy.kilocalories(walk.activeKcal),
        metadata = metadata,
    )
    WalkPart.STEPS -> StepsRecord(
        startTime = walk.start,
        startZoneOffset = startOffset,
        endTime = walk.end,
        endZoneOffset = endOffset,
        count = walk.steps ?: 0L,
        metadata = metadata,
    )
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
