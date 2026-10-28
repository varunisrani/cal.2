package app.platewise.android.walk

import java.io.File
import java.io.FileOutputStream

/**
 * The walk in progress (or ended and not yet taken by the app) as a file in the app's own files
 * folder: [WALK_LOG_HEADER], then one event per line ([lineOf]). A new walk replaces the file
 * through a temporary one and a rename, so a crash leaves the old walk or the new one, never half
 * of each; later events are appended.
 */
class WalkFile(private val file: File) {
    /**
     * The events in the file, or null when there is no walk in it (see [eventsOf]). A torn last
     * line (the process died while appending) is closed, so the next event starts a line of its
     * own and the torn one is skipped.
     */
    fun load(): List<WalkEvent>? {
        if (!file.isFile) return null
        val text = file.readText(Charsets.UTF_8)
        if (text.isNotEmpty() && !text.endsWith("\n")) FileOutputStream(file, true).use { it.write('\n'.code) }
        return eventsOf(text.lines())
    }

    /** Replaces the file with a new walk's first events. */
    fun create(events: List<WalkEvent>) {
        file.parentFile?.mkdirs()
        val temporary = File(file.parentFile, "${file.name}.new")
        val text = (listOf(WALK_LOG_HEADER) + events.map(::lineOf)).joinToString(separator = "\n", postfix = "\n")
        FileOutputStream(temporary).use { out ->
            out.write(text.toByteArray(Charsets.UTF_8))
            out.fd.sync()
        }
        if (!temporary.renameTo(file)) {
            temporary.delete()
            throw java.io.IOException("could not replace the walk file")
        }
    }

    /** Adds [events] at the end of the file. */
    fun append(events: List<WalkEvent>) {
        if (events.isEmpty()) return
        val text = events.joinToString(separator = "") { lineOf(it) + "\n" }
        FileOutputStream(file, true).use { it.write(text.toByteArray(Charsets.UTF_8)) }
    }

    fun delete() {
        file.delete()
        File(file.parentFile, "${file.name}.new").delete()
    }
}
