package app.platewise.android.health

import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FailureTest {
    @Test
    fun ourOwnFailuresKeepTheirCodeAndMessage() {
        val failure = HealthFailure(FailureCode.NOT_AVAILABLE, "Health Connect is notInstalled on this phone")
        assertEquals(FailureCode.NOT_AVAILABLE, failureCodeOf(failure))
        assertEquals("Health Connect is notInstalled on this phone", failureMessageOf(failure, FailureCode.NOT_AVAILABLE))
    }

    @Test
    fun clientExceptionsMapToContractCodes() {
        assertEquals(FailureCode.PERMISSION_DENIED, failureCodeOf(SecurityException("no grant")))
        assertEquals(FailureCode.INVALID_INPUT, failureCodeOf(IllegalArgumentException("bad record")))
        assertEquals(FailureCode.NOT_AVAILABLE, failureCodeOf(UnsupportedOperationException("not installed")))
        assertEquals(FailureCode.UNKNOWN, failureCodeOf(IOException("disk")))
        assertEquals(FailureCode.UNKNOWN, failureCodeOf(IllegalStateException("binder died")))
    }

    @Test
    fun aRateLimitIsFoundAnywhereInTheCauseChain() {
        val platform = RuntimeException("Rate limited request quota has been exceeded")
        assertEquals(FailureCode.RATE_LIMITED, failureCodeOf(IllegalStateException(platform)))
        assertEquals(FailureCode.RATE_LIMITED, failureCodeOf(SecurityException("API call quota exceeded")))
        assertTrue(mentionsRateLimit(Exception("RATE LIMIT")))
        assertFalse(mentionsRateLimit(Exception("ratelimiter")))
        assertFalse(mentionsRateLimit(Exception()))
    }

    @Test
    fun theAndroidSideCanAddItsOwnRateLimitTest() {
        val marked = IllegalStateException("code 8")
        assertEquals(FailureCode.RATE_LIMITED, failureCodeOf(marked) { it === marked })
    }

    @Test
    fun messagesOfClientExceptionsNameOnlyTheClass() {
        val message = failureMessageOf(IllegalArgumentException("weight 412 kg out of range"), FailureCode.INVALID_INPUT)
        assertFalse(message.contains("412"))
        assertTrue(message.endsWith("(IllegalArgumentException)"))
    }

    @Test
    fun aCauseLoopDoesNotHang() {
        val looped = object : Exception("outer") {
            override val cause: Throwable get() = this
        }
        assertEquals(FailureCode.UNKNOWN, failureCodeOf(looped))
    }
}
