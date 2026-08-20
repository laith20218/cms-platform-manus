package com.cms.student.security

import android.content.Context
import androidx.security.crypto.EncryptedFile
import androidx.security.crypto.MasterKey
import com.google.gson.Gson
import com.google.gson.JsonSyntaxException
import java.io.File
import java.time.Instant
import java.util.UUID

/**
 * Envelope-at-rest store backed by AndroidX EncryptedFile and an Android Keystore MasterKey.
 * The plaintext JSON only exists transiently while EncryptedFile reads or writes. Each record
 * carries both user and installation binding and is rejected if either value changes.
 */
class EncryptedOfflinePackageStore(context: Context) : IOfflinePackageStore {
    private val appContext = context.applicationContext
    private val directory = File(appContext.filesDir, "offline-envelopes").apply { mkdirs() }
    private val masterKey = MasterKey.Builder(appContext)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()
    private val gson = Gson()

    override fun saveEnvelope(envelope: OfflinePackageEnvelope, userId: UUID, installationId: String) {
        require(envelope.manifest.userId == userId) { "Envelope owner mismatch" }
        require(envelope.manifest.installationId == installationId) { "Envelope installation mismatch" }
        write(
            packageFile(envelope.manifest.packageId),
            StoredRecord.from(
                envelope = envelope,
                userId = userId,
                installationId = installationId,
                status = RevocationStatus.UNKNOWN,
                confirmedAt = null,
                answers = emptyList()
            )
        )
    }

    override fun load(packageId: UUID, userId: UUID, installationId: String): StoredOfflinePackage? {
        val record = read(packageFile(packageId)) ?: return null
        if (record.version != FORMAT_VERSION || record.packageId != packageId.toString() || record.userId != userId.toString() || record.installationId != installationId) {
            return null
        }
        return record.toDomainOrNull()
    }

    override fun replaceQuestionIndex(packageId: UUID, questionIds: Collection<UUID>, userId: UUID, installationId: String) {
        val record = read(packageFile(packageId)) ?: return
        if (record.userId != userId.toString() || record.installationId != installationId) return
        write(packageFile(packageId), record.copy(questionIds = questionIds.map(UUID::toString).distinct().sorted()))
    }

    override fun recordAnswer(answer: OfflineAnswer, userId: UUID, installationId: String): Boolean {
        val record = read(packageFile(answer.packageId)) ?: return false
        val packageRecord = record.toDomainOrNull() ?: return false
        if (
            record.userId != userId.toString() ||
            record.installationId != installationId ||
            answer.installationId != installationId ||
            answer.packageId != packageRecord.envelope.manifest.packageId ||
            answer.questionId.toString() !in record.questionIds ||
            !packageRecord.envelope.manifest.expiresAt.isAfter(Instant.now()) ||
            packageRecord.lastConfirmedStatus != RevocationStatus.ACTIVE
        ) return false

        val alreadyCaptured = packageRecord.answers.any { it.localAttemptId == answer.localAttemptId }
        if (alreadyCaptured) return true
        write(
            packageFile(answer.packageId),
            record.copy(answers = record.answers + StoredAnswer.from(answer))
        )
        return true
    }

    override fun pendingAnswers(packageId: UUID, userId: UUID, installationId: String): List<OfflineAnswer> =
        load(packageId, userId, installationId)?.answers?.filterNot { it.synced } ?: emptyList()

    override fun markAnswersSynced(packageId: UUID, localAttemptIds: Collection<UUID>, userId: UUID, installationId: String) {
        val record = read(packageFile(packageId)) ?: return
        if (record.userId != userId.toString() || record.installationId != installationId) return
        val completed = localAttemptIds.map { it.toString() }.toSet()
        write(packageFile(packageId), record.copy(answers = record.answers.map { answer ->
            if (answer.localAttemptId in completed) answer.copy(synced = true) else answer
        }))
    }

    override fun updateConfirmedStatus(packageId: UUID, status: RevocationStatus, confirmedAt: Instant?, userId: UUID, installationId: String) {
        val record = read(packageFile(packageId)) ?: return
        if (record.userId != userId.toString() || record.installationId != installationId) return
        write(packageFile(packageId), record.copy(lastConfirmedStatus = status.name, lastConfirmedAt = confirmedAt?.toString()))
    }

    override fun invalidate(packageId: UUID, userId: UUID, installationId: String) {
        val record = read(packageFile(packageId)) ?: return
        if (record.userId == userId.toString() && record.installationId == installationId) packageFile(packageId).delete()
    }

    private fun packageFile(packageId: UUID): File = File(directory, "$packageId.bin")

    private fun encryptedFile(file: File): EncryptedFile = EncryptedFile.Builder(
        appContext,
        file,
        masterKey,
        EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB
    ).build()

    private fun read(file: File): StoredRecord? = runCatching {
        if (!file.exists()) return null
        encryptedFile(file).openFileInput().bufferedReader(Charsets.UTF_8).use { reader ->
            gson.fromJson(reader, StoredRecord::class.java)
        }
    }.getOrNull()

