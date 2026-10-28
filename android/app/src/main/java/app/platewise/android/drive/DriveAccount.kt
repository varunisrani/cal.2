package app.platewise.android.drive

import android.content.Context

private const val PREFERENCES = "platewise.drive"
private const val ACCOUNT_NAME = "account"

/**
 * The Google account Drive access was last given for, kept in the app's private preferences so
 * that signing out can take that access back after a restart. Only the account's name (its
 * email); tokens are never stored.
 */
internal object DriveAccount {
    private fun preferences(context: Context) = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    fun remembered(context: Context): String? = preferences(context).getString(ACCOUNT_NAME, null)

    fun remember(context: Context, name: String) {
        preferences(context).edit().putString(ACCOUNT_NAME, name).apply()
    }

    fun forget(context: Context) {
        preferences(context).edit().remove(ACCOUNT_NAME).apply()
    }
}
