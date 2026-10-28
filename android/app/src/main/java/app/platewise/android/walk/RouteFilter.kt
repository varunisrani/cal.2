package app.platewise.android.walk

import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.roundToLong
import kotlin.math.sin
import kotlin.math.sqrt

/** Fixes less accurate than this (metres, Android's 68 % radius) are not kept. */
const val MAX_ACCURACY_M = 50.0

/** Faster than this (metres per second, about 29 km/h) is not walking or running: a GPS jump. */
const val MAX_SPEED_MPS = 8.0

/** Held-back fixes that agree with each other this many times in a row are kept after all. */
const val JUMP_CONFIRMATIONS = 3

private const val EARTH_RADIUS_M = 6_371_008.8

/** One GPS fix as the phone reports it: epoch milliseconds, degrees, accuracy (null: unknown). */
data class Fix(val time: Long, val lat: Double, val lon: Double, val accuracyM: Double?)

/** A kept point of the route, rounded as it is stored: 7 decimals (about 1 cm), accuracy to 0.1 m. */
data class RoutePoint(val time: Long, val lat: Double, val lon: Double, val accuracyM: Double) {
    fun toWire(): Map<String, Any?> = mapOf(
        "t" to isoTime(time),
        "lat" to lat,
        "lon" to lon,
        "accuracyM" to accuracyM,
    )
}

/** Great-circle distance in metres (haversine, mean Earth radius). */
fun haversineM(aLat: Double, aLon: Double, bLat: Double, bLon: Double): Double {
    val dLat = Math.toRadians(bLat - aLat)
    val dLon = Math.toRadians(bLon - aLon)
    val h = sin(dLat / 2).let { it * it } +
        cos(Math.toRadians(aLat)) * cos(Math.toRadians(bLat)) * sin(dLon / 2).let { it * it }
    return 2 * EARTH_RADIUS_M * asin(min(1.0, sqrt(h)))
}

fun haversineM(a: RoutePoint, b: RoutePoint): Double = haversineM(a.lat, a.lon, b.lat, b.lon)

private fun roundTo(value: Double, scale: Double): Double = (value * scale).roundToLong() / scale

/** The fix as a route point, or null when it is unusable: no accuracy, too coarse, or not on Earth. */
fun routePointOf(fix: Fix): RoutePoint? {
    val accuracy = fix.accuracyM ?: return null
    if (!accuracy.isFinite() || accuracy < 0.0 || accuracy > MAX_ACCURACY_M) return null
    if (!fix.lat.isFinite() || !fix.lon.isFinite()) return null
    if (fix.lat !in -90.0..90.0 || fix.lon !in -180.0..180.0) return null
    if (fix.time <= 0L) return null
    return RoutePoint(fix.time, roundTo(fix.lat, 1e7), roundTo(fix.lon, 1e7), roundTo(accuracy, 10.0))
}

/**
 * True when someone could have gone from [from] to [to] in the time between them. Each fix may be
 * off by its accuracy, so the distance their combined error can explain is not counted.
 */
fun reachable(from: RoutePoint, to: RoutePoint): Boolean {
    val seconds = (to.time - from.time) / 1000.0
    if (seconds <= 0.0) return false
    val error = sqrt(from.accuracyM * from.accuracyM + to.accuracyM * to.accuracyM)
    return haversineM(from, to) - error <= MAX_SPEED_MPS * seconds
}

/** What [RouteFilter.offer] decided: the points to keep, and whether they start a new stretch. */
data class Kept(val points: List<RoutePoint>, val newStretch: Boolean) {
    companion object {
        val NONE = Kept(emptyList(), newStretch = false)
    }
}

/**
 * Decides which fixes become route points. A usable fix that is reachable from the last kept
 * point is kept. One that is not is held back as a possible jump; when [JUMP_CONFIRMATIONS]
 * held-back fixes in a row are reachable from each other, the person really is there: they are
 * kept, as a new stretch (the jump itself is not walked distance). A lone spike is never kept.
 */
class RouteFilter(private var last: RoutePoint? = null) {
    private val heldBack = ArrayList<RoutePoint>()

    /** Make [point] the last kept point (a point read back from the walk file). */
    fun anchorAt(point: RoutePoint) {
        last = point
        heldBack.clear()
    }

    /** Forget the anchor (after a resume): the next usable fix starts a new stretch. */
    fun restart() {
        last = null
        heldBack.clear()
    }

    fun offer(fix: Fix): Kept {
        val point = routePointOf(fix) ?: return Kept.NONE
        val anchor = last
        if (anchor == null) {
            last = point
            return Kept(listOf(point), newStretch = true)
        }
        if (point.time <= anchor.time) return Kept.NONE
        if (reachable(anchor, point)) {
            heldBack.clear()
            last = point
            return Kept(listOf(point), newStretch = false)
        }
        val tail = heldBack.lastOrNull()
        if (tail == null || !reachable(tail, point)) heldBack.clear()
        heldBack += point
        if (heldBack.size < JUMP_CONFIRMATIONS) return Kept.NONE
        val confirmed = heldBack.toList()
        heldBack.clear()
        last = confirmed.last()
        return Kept(confirmed, newStretch = true)
    }
}
