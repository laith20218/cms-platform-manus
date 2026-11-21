package com.cms.student.security

/**
 * Batch 2 single place where session + installation identity headers are built for
 * every native offline/API request. Mirrors the student-web request interceptor
 * (`apps/student-web/src/services/api-client.ts`), which sends on every call:
 *
 *  - `Authorization: Bearer <access>` (authenticated calls)
 *  - `X-Installation-Id: <installation id>`
 *  - `X-Device-Fingerprint: <same value>` (compat: `/auth/refresh` and several
 *    controllers still read this name — `X-Installation-Id ?? X-Device-Fingerprint`)
 */
object OfflineRequestHeaders {

    const val AUTHORIZATION = "Authorization"
    const val INSTALLATION_ID = "X-Installation-Id"
    const val DEVICE_FINGERPRINT = "X-Device-Fingerprint"

    /**
     * Headers every native request carries, authenticated or not — the backend rate
     * limiter keys on `X-Installation-Id ?? X-Device-Fingerprint`, so login must send
     * them too, exactly like the web client.
     */
    fun installation(installationId: String): Map<String, String> {
        require(installationId.isNotBlank()) { "Installation id is required for request headers" }
        return linkedMapOf(
            INSTALLATION_ID to installationId,
            DEVICE_FINGERPRINT to installationId
        )
    }

    /** Authenticated request headers: Bearer access token + installation identity. */
    fun authenticated(session: OfflineSession): Map<String, String> {
        if (session.accessToken.isBlank() || session.installationId.isBlank()) {
            throw OfflineTransportException(message = "Authenticated installation session is required")
        }
        return linkedMapOf(
            AUTHORIZATION to "Bearer ${session.accessToken}",
            INSTALLATION_ID to session.installationId,
            DEVICE_FINGERPRINT to session.installationId
        )
    }
}
