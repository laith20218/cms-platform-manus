package com.cms.student

import android.app.Application
import com.cms.student.media.CacheIndex
import com.cms.student.media.CacheProgressBus
import com.cms.student.media.CacheQuota
import com.cms.student.media.ConnectivityNetworkAvailability
import com.cms.student.media.EncryptedMediaCachePersistence
import com.cms.student.media.EncryptedMediaFileStore
import com.cms.student.media.HttpsMediaContentTransport
import com.cms.student.media.MediaCacheService
import com.cms.student.media.MediaFileStore
import com.cms.student.media.NativeMediaOpener
import com.cms.student.bridge.AuthenticatedOfflineRuntimeFacade
import com.cms.student.bridge.OfflinePackageBridgeService
import com.cms.student.security.AndroidKeystorePackageKeyProvider
import com.cms.student.security.AndroidOfflineBuildConfiguration
import com.cms.student.security.AuthenticatedOfflinePackageStatusApi
import com.cms.student.security.CachedOfflineRevocationStatusProvider
import com.cms.student.security.EncryptedOfflinePackageStore
import com.cms.student.security.HttpsOfflinePackageClient
import com.cms.student.security.OfflineKeystoreKeyManager
import com.cms.student.security.OfflineRuntimeCoordinator
import com.cms.student.security.OfflineSession
import com.cms.student.security.OfflineTransportException
import com.cms.student.security.OfflineTrustConfiguration
import com.cms.student.security.TrustedOfflineVerifierFactory
import com.cms.student.session.EncryptedInstallationIdStore
import com.cms.student.session.EncryptedTokenStore
import com.cms.student.session.InstallationIdProvider
import com.cms.student.session.KeystoreTokenSeal
import com.cms.student.session.NativeSessionManager
import com.cms.student.session.StoredNativeSession
import com.cms.student.session.TokenSeal
import com.cms.student.session.TokenStore
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Executors

class CmsApplication : Application() {
    companion object {
        /**
         * Trusted offline (question packages) is BuildConfig-driven (Owner decision
         * 2026-11-23): the repo default is OFF, and a release pipeline enables it by
         * building with OFFLINE_TRUSTED_CLIENT_IMPLEMENTED=true plus the full public
         * configuration — gradle fails closed on incomplete combinations, and the
         * runtime reader throws as a backstop. No private key material ever enters
         * the repo or the APK.
         */
        const val offlineEnabled = BuildConfig.OFFLINE_TRUSTED_CLIENT_IMPLEMENTED
    }

    private lateinit var installationId: String
    private var activeSession: OfflineSession? = null
    private var runtime: OfflineRuntimeCoordinator? = null
    /** Session-scope identity (Batch 1): stable UUID per install, encrypted at rest. */
    private val installationIdProvider by lazy { InstallationIdProvider(EncryptedInstallationIdStore(this)) }
    /** Batch 2: native login tokens (access + refresh) encrypted at rest, never plaintext, never logged. */
    private val tokenStore: TokenStore by lazy { EncryptedTokenStore(this) }
    private val sessionManager by lazy { NativeSessionManager(tokenStore) { mediaCacheService.wipe() } }
    @Volatile private var sessionVerifiedThisProcess = false
    /**
     * D-PIN (debt closure, 2026-11-24): the SPKI pin set parsed ONCE for every
     * native HTTPS client (session/offline + media). Fail-closed at first use when
     * mandatory pinning is compiled in but the set is empty — the runtime backstop
     * behind the gradle release gate (see AndroidOfflineBuildConfiguration.enforcePins).
     */
    private val apiCertificatePins: Set<String> by lazy {
        AndroidOfflineBuildConfiguration.enforcePins(
            BuildConfig.OFFLINE_API_SPKI_PINS_MANDATORY,
            BuildConfig.OFFLINE_API_SPKI_PINS_BASE64
        )
    }
    private val apiClient: HttpsOfflinePackageClient? by lazy {
        AndroidOfflineBuildConfiguration
            .apiBaseUrl(BuildConfig.OFFLINE_API_BASE_URL, BuildConfig.API_BASE_URL)
            .takeIf(String::isNotBlank)?.let { baseUrl ->
            HttpsOfflinePackageClient(baseUrl, apiCertificatePins)
        }
    }

    override fun onCreate() {
        super.onCreate()
        installationId = installationIdProvider.installationId()
        runtime = createRuntimeOrNull()
    }

    /** Establishes an authenticated in-memory session from the backend login contract. */
    @Throws(OfflineTransportException::class)
    fun loginStudent(phone: String, password: String, deviceName: String? = null): Boolean {
        val client = apiClient ?: return false
        val result = try {
            client.login(phone, password, installationId, deviceName)
        } catch (error: OfflineTransportException) {
            // Wrong credentials (401) must not leave a previous account's tokens behind.
            if (error.statusCode == 401) sessionManager.onAuthRejected()
            throw error
        }
        sessionManager.onLoginSucceeded(
            StoredNativeSession(result.studentId, result.accessToken, result.refreshToken)
        )
        sessionVerifiedThisProcess = true
        return bindAuthenticatedStudent(result.studentId, result.accessToken)
    }

