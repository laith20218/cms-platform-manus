package com.cms.student

import android.app.Application
import com.cms.student.security.AndroidKeystorePackageKeyProvider
import com.cms.student.security.AuthenticatedOfflinePackageStatusApi
import com.cms.student.security.CachedOfflineRevocationStatusProvider
import com.cms.student.security.EncryptedOfflinePackageStore
import com.cms.student.security.HttpsOfflinePackageClient
import com.cms.student.security.OfflineKeystoreKeyManager
import com.cms.student.security.OfflineRuntimeCoordinator
import com.cms.student.security.OfflineSession
import com.cms.student.security.OfflineTrustConfiguration
import com.cms.student.security.TrustedOfflineVerifierFactory
import com.cms.student.session.EncryptedInstallationIdStore
import com.cms.student.session.InstallationIdProvider
import java.util.UUID

class CmsApplication : Application() {
    companion object {
        /** Offline is deliberately disabled unless a release pipeline explicitly enables trusted configuration. */
        const val offlineEnabled = false
    }

    private lateinit var installationId: String
    private var activeSession: OfflineSession? = null
    private var runtime: OfflineRuntimeCoordinator? = null
    /** Session-scope identity (Batch 1): stable UUID per install, encrypted at rest. */
    private val installationIdProvider by lazy { InstallationIdProvider(EncryptedInstallationIdStore(this)) }
    private val apiClient: HttpsOfflinePackageClient? by lazy {
        AndroidOfflineBuildConfiguration.apiBaseUrl().takeIf(String::isNotBlank)?.let(::HttpsOfflinePackageClient)
    }

    override fun onCreate() {
        super.onCreate()
        installationId = installationIdProvider.installationId()
        runtime = createRuntimeOrNull()
    }

    /** Establishes an authenticated in-memory session from the backend login contract. */
    @Throws(com.cms.student.security.OfflineTransportException::class)
    fun loginStudent(phone: String, password: String, deviceName: String? = null): Boolean {
        val session = apiClient?.login(phone, password, installationId, deviceName)
            ?: return false
        return bindAuthenticatedStudent(session.studentId, session.accessToken)
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
    }

    fun authenticatedOfflineRuntime(): AuthenticatedOfflineRuntime? {
        val coordinator = runtime ?: return null
        val session = activeSession ?: return null
        return AuthenticatedOfflineRuntime(coordinator, session)
    }

    fun installationId(): String = installationId

    /** Session identity provider for later header injection (X-Installation-Id); not exposed to JS. */
    fun installationIdProvider(): InstallationIdProvider = installationIdProvider

    private fun createRuntimeOrNull(): OfflineRuntimeCoordinator? {
        val configuration = AndroidOfflineBuildConfiguration.trustConfiguration()
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
            packageStore = EncryptedOfflinePackageStore(this),
            revocationCache = cache,
            revocationRefresher = com.cms.student.security.OfflineRevocationRefresher(
                AuthenticatedOfflinePackageStatusApi(client) { activeSession },
                cache
            ),
            publicKeyProvider = { OfflineKeystoreKeyManager.getOrCreatePublicKeySpki(alias) }
        )
    }
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

private object AndroidOfflineBuildConfiguration {
    fun apiBaseUrl(): String = BuildConfig.OFFLINE_API_BASE_URL.trim()

    fun trustConfiguration(): OfflineTrustConfiguration {
        val enabled = BuildConfig.OFFLINE_TRUSTED_CLIENT_IMPLEMENTED
        val publicKey = BuildConfig.OFFLINE_MANIFEST_SIGNING_PUBLIC_KEY_SPKI_BASE64.trim().ifBlank { null }
        val alias = BuildConfig.OFFLINE_KEYSTORE_ALIAS.trim()
        if (enabled && (apiBaseUrl().isBlank() || publicKey == null || alias.isBlank())) {
            throw IllegalStateException("Trusted Offline cannot start without API URL, pinned public key, and keystore alias")
        }
        return OfflineTrustConfiguration(enabled, publicKey, alias)
    }
}
