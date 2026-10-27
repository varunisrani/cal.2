package app.platewise.android.health

import androidx.health.connect.client.HealthConnectClient

private const val PERMISSION_PREFIX = "android.permission.health."

/**
 * What the web app may read (the contract's `HealthReadKind`). Each kind needs one Health
 * Connect permission; the manifest declares exactly these (ManifestTest checks it).
 */
enum class ReadKind(val wire: String, val permission: String) {
    STEPS("steps", PERMISSION_PREFIX + "READ_STEPS"),
    ACTIVE_CALORIES("activeCalories", PERMISSION_PREFIX + "READ_ACTIVE_CALORIES_BURNED"),
    TOTAL_CALORIES("totalCalories", PERMISSION_PREFIX + "READ_TOTAL_CALORIES_BURNED"),
    DISTANCE("distance", PERMISSION_PREFIX + "READ_DISTANCE"),
    EXERCISE("exercise", PERMISSION_PREFIX + "READ_EXERCISE"),
    WEIGHT("weight", PERMISSION_PREFIX + "READ_WEIGHT"),
}

/** What the web app may write (the contract's `HealthWriteKind`). */
enum class WriteKind(val wire: String, val permission: String) {
    NUTRITION("nutrition", PERMISSION_PREFIX + "WRITE_NUTRITION"),
    WEIGHT("weight", PERMISSION_PREFIX + "WRITE_WEIGHT"),
}

/** Kinds in both directions: what is granted, or what a request asks for. */
data class KindSet(val read: Set<ReadKind>, val write: Set<WriteKind>) {
    val permissions: Set<String>
        get() = read.mapTo(LinkedHashSet()) { it.permission } + write.map { it.permission }

    /** `{ read: [...], write: [...] }`, each list in the enums' order. */
    fun toWire(): Map<String, Any?> = mapOf(
        "read" to ReadKind.entries.filter { it in read }.map { it.wire },
        "write" to WriteKind.entries.filter { it in write }.map { it.wire },
    )

    companion object {
        /** The kinds whose permission is among [granted]; other apps' and unknown names are ignored. */
        fun fromGranted(granted: Set<String>): KindSet = KindSet(
            read = ReadKind.entries.filterTo(LinkedHashSet()) { it.permission in granted },
            write = WriteKind.entries.filterTo(LinkedHashSet()) { it.permission in granted },
        )

        /** The `{ read, write }` argument of requestPermissions; a missing list asks for nothing. */
        fun fromRequest(args: Map<String, Any?>): KindSet = KindSet(
            read = namesIn(args["read"], "read").mapTo(LinkedHashSet()) { name ->
                ReadKind.entries.firstOrNull { it.wire == name } ?: invalidInput("unknown read kind \"$name\"")
            },
            write = namesIn(args["write"], "write").mapTo(LinkedHashSet()) { name ->
                WriteKind.entries.firstOrNull { it.wire == name } ?: invalidInput("unknown write kind \"$name\"")
            },
        )

        private fun namesIn(value: Any?, field: String): List<String> = when (value) {
            null -> emptyList()
            is List<*> -> value.map { it as? String ?: invalidInput("$field must hold kind names") }
            else -> invalidInput("$field must be a list of kind names")
        }
    }
}

/** The contract's answer to `availability()`. */
enum class Availability(val wire: String) {
    AVAILABLE("available"),
    NOT_INSTALLED("notInstalled"),
    UPDATE_REQUIRED("updateRequired"),
    NOT_SUPPORTED("notSupported"),
}

/** Android 14, where Health Connect became part of the system. */
const val API_HEALTH_IN_SYSTEM = 34

/**
 * Reads the client's SDK status as one of the contract's states. On Android 9 to 13 the client
 * reports a missing Health Connect app the same way as an outdated one ("provider update
 * required"), so whether the app's package is installed tells the two apart. On Android 8 and
 * in a work profile the client says unavailable: nothing can be installed to fix that.
 */
fun availabilityOf(sdkStatus: Int, apiLevel: Int, providerInstalled: Boolean): Availability =
    when (sdkStatus) {
        HealthConnectClient.SDK_AVAILABLE -> Availability.AVAILABLE
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED ->
            if (apiLevel < API_HEALTH_IN_SYSTEM && !providerInstalled) {
                Availability.NOT_INSTALLED
            } else {
                Availability.UPDATE_REQUIRED
            }
        else -> Availability.NOT_SUPPORTED
    }

/** The package of the Health Connect app on Android 13 and below (and its store listing). */
const val HEALTH_CONNECT_PACKAGE = "com.google.android.apps.healthdata"

/** A screen to try to open: an intent action, with an optional address, package and extras. */
data class ScreenTarget(
    val action: String,
    val uri: String? = null,
    val targetPackage: String? = null,
    val extras: Map<String, String> = emptyMap(),
)

/**
 * Where `openHealthConnectSettings()` sends the person, best first; the plugin opens the first
 * one the phone can handle. With Health Connect usable: Platewise's own access page on Android
 * 14 and up, else Health Connect's home. Missing or outdated: its store listing (the Play app,
 * then the web page). Unsupported: nowhere.
 */
fun healthScreenTargets(availability: Availability, apiLevel: Int, ownPackage: String): List<ScreenTarget> =
    when (availability) {
        Availability.AVAILABLE ->
            if (apiLevel >= API_HEALTH_IN_SYSTEM) {
                listOf(
                    ScreenTarget(
                        action = "android.health.connect.action.MANAGE_HEALTH_PERMISSIONS",
                        extras = mapOf("android.intent.extra.PACKAGE_NAME" to ownPackage),
                    ),
                    ScreenTarget(action = "android.health.connect.action.HEALTH_HOME_SETTINGS"),
                )
            } else {
                listOf(ScreenTarget(action = "androidx.health.ACTION_HEALTH_CONNECT_SETTINGS"))
            }
        Availability.NOT_INSTALLED, Availability.UPDATE_REQUIRED -> listOf(
            ScreenTarget(
                action = "android.intent.action.VIEW",
                // Google's documented link: after installing, Health Connect opens its onboarding.
                uri = "market://details?id=$HEALTH_CONNECT_PACKAGE&url=healthconnect%3A%2F%2Fonboarding",
                targetPackage = "com.android.vending",
            ),
            ScreenTarget(
                action = "android.intent.action.VIEW",
                uri = "https://play.google.com/store/apps/details?id=$HEALTH_CONNECT_PACKAGE",
            ),
        )
        Availability.NOT_SUPPORTED -> emptyList()
    }
