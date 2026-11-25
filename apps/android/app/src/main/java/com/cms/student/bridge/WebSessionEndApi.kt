package com.cms.student.bridge

/**
 * Phase P (containment) — the seam behind bridge method #19
 * `notifyWebSessionEnded()`: the student-web page reports ITS OWN web session
 * ended (logout, or a 401 verdict routed through the session-store choke
 * point), and the native side answers with a stable status code describing
 * the wipe that ran. No data flows web→native — the only direction of effect
 * is native data DESTRUCTION (see [OfflinePackageBridgeService.onWebSessionEnded]
 * for the policy). Implemented by [OfflinePackageBridgeService]; fakes drive
 * the JVM bridge tests (exactly the shape [OfflinePackageBridgeSurface] and
 * [com.cms.student.media.CmsNativeCacheApi] follow).
 */
fun interface WebSessionEndApi {
    /**
     * Stable status code — `wiped` (no native session survived: the full
     * offline wipe ran) or `kept_native_session` (a live native session owns
     * its data; only the web binding was dropped). Never throws.
     */
    fun onWebSessionEnded(): String
}
