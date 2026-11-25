package com.cms.student.bridge

/**
 * Wave 5b-i — HOSTED COURSE EPISODE offline surface exposed through
 * `window.CmsNative` by [CmsJsBridge]. Implemented by
 * [OfflineCourseBridgeService]; fakes drive the JVM bridge tests. Every method
 * returns a stable string status code (see [OfflineCourseBridgeService]
 * companion constants) — never throws, never exposes filesystem paths, chunk
 * layouts, byte content, or token material. The method names are the FROZEN
 * cross-wave contract with
 * apps/student-web/src/utils/native-courses.ts (Wave 1) and must stay exact:
 *
 * ```
 * window.CmsNative.listOfflineCourseEpisodes()      // JSON array of safe rows
 * window.CmsNative.ensureCourseEpisodeLocal(json)   // start download -> status code
 * window.CmsNative.courseEpisodeStatus(episodeId)
 * window.CmsNative.removeOfflineCourseEpisode(episodeId)
 * window.CmsNative.openOfflineCourseEpisode(episodeId)
 * ```
 */
interface OfflineCourseBridgeSurface {

    /** JSON array of safe episode rows (episodeId/courseId?/title?/type/bytes/downloadedAt/lastAccessAt). */
    fun listOfflineCourseEpisodes(): String

    /** Starts (or answers) one hosted-episode download from the serialized web request JSON. */
    fun ensureCourseEpisodeLocal(episodeJson: String?): String

    /** `absent | queued | downloading | ready | denied_stale | denied_auth | error:<code>`. */
    fun courseEpisodeStatus(episodeId: String?): String

    /** Deletes one downloaded episode (chunks + encrypted meta). */
    fun removeOfflineCourseEpisode(episodeId: String?): String

    /** Opens one downloaded episode — interim Wave 5b-i answer (playback lands in 5b-ii). */
    fun openOfflineCourseEpisode(episodeId: String?): String
}
