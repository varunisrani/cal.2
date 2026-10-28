package app.platewise.android.walk

/**
 * Steps since the walk started, from Android's step counter, which counts from the last boot.
 * The first reading only sets the baseline; later ones add what the counter moved on by. A
 * reading below the last one means the counter started again from 0 (a reboot), so all of it is
 * new. While the walk is paused, readings move the baseline without counting.
 */
class StepTally(total: Long = 0L, baseline: Long? = null) {
    /** Steps counted so far. */
    var total: Long = total
        private set

    /** The counter's last value, or null before the first reading. */
    var baseline: Long? = baseline
        private set

    fun onReading(counter: Long, counting: Boolean) {
        if (counter < 0L) return
        val previous = baseline
        baseline = counter
        if (previous == null || !counting) return
        total += if (counter >= previous) counter - previous else counter
    }
}