    private fun write(file: File, record: StoredRecord) {
        val temporary = File(directory, "${file.name}.tmp")
        runCatching {
            encryptedFile(temporary).openFileOutput().bufferedWriter(Charsets.UTF_8).use { writer ->
                gson.toJson(record, writer)
            }
            if (file.exists() && !file.delete()) error("Unable to replace encrypted offline envelope")
            if (!temporary.renameTo(file)) error("Unable to publish encrypted offline envelope")
        }.onFailure {
            temporary.delete()
            throw IllegalStateException("Encrypted offline envelope persistence failed", it)
        }
    }

    private data class StoredRecord(
        val version: Int,
        val packageId: String,
        val userId: String,
        val installationId: String,
        val manifest: StoredManifest,
        val ciphertextBase64Url: String,
        val tagBase64Url: String,
        val wrappedKeyBase64Url: String,
        val keyReleaseToken: String,
        val lastConfirmedStatus: String,
        val lastConfirmedAt: String?,
        val questionIds: List<String>,
        val answers: List<StoredAnswer>
    ) {
        fun toDomainOrNull(): StoredOfflinePackage? = runCatching {
            val domainManifest = OfflinePackageManifest(
                packageId = UUID.fromString(manifest.packageId),
                userId = UUID.fromString(manifest.userId),
                installationId = manifest.installationId,
                contentVersion = manifest.contentVersion,
                allowedSubjects = manifest.allowedSubjects.map(UUID::fromString),
                issuedAt = Instant.parse(manifest.issuedAt),
                expiresAt = Instant.parse(manifest.expiresAt),
                nonceBase64Url = manifest.nonceBase64Url,
                aadHashBase64Url = manifest.aadHashBase64Url,
                signatureBase64Url = manifest.signatureBase64Url
            )
            if (domainManifest.packageId.toString() != packageId || domainManifest.userId.toString() != userId || domainManifest.installationId != installationId) return null
            StoredOfflinePackage(
                version = version,
                envelope = OfflinePackageEnvelope(domainManifest, ciphertextBase64Url, tagBase64Url, wrappedKeyBase64Url, keyReleaseToken),
                lastConfirmedStatus = RevocationStatus.valueOf(lastConfirmedStatus),
                lastConfirmedAt = lastConfirmedAt?.let(Instant::parse),
                answers = answers.map { it.toDomain() }
            )
        }.getOrNull()


        companion object {
            fun from(
                envelope: OfflinePackageEnvelope,
                userId: UUID,
                installationId: String,
                status: RevocationStatus,
                confirmedAt: Instant?,
                answers: List<OfflineAnswer>
            ): StoredRecord = StoredRecord(
                version = FORMAT_VERSION,
                packageId = envelope.manifest.packageId.toString(),
                userId = userId.toString(),
                installationId = installationId,
                manifest = StoredManifest.from(envelope.manifest),
                ciphertextBase64Url = envelope.ciphertextBase64Url,
                tagBase64Url = envelope.tagBase64Url,
                wrappedKeyBase64Url = envelope.wrappedKeyBase64Url,
                keyReleaseToken = envelope.keyReleaseToken,
                lastConfirmedStatus = status.name,
                lastConfirmedAt = confirmedAt?.toString(),
                questionIds = emptyList(),
                answers = answers.map(StoredAnswer::from)
            )
        }
    }

    private data class StoredManifest(
        val packageId: String,
        val userId: String,
        val installationId: String,
        val contentVersion: Int,
        val allowedSubjects: List<String>,
        val issuedAt: String,
        val expiresAt: String,
        val nonceBase64Url: String,
        val aadHashBase64Url: String,
        val signatureBase64Url: String
    ) {
        companion object {
            fun from(manifest: OfflinePackageManifest) = StoredManifest(
                manifest.packageId.toString(), manifest.userId.toString(), manifest.installationId,
                manifest.contentVersion, manifest.allowedSubjects.map(UUID::toString), manifest.issuedAt.toString(),
                manifest.expiresAt.toString(), manifest.nonceBase64Url, manifest.aadHashBase64Url, manifest.signatureBase64Url
            )
        }
    }

    private data class StoredAnswer(
        val localAttemptId: String,
        val packageId: String,
        val questionId: String,
        val selectedOptionId: String,
        val answeredAt: String,
        val durationSeconds: Int,
        val installationId: String,
        val synced: Boolean
    ) {
        fun toDomain() = OfflineAnswer(
            UUID.fromString(localAttemptId), UUID.fromString(packageId), UUID.fromString(questionId),
            UUID.fromString(selectedOptionId), Instant.parse(answeredAt), durationSeconds, installationId, synced
        )

        companion object {
            fun from(answer: OfflineAnswer) = StoredAnswer(
                answer.localAttemptId.toString(), answer.packageId.toString(), answer.questionId.toString(),
                answer.selectedOptionId.toString(), answer.answeredAt.toString(), answer.durationSeconds,
                answer.installationId, answer.synced
            )
        }
    }

    private companion object { const val FORMAT_VERSION = 1 }
}
