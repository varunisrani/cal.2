package app.platewise.android.health

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.LocalDate
import java.time.Period

/**
 * The day totals of [range] for the [granted] kinds, from Health Connect's own per-day
 * aggregation (it removes the overlap when a phone and a watch both count steps). A metric
 * that is not granted is never asked for: Health Connect would refuse the whole request.
 */
internal suspend fun HealthConnectClient.readDayTotals(
    range: DayRange,
    granted: Set<ReadKind>,
): Map<LocalDate, DayTotals> {
    val steps = StepsRecord.COUNT_TOTAL
    val active = ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL
    val total = TotalCaloriesBurnedRecord.ENERGY_TOTAL
    val distance = DistanceRecord.DISTANCE_TOTAL
    val wanted = mapOf<ReadKind, AggregateMetric<*>>(
        ReadKind.STEPS to steps,
        ReadKind.ACTIVE_CALORIES to active,
        ReadKind.TOTAL_CALORIES to total,
        ReadKind.DISTANCE to distance,
    ).filterKeys { it in granted }.values.toSet()
    if (wanted.isEmpty()) return emptyMap()

    // Local time, sliced by calendar day: each record counts on the day of its own clock.
    val perDay = aggregateGroupByPeriod(
        AggregateGroupByPeriodRequest(
            metrics = wanted,
            timeRangeFilter = TimeRangeFilter.between(range.localStart, range.localEnd),
            timeRangeSlicer = Period.ofDays(1),
        ),
    )
    return perDay.associate { bucket ->
        val values = bucket.result
        bucket.startTime.toLocalDate() to DayTotals(
            steps = values[steps],
            activeKcal = values[active]?.inKilocalories,
            totalKcal = values[total]?.inKilocalories,
            distanceM = values[distance]?.inMeters,
        )
    }
}
