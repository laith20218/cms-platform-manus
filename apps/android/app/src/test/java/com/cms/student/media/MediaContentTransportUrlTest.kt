package com.cms.student.media

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Wave 5b-i JVM tests for the pure [buildContentUrl] routing math of the
 * media transport — the two frozen content paths:
 * LIBRARY → `{base}/library/{id}/content`;
 * COURSE_EPISODE → `{base}/media/course-episode/{id}/content`.
 *
 * Honest coverage note: the HTTPS network layer itself (HttpURLConnection,
 * pinning, headers, entitlement issue/renew, the 64 KB buffer loop) has NO JVM
 * HTTP layer here — it is exercised by CI instrumentation, exactly like the
 * Batch-4 transport before it. What this file locks is the URL contract the
 * frozen API routes depend on, including base normalization.
 */
class MediaContentTransportUrlTest {

    private val contentId = "11111111-2222-4333-8444-555555555555"

    @Test
    fun `library source builds the frozen library content path`() {
        assertEquals(
            "https://api.cms.example.com/library/$contentId/content",
            buildContentUrl("https://api.cms.example.com", ContentSource.LIBRARY, contentId)
        )
    }

    @Test
    fun `course episode source builds the frozen media course-episode path`() {
        assertEquals(
            "https://api.cms.example.com/media/course-episode/$contentId/content",
            buildContentUrl("https://api.cms.example.com", ContentSource.COURSE_EPISODE, contentId)
        )
    }

    @Test
    fun `a base with a trailing slash never double slashes`() {
        assertEquals(
            "https://api.cms.example.com/v1/media/course-episode/$contentId/content",
            buildContentUrl("https://api.cms.example.com/v1/", ContentSource.COURSE_EPISODE, contentId)
        )
        assertEquals(
            "https://api.cms.example.com/v1/library/$contentId/content",
            buildContentUrl("https://api.cms.example.com/v1", ContentSource.LIBRARY, contentId)
        )
    }

    @Test
    fun `a base with surrounding whitespace is trimmed`() {
        assertEquals(
            "https://api.cms.example.com/media/course-episode/$contentId/content",
            buildContentUrl("  https://api.cms.example.com  ", ContentSource.COURSE_EPISODE, contentId)
        )
    }

    @Test
    fun `path prefixes match the frozen API routes exactly`() {
        assertEquals("library", ContentSource.LIBRARY.pathPrefix)
        assertEquals("media/course-episode", ContentSource.COURSE_EPISODE.pathPrefix)
    }
}
