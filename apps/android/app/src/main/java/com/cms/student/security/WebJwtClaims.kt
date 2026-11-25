package com.cms.student.security

import com.google.gson.JsonParser
import java.util.Base64

/**
 * W2 (UX 3C) — routing-only parser for the WEB session JWT the student-web page
 * may supply to the native bridge together with a package download request
 * (web→native token direction is allowed; native→web remains forbidden, D1).
 *
 * NO SIGNATURE VERIFICATION happens here, by design: the parsed subject and
 * expiry are ROUTING METADATA ONLY — they tell the bridge which student the
 * ephemeral [OfflineSession] should carry. The SERVER is the verifier: every
 * package download built on the ephemeral session re-presents the bearer token
 * to the API (entitlement issue + package download + status confirmation), so a
 * forged or tampered token buys nothing but a rejected download. Callers must
 * never treat [Claims.subject] as proof of identity.
 *
 * Never throws: any malformed input (wrong segment count, non-base64url
 * payload, non-JSON payload, missing/blank `sub`, non-string `sub`) answers
 * null and the caller fails closed (`denied_native_session`). A missing or
 * non-numeric `exp` yields a null [Claims.expiresAtEpochSeconds] — expiry is
 * not enforced client-side either.
 */
object WebJwtClaims {

    /** The only claims this parser consumes. `exp` is optional routing metadata. */
    data class Claims(val subject: String, val expiresAtEpochSeconds: Long?)

    /** Canonical hyphenated UUID shape for the subject (student ids on this platform). */
    val SUBJECT_UUID_PATTERN: Regex =
        Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

    fun parse(token: String): Claims? {
        val parts = runCatching { token.trim().split(".") }.getOrDefault(emptyList())
        if (parts.size != 3 || parts.any { it.isBlank() }) return null
        val payload = runCatching {
            String(Base64.getUrlDecoder().decode(parts[1]), Charsets.UTF_8)
        }.getOrNull() ?: return null
        val root = runCatching { JsonParser.parseString(payload) }.getOrNull() ?: return null
        if (!root.isJsonObject) return null
        val claims = root.asJsonObject

        val subject = runCatching {
            claims.get("sub")?.takeIf { it.isJsonPrimitive }?.asString
        }.getOrNull()?.trim()?.takeIf { it.isNotBlank() } ?: return null

        val expiresAt = runCatching {
            claims.get("exp")?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isNumber }?.asLong
        }.getOrNull()

        return Claims(subject = subject, expiresAtEpochSeconds = expiresAt)
    }
}
