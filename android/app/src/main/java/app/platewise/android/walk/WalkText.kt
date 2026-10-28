package app.platewise.android.walk

import java.util.Locale

/** Countries whose road and walking distances are in miles. */
private val MILE_COUNTRIES = setOf("US", "LR", "MM")

private const val METRES_PER_MILE = 1_609.344

/** True when the phone's region measures distances in miles. */
fun usesMiles(country: String): Boolean = country.uppercase(Locale.ROOT) in MILE_COUNTRIES

/** A distance for the notification: two decimals in km or miles, in the phone's number style. */
fun distanceText(metres: Double, miles: Boolean, locale: Locale): String {
    val amount = if (miles) metres / METRES_PER_MILE else metres / 1_000.0
    return String.format(locale, "%.2f %s", amount, if (miles) "mi" else "km")
}

/** Elapsed time as a clock shows it: `4:05`, `1:02:03`. */
fun elapsedText(millis: Long): String {
    val seconds = millis.coerceAtLeast(0L) / 1_000
    val hours = seconds / 3_600
    val minutes = seconds / 60 % 60
    val rest = seconds % 60
    return if (hours > 0) {
        String.format(Locale.ROOT, "%d:%02d:%02d", hours, minutes, rest)
    } else {
        String.format(Locale.ROOT, "%d:%02d", minutes, rest)
    }
}

/** Android 10, from which the step counter needs the activity permission. */
const val API_ACTIVITY_PERMISSION = 29

/** Android 13, from which posting notifications needs a permission. */
const val API_NOTIFICATION_PERMISSION = 33

/**
 * The answer of `checkPermissions`: Capacitor's state for each alias ([asked]), except where the
 * Android version has no such permission: below Android 10 counting steps needs none (granted);
 * below Android 13 notifications follow the app's notification switch. From 13, a granted
 * permission with the app's notifications switched off reads as denied.
 */
fun walkPermissionStates(apiLevel: Int, asked: Map<String, String>, notificationsOn: Boolean): Map<String, String> {
    val notifications = when {
        apiLevel < API_NOTIFICATION_PERMISSION -> if (notificationsOn) "granted" else "denied"
        asked["notifications"] == "granted" && !notificationsOn -> "denied"
        else -> asked["notifications"] ?: "prompt"
    }
    return mapOf(
        "location" to (asked["location"] ?: "prompt"),
        "activity" to if (apiLevel < API_ACTIVITY_PERMISSION) "granted" else asked["activity"] ?: "prompt",
        "notifications" to notifications,
    )
}
