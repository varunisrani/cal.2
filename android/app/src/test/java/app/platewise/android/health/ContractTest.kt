package app.platewise.android.health

import com.getcapacitor.PluginMethod
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The plugin against the TypeScript contract in the P11 phase file, which the web side codes to
 * as well. Reading the plan itself means a change to the contract fails here until both agree.
 */
class ContractTest {
    private val phaseFile = File(
        System.getProperty("platewise.repoRoot") ?: "../..",
        "docs/plan/phases/P11-android-and-health-connect.md",
    )
    private val text: String by lazy { phaseFile.readText() }

    /** The fenced `ts` block under the "Plugin contract" heading. */
    private val block: String by lazy {
        val section = text.substringAfter("## Plugin contract")
        section.substringAfter("```ts").substringBefore("```").also {
            assertTrue("no ts block under Plugin contract", it.contains("interface HealthConnectPlugin"))
        }
    }

    private val methodLines: Map<String, String> by lazy {
        val body = block.substringAfter("interface HealthConnectPlugin {").substringBeforeLast("}")
        Regex("""^\s*(\w+)\((.*)$""", RegexOption.MULTILINE).findAll(body)
            .associate { it.groupValues[1] to it.groupValues[2] }
    }

    private fun quoted(fragment: String): Set<String> =
        Regex("""'([^']+)'""").findAll(fragment).map { it.groupValues[1] }.toSet()

    private fun unionOf(typeName: String): Set<String> =
        quoted(Regex("""type $typeName = ([^;]+);""").find(block)!!.groupValues[1])

    /** The field names of the object literal that follows [label] on a method's line. */
    private fun fieldsAfter(line: String, label: String): Set<String> {
        val start = line.indexOf("$label: {")
        assertTrue("no \"$label: {\" in: $line", start >= 0)
        val inner = line.substring(start + label.length + 3).substringBefore("}")
        return Regex("""(\w+):""").findAll(inner).map { it.groupValues[1] }.toSet()
    }

    private fun line(method: String): String = methodLines[method] ?: error("$method is not in the contract")

    @Test
    fun everyContractMethodIsAPluginMethodAndNoOtherIsDeclared() {
        val declared = HealthConnectPlugin::class.java.declaredMethods
            .filter { it.isAnnotationPresent(PluginMethod::class.java) }
            .map { it.name }
            .toSet()
        assertEquals(11, methodLines.size)
        assertEquals(methodLines.keys, declared)
    }

    @Test
    fun readAndWriteKindsMatchTheContractUnions() {
        assertEquals(unionOf("HealthReadKind"), ReadKind.entries.map { it.wire }.toSet())
        assertEquals(unionOf("HealthWriteKind"), WriteKind.entries.map { it.wire }.toSet())
    }

    @Test
    fun availabilityStatesMatch() {
        assertEquals(quoted(line("availability")), Availability.entries.map { it.wire }.toSet())
    }

    @Test
    fun mealTypesMatch() {
        val mealType = line("writeNutrition").substringAfter("mealType:").substringBefore(";")
        assertEquals(quoted(mealType), MealSlot.entries.map { it.wire }.toSet())
    }

    @Test
    fun errorCodesMatch() {
        val sentence = text.substringAfter("Errors reject with a code:").substringBefore(".")
        val codes = Regex("`(\\w+)`").findAll(sentence).map { it.groupValues[1] }.toSet()
        assertEquals(codes, FailureCode.entries.map { it.wire }.toSet())
    }

    @Test
    fun resultRowsHaveTheContractFields() {
        val range = DayRange.fromArgs(mapOf("from" to "2026-10-01", "to" to "2026-10-01"))
        val day = dailyRows(range, emptySet(), emptyMap()).single().toWire()
        assertEquals(fieldsAfter(line("readDailyTotals"), "days"), day.keys)

        val session = SessionRow("id", "2026-10-01", "s", "e", "running", null, null, "app").toWire()
        assertEquals(fieldsAfter(line("readExerciseSessions"), "sessions"), session.keys)

        val weight = WeightRow("id", "t", 70.0, "app").toWire()
        assertEquals(fieldsAfter(line("readWeights"), "weights"), weight.keys)

        val kinds = KindSet(emptySet(), emptySet()).toWire()
        assertEquals(setOf("read", "write"), kinds.keys)
        assertTrue(line("grantedPermissions").contains("read: HealthReadKind[]; write: HealthWriteKind[]"))
    }

    @Test
    fun writeArgumentsUseTheContractFieldNames() {
        assertEquals(
            setOf("clientId", "time", "name", "mealType", "kcal", "proteinG", "carbsG", "fatG"),
            fieldsAfter(line("writeNutrition"), "records"),
        )
        assertTrue(line("writeWeight").contains("{ clientId: string; time: string; kg: number }"))
        assertTrue(line("deleteNutrition").contains("{ clientIds: string[] }"))
        assertTrue(line("deleteWeight").contains("{ clientIds: string[] }"))
        assertTrue(line("readDailyTotals").startsWith("o: { from: string; to: string }"))
    }

    @Test
    fun thePluginIsRegisteredUnderTheContractName() {
        assertTrue(text.contains("registerPlugin<HealthConnectPlugin>('HealthConnect')"))
        val annotation = HealthConnectPlugin::class.java
            .getAnnotation(com.getcapacitor.annotation.CapacitorPlugin::class.java)
        assertEquals("HealthConnect", annotation!!.name)
    }
}
