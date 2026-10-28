package app.platewise.android.health

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant
import kotlin.reflect.KClass

/** Every record of [type] in the local-time window of [range], across all pages. */
private suspend fun <T : Record> HealthConnectClient.everyRecord(type: KClass<T>, range: DayRange): List<T> {
    val window = TimeRangeFilter.between(range.localStart, range.localEnd)
    return readEveryPage { token ->
        val page = readRecords(ReadRecordsRequest(recordType = type, timeRangeFilter = window, pageToken = token))
        page.records to page.pageToken
    }
}

/** The exercise sessions of [range] as plain facts (every app's; HealthRows.kt filters them). */
internal suspend fun HealthConnectClient.sessionFacts(range: DayRange): List<SessionFacts> =
    everyRecord(ExerciseSessionRecord::class, range).map { record ->
        SessionFacts(
            id = record.metadata.id,
            origin = record.metadata.dataOrigin.packageName,
            typeCode = record.exerciseType,
            title = record.title,
            start = record.startTime,
            end = record.endTime,
            startOffset = record.startZoneOffset,
        )
    }

/** The weigh-ins of [range] as plain facts (every app's; HealthRows.kt filters them). */
internal suspend fun HealthConnectClient.weightFacts(range: DayRange): List<WeightFacts> =
    everyRecord(WeightRecord::class, range).map { record ->
        WeightFacts(
            id = record.metadata.id,
            origin = record.metadata.dataOrigin.packageName,
            time = record.time,
            offset = record.zoneOffset,
            kg = record.weight.inKilograms,
        )
    }

/** Every heart-rate sample of the records that overlap [window] (HealthRows.kt trims them). */
internal suspend fun HealthConnectClient.heartRateFacts(window: TimeWindow): List<HeartRateFacts> {
    val filter = TimeRangeFilter.between(window.start, window.end)
    val records = readEveryPage { token ->
        val page = readRecords(ReadRecordsRequest(recordType = HeartRateRecord::class, timeRangeFilter = filter, pageToken = token))
        page.records to page.pageToken
    }
    return records.flatMap { record -> record.samples.map { HeartRateFacts(it.time, it.beatsPerMinute) } }
}

/**
 * Active calories between [from] and [until], as Health Connect sums them (it shares out records
 * that only partly overlap the window). An empty [onlyFrom] means every app.
 */
internal suspend fun HealthConnectClient.activeKcal(from: Instant, until: Instant, onlyFrom: Set<String>): Double? {
    val metric = ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL
    val sum = aggregate(
        AggregateRequest(
            metrics = setOf(metric),
            timeRangeFilter = TimeRangeFilter.between(from, until),
            dataOriginFilter = onlyFrom.mapTo(HashSet()) { DataOrigin(it) },
        ),
    )
    return sum[metric]?.inKilocalories
}