    /** Login code must call this only after the backend returns an authenticated student access token. */
    fun bindAuthenticatedStudent(studentId: UUID, accessToken: String): Boolean {
        if (accessToken.isBlank()) return false
        activeSession = OfflineSession(studentId, accessToken, installationId)
        return true
    }

    /** Logout, password reset, or device revoke must remove the in-memory Offline authorisation context. */
    fun clearAuthenticatedStudent() {
        activeSession = null
        sessionVerifiedThisProcess = false
        sessionManager.onLoggedOut()
    }

    /** A 401 from any offline/API client means the stored tokens are dead; wipe them too. */
    fun onNativeAuthRejected() {
        activeSession = null
        sessionVerifiedThisProcess = false
        sessionManager.onAuthRejected()
    }

    /** Local encrypted read only — safe on the main thread; used to decide whether to attempt a restore. */
    fun hasStoredNativeSession(): Boolean = tokenStore.read() != null

    /**
     * Rehydrates the native session after process death (Batch 2). Must run off the
     * main thread. On success the caller can use [authenticatedOfflineRuntime] without
     * a fresh login; on auth rejection the store is wiped and the caller shows the
     * login screen again.
     */
    fun restoreNativeSession(): NativeSessionManager.RestoreResult {
        activeSession?.let { session ->
            // Already authenticated in this process (e.g. activity rotation) — no network needed.
            val stored = tokenStore.read()
                ?: return NativeSessionManager.RestoreResult.NoStoredSession
            return NativeSessionManager.RestoreResult.Restored(stored, sessionVerifiedThisProcess)
        }
        val client = apiClient ?: return NativeSessionManager.RestoreResult.NoStoredSession
        val result = sessionManager.restore { stored ->
            val rotated = client.refresh(stored.refreshToken, installationId)
            StoredNativeSession(stored.studentId, rotated.accessToken, rotated.refreshToken)
        }
        if (result is NativeSessionManager.RestoreResult.Restored) {
            sessionVerifiedThisProcess = result.verifiedByServer
            bindAuthenticatedStudent(result.session.studentId, result.session.accessToken)
        }
        return result
    }

    fun authenticatedOfflineRuntime(): AuthenticatedOfflineRuntime? {
        val coordinator = runtime ?: return null
        val session = activeSession ?: return null
        return AuthenticatedOfflineRuntime(coordinator, session)
    }

    fun installationId(): String = installationId

    /** Session identity provider for header injection (X-Installation-Id); not exposed to JS. */
    fun installationIdProvider(): InstallationIdProvider = installationIdProvider

    /**
     * D-JS-AUTH (debt closure, 2026-11-24): AndroidKeyStore-backed seal the bridge
     * uses for the student-web remember-me token blobs. Sealing tokens at rest is
     * the seal's ONLY purpose — never a token getter (D1 unchanged).
     */
    private val webViewTokenSeal: TokenSeal by lazy { KeystoreTokenSeal() }

    /** The bridge-facing token seal (window.CmsNative D-JS-AUTH methods). */
    fun webTokenSeal(): TokenSeal = webViewTokenSeal

    // =====================================================================
    // Batch 4 — encrypted media cache graph (files + index + quota + transport)
    // =====================================================================

    private val mediaExecutor by lazy { Executors.newSingleThreadExecutor() }
    private val mediaProgressBus by lazy { CacheProgressBus() }
    private val mediaFileStore: MediaFileStore by lazy { EncryptedMediaFileStore(this) }

    private val mediaCacheService: MediaCacheService by lazy {
        val baseApiUrl = AndroidOfflineBuildConfiguration.apiBaseUrl(BuildConfig.OFFLINE_API_BASE_URL, BuildConfig.API_BASE_URL)
        check(baseApiUrl.isNotBlank()) { "Media cache requires the HTTPS API base URL (BuildConfig validation guarantees one)" }
        MediaCacheService(
            index = CacheIndex(EncryptedMediaCachePersistence(this)),
            fileStore = mediaFileStore,
            transport = HttpsMediaContentTransport(
                baseApiUrl,
                apiCertificatePins
            ) { activeSessionForMedia() },
            quota = CacheQuota(),
            progressBus = mediaProgressBus,
            executor = mediaExecutor,
            opener = NativeMediaOpener(this),
            networkAvailability = ConnectivityNetworkAvailability(this),
            clock = Instant::now,
            sessionProvider = ::activeSessionForMedia,
            sessionRefresher = ::rotateNativeSessionForMedia,
            onAuthDead = ::onNativeAuthRejected
        )
    }

    /** The bridge-facing cache API (window.CmsNative Batch-4 methods). */
    fun mediaCache(): MediaCacheService = mediaCacheService

