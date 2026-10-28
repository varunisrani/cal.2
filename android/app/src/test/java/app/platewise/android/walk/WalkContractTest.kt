package app.platewise.android.walk

import app.platewise.android.PhaseContract
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The WalkTracker plugin against the TypeScript contract in the P15 phase file. */
class WalkContractTest {
    private val contract = PhaseContract("P15-walks-and-drive-backup.md")
    private val methods: Map<String, String> by lazy { contract.methods("WalkTrackerPlugin") }

    private fun ended(): Map<String, Any?> {
        val (walk, _) = WalkRecorder.begin("walk-1", 1_793_000_000_000L, recordsLocation = true, countsSteps = true)
        walk.end(1_793_000_060_000L)
        return walk.toWire(1_793_000_060_000L)
    }

    @Test
    fun everyContractMethodIsAPluginMethod() {
        val declared = WalkTrackerPlugin::class.java.declaredMethods
            .filter { it.isAnnotationPresent(PluginMethod::class.java) }
            .map { it.name }
            .toSet()
        // addListener is Capacitor's own, inherited by every plugin.
        assertEquals(methods.keys - "addListener", declared)
        assertEquals(
            setOf("checkPermissions", "requestPermissions", "start", "pause", "resume", "stop", "discard", "current", "addListener"),
            methods.keys,
        )
    }

    @Test
    fun theSnapshotHasTheContractFields() {
        val (walk, _) = WalkRecorder.begin("walk-1", 1_793_000_000_000L, recordsLocation = true, countsSteps = true)
        assertEquals(contract.fields("WalkSnapshot"), walk.toWire(1_793_000_000_000L).keys)
        // stop() and a walk stopped from the notification add endedAt.
        assertTrue(methods.getValue("stop").contains("WalkSnapshot & { endedAt: string }"))
        assertEquals(contract.fields("WalkSnapshot") + "endedAt", ended().keys)
    }

    @Test
    fun pointsAndSamplesHaveTheContractFields() {
        assertEquals(contract.fields("WalkPoint"), RoutePoint(1L, 0.0, 0.0, 5.0).toWire().keys)
        assertEquals(contract.fields("StepSample"), StepSampleRow(1L, 0).toWire().keys)
    }

    @Test
    fun statesMatchTheContractUnion() {
        assertEquals(contract.union("WalkState"), WalkPhase.entries.map { it.wire }.toSet())
        assertEquals("paused", ended()["state"])
    }

    @Test
    fun permissionCallsUseTheContractFields() {
        val states = walkPermissionStates(34, emptyMap(), notificationsOn = true)
        assertEquals(PhaseContract.objectAfter(methods.getValue("checkPermissions"), "Promise<"), states.keys)
        assertEquals(PhaseContract.objectAfter(methods.getValue("requestPermissions"), "Promise<"), states.keys)
        assertEquals(setOf("location", "activity"), PhaseContract.objectAfter(methods.getValue("requestPermissions"), "o: "))
        assertEquals(setOf("withRoute"), PhaseContract.objectAfter(methods.getValue("start"), "o: "))
    }

    @Test
    fun liveUpdatesUseTheContractEventName() {
        assertEquals(setOf(WALK_UPDATE), PhaseContract.quoted(methods.getValue("addListener").substringBefore(",")))
    }

    @Test
    fun thePluginIsRegisteredAsWalkTracker() {
        assertEquals("WalkTracker", WalkTrackerPlugin::class.java.getAnnotation(CapacitorPlugin::class.java)!!.name)
    }
}
