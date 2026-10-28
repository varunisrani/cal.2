package app.platewise.android

import java.io.File
import org.junit.Assert.assertTrue

/**
 * The TypeScript plugin contract of a phase file in docs/plan/phases: the fenced `ts` block
 * under its "## Plugin contract" heading, which the web side codes to as well. Reading the plan
 * itself means a change to a contract fails a test until both sides agree.
 */
class PhaseContract(phaseFile: String) {
    val text: String = File(System.getProperty("platewise.repoRoot") ?: "../..", "docs/plan/phases/$phaseFile").readText()

    val block: String = text.substringAfter("## Plugin contract").substringAfter("```ts").substringBefore("```").also {
        assertTrue("no ts block under Plugin contract in $phaseFile", it.contains("interface "))
    }

    /** The text between `interface <name> {` and its closing brace. */
    fun body(name: String): String {
        val open = block.indexOf("interface $name {")
        assertTrue("no interface $name", open >= 0)
        var depth = 0
        val start = block.indexOf('{', open)
        for (index in start until block.length) {
            when (block[index]) {
                '{' -> depth++
                '}' -> if (--depth == 0) return block.substring(start + 1, index)
            }
        }
        error("interface $name is not closed")
    }

    /** Method name → the rest of its line, for an interface with one method per line. */
    fun methods(name: String): Map<String, String> =
        Regex("""^\s*(\w+)\((.*)$""", RegexOption.MULTILINE).findAll(body(name))
            .associate { it.groupValues[1] to it.groupValues[2] }

    /** The field names of an interface (comments and nested object types left out). */
    fun fields(name: String): Set<String> = fieldNames(body(name))

    /** The quoted members of `type <name> = 'a' | 'b';`. */
    fun union(name: String): Set<String> =
        quoted(Regex("""type $name = ([^;]+);""").find(block)?.groupValues?.get(1) ?: error("no type $name"))

    /** The comment lines that start with a method call (`//   writeWalk(...)`): name → the rest. */
    fun commentedMethods(): Map<String, String> =
        Regex("""^\s*//\s+(\w+)\((.*)$""", RegexOption.MULTILINE).findAll(block)
            .associate { it.groupValues[1] to it.groupValues[2] }

    /** The kinds the block adds to a union in its comments: `kind 'x' in <union>`. */
    fun kindsAddedTo(union: String): Set<String> =
        Regex("""kind '(\w+)' in $union""").findAll(block).map { it.groupValues[1] }.toSet()

    companion object {
        fun quoted(fragment: String): Set<String> =
            Regex("""'([^']+)'""").findAll(fragment).map { it.groupValues[1] }.toSet()

        /** Top-level `name:` (or bare `name,`) entries of an object type's inside. */
        fun fieldNames(inside: String): Set<String> {
            val flat = inside.lines().joinToString(" ") { it.substringBefore("//") }
            val outer = StringBuilder()
            var depth = 0
            for (char in flat) {
                when (char) {
                    '{' -> depth++
                    '}' -> depth--
                    else -> if (depth == 0) outer.append(char)
                }
            }
            return Regex("""(\w+)\s*(?::|,|$)""").findAll(outer.toString().trim())
                .map { it.groupValues[1] }
                // Type names: the built-in ones, and ours, which start with a capital.
                .filterNot { it in setOf("string", "number", "boolean", "null") || it.first().isUpperCase() }
                .toSet()
        }

        /** The fields of the object literal that follows [label] in [line] (`o: { a: x; b: y }`). */
        fun objectAfter(line: String, label: String): Set<String> {
            val start = line.indexOf("$label{").takeIf { it >= 0 } ?: line.indexOf("$label {")
            assertTrue("no \"$label{\" in: $line", start >= 0)
            val open = line.indexOf('{', start)
            var depth = 0
            for (index in open until line.length) {
                when (line[index]) {
                    '{' -> depth++
                    '}' -> if (--depth == 0) return fieldNames(line.substring(open + 1, index))
                }
            }
            error("object after $label is not closed in: $line")
        }
    }
}
