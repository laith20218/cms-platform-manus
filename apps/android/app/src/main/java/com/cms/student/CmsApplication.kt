package com.cms.student

import android.app.Application
import android.os.Handler
import android.os.Looper
import com.cms.student.media.CacheIndex
import com.cms.student.media.CacheProgressBus
import com.cms.student.media.CacheQuota
import com.cms.student.media.ChunkedFileStore
import com.cms.student.media.ConnectivityNetworkAvailability
import com.cms.student.media.EncryptedChunkedFileStore
import com.cms.student.media.EncryptedMediaCachePersistence
import com.cms.student.media.EncryptedMediaFileStore
import com.cms.student.media.HttpsMediaContentTransport
import com.cms.student.media.MediaCacheService
import com.cms.student.media.MediaFileStore
import com.cms.student.media.NativeMediaOpener
import com.cms.student.bridge.AuthenticatedOfflineRuntimeFacade
import com.cms.student.bridge.HttpsCourseEpisodeDownloadFacade
import com.cms.student.bridge.OfflineCourseBridgeService
import com.cms.student.bridge.OfflinePackageBridgeService
import com.cms.student.bridge.WebSessionEndApi
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
import com.cms.student.security.IOfflinePackageStore
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
        wipeOfflineStoresForNativeSessionDeath()
    }

    /** A 401 from any offline/API client means the stored tokens are dead; wipe them too. */
    fun onNativeAuthRejected() {
        activeSession = null
        sessionVerifiedThisProcess = false
        sessionManager.onAuthRejected()
        wipeOfflineStoresForNativeSessionDeath()
    }

    /**
     * Phase P (containment): a NATIVE session death is a full offline wipe —
     * sessionManager (above) already wiped the media cache through its
     * onTokensCleared hook; here the question-package envelopes go too
     * ([EncryptedOfflinePackageStore.wipeAll]) along with the W2/W3 bridge
     * runtime state (download states, package-id map, the last web-student
     * binding), and Wave 5b-i adds the hosted-course chunk store: the course
     * bridge state resets and `media-chunks` is wiped wholesale. Nothing
     * offline outlives a dead native session.
     */
    private fun wipeOfflineStoresForNativeSessionDeath() {
        offlinePackageBridgeService.reset()
        runCatching { offlinePackageStore.wipeAll() }
        lastWebStudentId = null
        offlineCourseBridgeService.reset()
        runCatching { courseChunkStore.deleteAll() }
    }

    // =====================================================================
    // W3 (UX 2A) — offline exam webview session graph
    // =====================================================================

    /**
     * Last student bound by a successful WEB-session package download — the
     * memory-only mirror of OfflinePackageBridgeService's binding (the service
     * reports every binding through its [OfflinePackageBridgeService]
     * onWebStudentBound seam). Never persisted; process death forgets it and the
     * next web-token download re-binds.
     */
    @Volatile
    var lastWebStudentId: UUID? = null
        private set

    /**
     * The student binding the offline exam webview resolves: the native session
     * (in-memory or stored token pair), else the last web-bound student as a
     * TOKEN-LESS [OfflineSession] (empty accessToken). Opening and answering stay
     * fully offline with that binding; sync then fails honestly (auth-rejected —
     * the answers stay encrypted locally) because no usable token exists.
     */
    fun offlineExamSession(): OfflineSession? =
        activeSessionForMedia() ?: lastWebStudentId?.let { OfflineSession(it, "", installationId) }

    /**
     * W3 (UX 2A) — session + runtime pair the exam activity resolves ONCE: the
     * coordinator behind the runtime is the same graph the native fallback
     * (OfflineExamActivity) uses. Null (no session OR trusted-offline disabled)
     * maps to the runner's honest `denied_session` phase.
     */
    fun offlineExamRuntimeBinding(): OfflineExamRuntimeBinding? {
        val coordinator = runtime ?: return null
        val session = offlineExamSession() ?: return null
        return OfflineExamRuntimeBinding(AuthenticatedOfflineRuntime(coordinator, session), session)
    }

    /** The shared encrypted package store (subject resolution in the exam runner). */
    fun offlinePackageStoreForExams(): IOfflinePackageStore = offlinePackageStore


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

    /**
     * ONE shared HTTPS media transport — the library cache AND the Wave 5b-i
     * course-episode adapter (same session provider, same pins, same base URL).
     */
    private val mediaTransport: HttpsMediaContentTransport by lazy {
        val baseApiUrl = AndroidOfflineBuildConfiguration.apiBaseUrl(BuildConfig.OFFLINE_API_BASE_URL, BuildConfig.API_BASE_URL)
        check(baseApiUrl.isNotBlank()) { "Media cache requires the HTTPS API base URL (BuildConfig validation guarantees one)" }
        HttpsMediaContentTransport(
            baseApiUrl,
            apiCertificatePins
        ) { activeSessionForMedia() }
    }

    private val mediaCacheService: MediaCacheService by lazy {
        MediaCacheService(
            index = CacheIndex(EncryptedMediaCachePersistence(this)),
            fileStore = mediaFileStore,
            transport = mediaTransport,
            quota = CacheQuota(),
            progressBus = mediaProgressBus,
            executor = mediaExecutor,
            opener = NativeMediaOpener(this),
            networkAvailability = ConnectivityNetworkAvailability(this),
            clock = Instant::now,
            sessionProvider = ::activeSessionForMedia,
            sessionRefresher = ::rotateNativeSessionForMedia,
            onAuthDead = ::onNativeAuthRejected,
            // Owner decision 2026-11-28: the 10 GiB cap is SHARED across media,
            // chunked episodes AND question packages — the guarded sink counts
            // every byte against this total before allowing the write.
            sharedOfflineBytes = ::totalOfflineBytes
        )
    }

    /**
     * Total offline-content bytes on this installation (Owner decision 2026-11-28):
     * library media + chunked course episodes + stored question packages. Read-only
     * aggregation, safe from any thread; each store computes its own total.
     */
    fun totalOfflineBytes(): Long =
        mediaCache().catalogEntries().sumOf { it.bytes } +
            runCatching { courseChunkStore.listMetas().sumOf { it.totalBytes } }.getOrDefault(0L) +
            runCatching { offlinePackageStore.totalBytes() }.getOrDefault(0L)

    /** Per-type offline byte totals for the truthful storage summary surface. */
    fun offlineStorageSummary(): StorageSummary = StorageSummary(
        mediaBytes = mediaCache().catalogEntries().sumOf { it.bytes },
        episodeBytes = runCatching { courseChunkStore.listMetas().sumOf { it.totalBytes } }.getOrDefault(0L),
        packageBytes = runCatching { offlinePackageStore.totalBytes() }.getOrDefault(0L),
        capBytes = com.cms.student.media.CachePolicy.MAX_CACHE_BYTES
    )

    /** Safe per-type storage totals surfaced through the bridge (no paths, no tokens). */
    data class StorageSummary(
        val mediaBytes: Long,
        val episodeBytes: Long,
        val packageBytes: Long,
        val capBytes: Long
    )

    /** The bridge-facing JSON form of [offlineStorageSummary] (stable keys, numbers only). */
    fun offlineStorageSummaryJson(): String {
        val s = offlineStorageSummary()
        return com.google.gson.Gson().toJson(
            linkedMapOf(
                "mediaBytes" to s.mediaBytes,
                "episodeBytes" to s.episodeBytes,
                "packageBytes" to s.packageBytes,
                "capBytes" to s.capBytes
            )
        )
    }

    /** The bridge-facing cache API (window.CmsNative Batch-4 methods). */
    fun mediaCache(): MediaCacheService = mediaCacheService

    /** The encrypted object store, shared with the viewer activities. */
    fun mediaFileStore(): MediaFileStore = mediaFileStore

    // =====================================================================
    // Wave 5b-i — hosted course-episode chunked AV bridge graph
    // =====================================================================

    /** Encrypted CHUNKED store for hosted course episodes (Phase Q: 4 MiB chunks). */
    private val courseChunkStore: ChunkedFileStore by lazy { EncryptedChunkedFileStore(this) }

    /** Dedicated single-thread executor for course-episode downloads (never the media/package executors). */
    private val courseExecutor by lazy { Executors.newSingleThreadExecutor() }

    private val offlineCourseBridgeService: OfflineCourseBridgeService by lazy {
        OfflineCourseBridgeService(
            // Pure JVM adapter over the SHARED media transport's course-episode
            // overload — the sink callback is bridged into the ChunkWriter so
            // no complete clear media file ever exists on disk.
            transport = HttpsCourseEpisodeDownloadFacade(mediaTransport),
            chunkStore = courseChunkStore,
            sessionProvider = ::activeSessionForMedia,
            installationId = { installationId },
            executor = courseExecutor,
            clock = Instant::now,
            // Honest combined cap (Owner decision 2026-11-28): the library cache
            // bytes + the chunked episode bytes share the 10 GiB
            // CachePolicy.MAX_CACHE_BYTES budget (packages count via the guarded
            // media sink's shared total).
            mediaBytesUsed = { mediaCache().catalogEntries().sumOf { it.bytes } },
            // W5b-ii: the chunked loopback player launches on the MAIN thread
            // (FLAG_SECURE OfflineCoursePlayerActivity; the in-process
            // reassembly server lives inside that activity and dies with it).
            playerLauncher = { episodeId ->
                Handler(Looper.getMainLooper()).post {
                    runCatching {
                        startActivity(OfflineCoursePlayerActivity.intent(this, episodeId))
                    }
                }
            }
        )
    }

    /** The bridge-facing hosted-course surface (window.CmsNative Wave 5b-i methods). */
    fun offlineCourseBridge(): OfflineCourseBridgeService = offlineCourseBridgeService

    /** The encrypted chunked episode store — shared by the bridge service and the W5b-ii player. */
    fun courseEpisodeStore(): com.cms.student.media.ChunkedFileStore = courseChunkStore

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
            clock = Instant::now,
            // W3 (UX 2A): mirror the service's web-student binding into the
            // application so the exam webview can resolve a token-less session.
            onWebStudentBound = { lastWebStudentId = it },
            // W3 (UX 2A): the panel's «بدء الامتحان» launches the hardened exam
            // webview — posted to the MAIN thread because openOfflineExam runs on
            // the shell WebView's JavaBridge thread; NEW_TASK because this is an
            // Application-context start (see OfflineExamWebActivity.intent).
            examLauncher = { packageId ->
                Handler(Looper.getMainLooper()).post {
                    runCatching {
                        startActivity(OfflineExamWebActivity.intent(this, UUID.fromString(packageId)))
                    }
                }
            },
            // Phase P (containment): a web-session end with NO surviving native
            // session is a full wipe — this seam lets the bridge service order the
            // media cache wipe in the same instant (the cache is installation-scoped,
            // so it is wiped from the application graph, not from inside the service).
            // Wave 5b-i: the hosted-course chunk store joins the full wipe (state
            // reset + wholesale media-chunks deletion).
            onFullWipe = {
                mediaCacheService.wipe()
                offlineCourseBridgeService.reset()
                runCatching { courseChunkStore.deleteAll() }
            }
        )
    }

    /** The bridge-facing offline packages surface (window.CmsNative W2 methods). */
    fun offlinePackageBridge(): OfflinePackageBridgeService = offlinePackageBridgeService

    /**
     * Phase P (containment) — the WebSessionEndApi the shell bridge delegates
     * `notifyWebSessionEnded()` to: the full wipe policy for a dead WEB session
     * (see [OfflinePackageBridgeService.onWebSessionEnded]).
     */
    fun webSessionEndApi(): WebSessionEndApi = WebSessionEndApi { offlinePackageBridgeService.onWebSessionEnded() }
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

/** W3 (UX 2A) — the exam activity's one-shot resolution: runtime + its session binding. */
data class OfflineExamRuntimeBinding(
    val runtime: AuthenticatedOfflineRuntime,
    val session: OfflineSession
)
