package app.platewise.android.health

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.records.metadata.Device
import java.time.ZoneId

/**
 * Platewise's side of Health Connect: whether it can be used, what is granted, and each
 * operation of the contract. The client calls themselves are in DayTotalsQuery.kt,
 * RecordQueries.kt and RecordWrites.kt; the rules (rows, filters, checks) in the plain files.
 */
internal class HealthConnectGateway(private val context: Context) {
    private val ownPackage: String = context.packageName
    private val versions = VersionClock()
    private val client: HealthConnectClient by lazy { HealthConnectClient.getOrCreate(context) }

    fun availability(): Availability = availabilityOf(
        sdkStatus = HealthConnectClient.getSdkStatus(context),
        apiLevel = Build.VERSION.SDK_INT,
        providerInstalled = isInstalled(HEALTH_CONNECT_PACKAGE),
    )

    fun requireAvailable() {
        val state = availability()
        if (state != Availability.AVAILABLE) {
            throw HealthFailure(FailureCode.NOT_AVAILABLE, "Health Connect is ${state.wire} on this phone")
        }
    }

    private fun isInstalled(packageName: String): Boolean = try {
        context.packageManager.getPackageInfo(packageName, 0)
        true
    } catch (_: PackageManager.NameNotFoundException) {
        false
    }

    suspend fun grantedPermissions(): Set<String> = client.permissionController.getGrantedPermissions()

    suspend fun grants(): KindSet = KindSet.fromGranted(grantedPermissions())

    /** Health Connect's own permission screen, asking for [permissions]. */
    fun permissionRequestIntent(permissions: Set<String>): Intent =
        PermissionController.createRequestPermissionResultContract().createIntent(context, permissions)

    /** The granted permissions, after checking that they include [kind]. */
    private suspend fun requireGranted(kind: WriteKind): Set<String> {
        val granted = grantedPermissions()
        if (!kind.isGrantedBy(granted)) {
            throw HealthFailure(FailureCode.PERMISSION_DENIED, "Health Connect has not granted writing ${kind.wire}")
        }
        return granted
    }

    suspend fun dailyTotals(range: DayRange): List<DailyRow> {
        val granted = grants().read
        return dailyRows(range, granted, client.readDayTotals(range, granted))
    }

    suspend fun exerciseSessions(range: DayRange): List<SessionRow> {
        val granted = grants().read
        if (ReadKind.EXERCISE !in granted) return emptyList()
        val zone = ZoneId.systemDefault()
        val withCalories = ReadKind.ACTIVE_CALORIES in granted
        return foreignSessions(client.sessionFacts(range), ownPackage, range, zone).map { session ->
            val kcal = if (!withCalories) {
                null
            } else {
                sessionCalories(
                    fromRecordingApp = { client.activeKcal(session.start, session.end, setOf(session.origin)) },
                    fromAnyApp = { client.activeKcal(session.start, session.end, emptySet()) },
                )
            }
            sessionRow(session, kcal, zone)
        }
    }

    suspend fun weights(range: DayRange): List<WeightRow> {
        if (ReadKind.WEIGHT !in grants().read) return emptyList()
        return weightRows(client.weightFacts(range), ownPackage, range, ZoneId.systemDefault())
    }

    suspend fun writeNutrition(meals: List<NutritionWrite>) {
        requireGranted(WriteKind.NUTRITION)
        client.insertMeals(meals, versions, ZoneId.systemDefault())
    }

    suspend fun deleteNutrition(clientIds: List<String>) {
        requireGranted(WriteKind.NUTRITION)
        client.deleteMeals(clientIds)
    }

    suspend fun writeWeight(weighIn: WeightWrite) {
        requireGranted(WriteKind.WEIGHT)
        client.insertWeighIn(weighIn, versions, ZoneId.systemDefault())
    }

    suspend fun deleteWeight(clientIds: List<String>) {
        requireGranted(WriteKind.WEIGHT)
        client.deleteWeighIns(clientIds)
    }

    /** A finished walk; its steps only when they are given and writing steps is granted too. */
    suspend fun writeWalk(walk: WalkWrite) {
        val granted = requireGranted(WriteKind.WALK)
        val parts = walkParts(walk, stepsGranted = WRITE_STEPS_PERMISSION in granted)
        val phone = Device(type = Device.TYPE_PHONE, manufacturer = Build.MANUFACTURER, model = Build.MODEL)
        client.insertWalk(walk, parts, versions, ZoneId.systemDefault(), phone)
    }

    suspend fun heartRate(window: TimeWindow): List<HeartRateRow> {
        if (ReadKind.HEART_RATE !in grants().read) return emptyList()
        return heartRateRows(client.heartRateFacts(window), window)
    }
}
