package com.cms.student.bridge

import com.cms.student.media.ChunkWriter
import com.cms.student.media.ContentSource
import com.cms.student.media.HttpsMediaContentTransport
import com.cms.student.media.MediaDownloadCanceledException
import com.cms.student.media.TransportAuthorizationException
import com.cms.student.security.OfflineSession
import com.cms.student.security.OfflineTransportException
import java.io.OutputStream
import java.util.UUID

/**
 * Wave 5b-i — pure JVM adapter bridging the REAL [HttpsMediaContentTransport]
 * course-episode overload into the [CourseEpisodeDownloadFacade] the
 * [OfflineCourseBridgeService] consumes. The transport's `sink: () -> OutputStream`
 * callback is bridged into the service-owned [ChunkWriter] (each write lands in
 * the encrypted chunk sequence — no complete clear media file ever exists).
 *
 * Exception mapping (the service only ever sees [CourseDownloadException]):
 *  - [TransportAuthorizationException] → its 401/403 status code;
 *  - [MediaDownloadCanceledException] → null status (the service's own cancel
 *    flag distinguishes cancel from network);
 *  - [OfflineTransportException] → its status code (null when the network was
 *    unreachable).
 *
 * The [session] parameter is documented, not forwarded: the concrete transport
 * resolves its own session from the SAME provider (the shared
 * `activeSessionForMedia` seam in CmsApplication), so a session that died
 * between the service's resolution and the executor's run answers 401 honestly
 * through the transport itself.
 */
class HttpsCourseEpisodeDownloadFacade(
    private val transport: HttpsMediaContentTransport
) : CourseEpisodeDownloadFacade {

    override fun download(
        session: OfflineSession,
        subjectId: UUID,
        episodeId: UUID,
        sink: ChunkWriter,
        onProgress: (Int) -> Unit,
        isCanceled: () -> Boolean
    ): CourseEpisodeDownloadOutcome {
        var contentType: String? = null
        try {
            val bytes = transport.download(
                source = ContentSource.COURSE_EPISODE,
                contentId = episodeId.toString(),
                subjectId = subjectId,
                sink = { ChunkWriterOutputStream(sink) },
                onProgress = onProgress,
                isCanceled = isCanceled,
                onContentType = { contentType = it }
            )
            val entitlementExpiresAt = transport.currentEntitlementExpiresAt(subjectId)
            return CourseEpisodeDownloadOutcome(bytes, contentType, entitlementExpiresAt)
        } catch (auth: TransportAuthorizationException) {
            throw CourseDownloadException(auth.statusCode)
        } catch (canceled: MediaDownloadCanceledException) {
            throw CourseDownloadException(null)
        } catch (transportError: OfflineTransportException) {
            throw CourseDownloadException(transportError.statusCode)
        }
    }

    /** Narrow OutputStream view over one [ChunkWriter] (offset-safe copies only when needed). */
    private class ChunkWriterOutputStream(private val sink: ChunkWriter) : OutputStream() {
        private val single = ByteArray(1)

        override fun write(b: Int) {
            single[0] = b.toByte()
            sink.write(single, 1)
        }

        override fun write(b: ByteArray, off: Int, len: Int) {
            if (len <= 0) return
            val slice = if (off == 0 && len == b.size) b else b.copyOfRange(off, off + len)
            sink.write(slice, len)
        }
    }
}
