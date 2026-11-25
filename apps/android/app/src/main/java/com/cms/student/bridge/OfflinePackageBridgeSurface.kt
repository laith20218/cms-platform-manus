package com.cms.student.bridge

/**
 * W2 (UX 3C) — offline QUESTION PACKAGES surface exposed through
 * `window.CmsNative` by [CmsJsBridge]. Implemented by
 * [OfflinePackageBridgeService]; fakes drive the JVM bridge tests. Every
 * method returns a stable string status code (see [OfflinePackageBridgeService]
 * companion constants) — never throws, never exposes filesystem paths, tokens,
 * or package key material. The method names are the cross-wave contract with
 * apps/student-web/src/utils/native-packages.ts and must stay exact.
 */
interface OfflinePackageBridgeSurface {
    /** JSON array of safe package rows (packageId/subjectIds/status/expiresAt/counts). */
    fun listOfflinePackages(): String

    /** Starts (or answers) a package download from the serialized web request JSON. */
    fun downloadOfflinePackage(requestJson: String?): String

    /** `absent | queued | downloading | ready | denied_auth | error:<code>`. */
    fun offlinePackageStatus(packageId: String?): String

    /** Deletes one persisted package (store invalidation bound to user + installation). */
    fun removeOfflinePackage(packageId: String?): String

    /** Opens the offline exam player for a downloaded package. */
    fun openOfflineExam(packageId: String?): String
}