    /** The encrypted object store, shared with the viewer activities. */
    fun mediaFileStore(): MediaFileStore = mediaFileStore

    /** Native session for media downloads: the in-memory session, else the stored pair. */
    private fun activeSessionForMedia(): OfflineSession? {
        activeSession?.let { return it }
        val stored = tokenStore.read() ?: return null
        return OfflineSession(stored.studentId, stored.accessToken, installationId)
    }

    /** Rotates the stored pair once when a media download 401s; a rejected refresh wipes the session. */
    private fun rotateNativeSessionForMedia(): OfflineSession? {
        val client = apiClient ?: return null
        val stored = tokenStore.read() ?: return null
        return try {
            val rotated = client.refresh(stored.refreshToken, installationId)
            val next = StoredNativeSession(stored.studentId, rotated.accessToken, rotated.refreshToken)
            sessionManager.onLoginSucceeded(next)
            bindAuthenticatedStudent(next.studentId, next.accessToken)
            activeSession
        } catch (error: OfflineTransportException) {
            if (error.statusCode == 401) onNativeAuthRejected()
            null
        }
    }

    private fun createRuntimeOrNull(): OfflineRuntimeCoordinator? {
        val configuration = AndroidOfflineBuildConfiguration.trustConfiguration(
            enabled = BuildConfig.OFFLINE_TRUSTED_CLIENT_IMPLEMENTED,
            offlineApiBaseUrl = BuildConfig.OFFLINE_API_BASE_URL,
            fallbackApiBaseUrl = BuildConfig.API_BASE_URL,
            manifestSigningPublicKeySpkiBase64 = BuildConfig.OFFLINE_MANIFEST_SIGNING_PUBLIC_KEY_SPKI_BASE64,
            keystoreAlias = BuildConfig.OFFLINE_KEYSTORE_ALIAS
        )
        if (!configuration.offlineEnabled) return null
        val cache = CachedOfflineRevocationStatusProvider()
        val verifier = TrustedOfflineVerifierFactory.create(configuration, cache) ?: return null
        val client = apiClient ?: return null
        val alias = configuration.keystoreAlias
        return OfflineRuntimeCoordinator(
            trustConfiguration = configuration,
            verifier = verifier,
            packageClient = client,
            syncClient = client,
            packageStore = offlinePackageStore,
            revocationCache = cache,
            revocationRefresher = com.cms.student.security.OfflineRevocationRefresher(
                AuthenticatedOfflinePackageStatusApi(client) { activeSession },
                cache
            ),
            publicKeyProvider = { OfflineKeystoreKeyManager.getOrCreatePublicKeySpki(alias) }
        )
    }

    // =====================================================================
    // W2 (UX 3C) — offline question packages bridge graph
    // =====================================================================

    /** ONE shared encrypted envelope store — the runtime AND the packages bridge read the same bytes. */
    private val offlinePackageStore by lazy { EncryptedOfflinePackageStore(this) }

    /** Dedicated single-thread executor for package downloads (never the media executor). */
    private val packageExecutor by lazy { Executors.newSingleThreadExecutor() }

    private val offlinePackageBridgeService: OfflinePackageBridgeService by lazy {
        OfflinePackageBridgeService(
            // Null runtime (BuildConfig OFF) → the whole packages surface fails closed.
            runtime = {
                runtime?.let { coordinator ->
                    AuthenticatedOfflineRuntimeFacade { session, subjectId, examId ->
                        coordinator.download(session, subjectId, examId)
                    }
                }
            },
            packageStore = offlinePackageStore,
            sessionProvider = ::activeSessionForMedia,
            installationId = { installationId },
            executor = packageExecutor,
            clock = Instant::now
        )
    }

    /** The bridge-facing offline packages surface (window.CmsNative W2 methods). */
    fun offlinePackageBridge(): OfflinePackageBridgeService = offlinePackageBridgeService
}

/** Session-bound facade used by Activities and ViewModels; raw JWT is never exposed after binding. */
class AuthenticatedOfflineRuntime internal constructor(
    private val coordinator: OfflineRuntimeCoordinator,
    private val session: OfflineSession
) {
    fun download(subjectId: UUID, examId: UUID? = null): UUID? = coordinator.download(session, subjectId, examId)
    fun openOnline(packageId: UUID, subjectId: UUID) = coordinator.openOnline(session, packageId, subjectId)
    fun continueOffline(packageId: UUID, subjectId: UUID) = coordinator.continueOffline(session, packageId, subjectId)
    fun captureAnswer(packageId: UUID, questionId: UUID, selectedOptionId: UUID, durationSeconds: Int) =
        coordinator.captureAnswer(session, packageId, questionId, selectedOptionId, durationSeconds)
    fun pendingAnswers(packageId: UUID) = coordinator.pendingAnswers(session, packageId)
    fun sync(packageId: UUID, examSessionId: UUID? = null) = coordinator.sync(session, packageId, examSessionId)
    fun refreshStatus(packageId: UUID) = coordinator.refreshStatus(session, packageId)
}
