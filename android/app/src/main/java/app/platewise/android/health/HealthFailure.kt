package app.platewise.android.health

/** The codes a call rejects with, spelled as the plugin contract spells them. */
enum class FailureCode(val wire: String) {
    NOT_AVAILABLE("notAvailable"),
    PERMISSION_DENIED("permissionDenied"),
    RATE_LIMITED("rateLimited"),
    INVALID_INPUT("invalidInput"),
    UNKNOWN("unknown"),
}

/** A failure we raise ourselves, already carrying the code the web app will see. */
class HealthFailure(val code: FailureCode, message: String) : Exception(message)

/** Stops a call whose arguments do not fit the contract. */
fun invalidInput(message: String): Nothing = throw HealthFailure(FailureCode.INVALID_INPUT, message)

/** The error and its causes, innermost last; a short walk is enough for client exceptions. */
private fun chainOf(error: Throwable): Sequence<Throwable> =
    generateSequence(error) { it.cause.takeIf { cause -> cause !== it } }.take(8)

/** True when the error text says Health Connect refused the call for going over its quota. */
fun mentionsRateLimit(error: Throwable): Boolean {
    val text = error.message?.lowercase() ?: return false
    return "rate limit" in text || "rate-limit" in text || "quota" in text
}

/**
 * The code for any error a call ends with. Health Connect reports a refused permission as a
 * SecurityException and a record it will not take as an IllegalArgumentException; a rate limit
 * arrives wrapped (an IllegalStateException on Android 14 and up), so it is looked for in the
 * whole cause chain first. [isRateLimit] lets the Android side add the platform's own error code.
 */
fun failureCodeOf(
    error: Throwable,
    isRateLimit: (Throwable) -> Boolean = ::mentionsRateLimit,
): FailureCode = when {
    error is HealthFailure -> error.code
    chainOf(error).any(isRateLimit) -> FailureCode.RATE_LIMITED
    error is SecurityException -> FailureCode.PERMISSION_DENIED
    error is IllegalArgumentException -> FailureCode.INVALID_INPUT
    error is UnsupportedOperationException -> FailureCode.NOT_AVAILABLE
    else -> FailureCode.UNKNOWN
}

/**
 * The message a rejection carries. Our own failures say what was wrong with the call; for
 * anything else only the exception's class is named, never its text, which could hold values.
 */
fun failureMessageOf(error: Throwable, code: FailureCode): String {
    if (error is HealthFailure) return error.message ?: code.wire
    val what = when (code) {
        FailureCode.NOT_AVAILABLE -> "Health Connect cannot be used on this phone"
        FailureCode.PERMISSION_DENIED -> "Health Connect has not granted this access"
        FailureCode.RATE_LIMITED -> "Health Connect asked to slow down; try again later"
        FailureCode.INVALID_INPUT -> "Health Connect did not accept the data"
        FailureCode.UNKNOWN -> "Health Connect call failed"
    }
    return "$what (${error.javaClass.simpleName})"
}
