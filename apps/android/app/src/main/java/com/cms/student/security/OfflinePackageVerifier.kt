package com.cms.student.security
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
class OfflinePackageVerifier(private val enabled: Boolean, private val manifestSignatureVerifier: ManifestSignatureVerifier, private val keyReleaseTokenVerifier: KeyReleaseTokenVerifier, private val revocationStatusProvider: RevocationStatusProvider, private val packageKeyProvider: PackageKeyProvider) : IOfflinePackageDecryptor {
 override fun decrypt(e: OfflinePackageEnvelope, user: UUID, installation: String, subject: UUID, now: Instant): ByteArray? = verifyAndDecrypt(e, user, installation, subject, now)
 fun verifyAndDecrypt(e: OfflinePackageEnvelope, user: UUID, installation: String, subject: UUID, now: Instant = Instant.now()): ByteArray? { if (!enabled) return null; val m=e.manifest; if(m.packageId==UUID(0,0)||m.userId!=user||m.installationId!=installation||m.contentVersion<1||now<m.issuedAt||now>=m.expiresAt||m.expiresAt.isAfter(m.issuedAt.plusSeconds(604800))||subject !in m.allowedSubjects||e.keyReleaseToken.isBlank()||!keyReleaseTokenVerifier.verify(e)||revocationStatusProvider.status(m.packageId)!=RevocationStatus.ACTIVE||!manifestSignatureVerifier.verify(m)) return null; return packageKeyProvider.withPackageKey(e){ decrypt(e,it) } }
 private fun decrypt(e: OfflinePackageEnvelope,key:ByteArray):ByteArray { require(key.size==32); val n=d(e.manifest.nonceBase64Url); val c=d(e.ciphertextBase64Url); val t=d(e.tagBase64Url); require(n.size==12&&t.size==16&&c.isNotEmpty()); val aad=Phase36CanonicalManifest.serialize(e.manifest.copy(signatureBase64Url="")).toByteArray(StandardCharsets.UTF_8); return Cipher.getInstance("AES/GCM/NoPadding").run{init(Cipher.DECRYPT_MODE,SecretKeySpec(key,"AES"),GCMParameterSpec(128,n));updateAAD(aad);doFinal(c+t)} }
 private fun d(s:String)=java.util.Base64.getUrlDecoder().decode(s)
}
object Phase36CanonicalManifest {
 fun serialize(m:OfflinePackageManifest):String { val s=m.allowedSubjects.sorted().joinToString(","){q(it.toString().lowercase())}; return "{\"packageId\":${q(m.packageId.toString().lowercase())},\"userId\":${q(m.userId.toString().lowercase())},\"installationId\":${q(m.installationId)},\"contentVersion\":${m.contentVersion},\"allowedSubjects\":[$s],\"issuedAt\":${q(dotNetUtc(m.issuedAt))},\"expiresAt\":${q(dotNetUtc(m.expiresAt))},\"nonceBase64Url\":${q(m.nonceBase64Url)},\"aadHashBase64Url\":${q(m.aadHashBase64Url)}}" }
 private fun dotNetUtc(value: Instant): String {
  val time = value.atOffset(java.time.ZoneOffset.UTC)
  val base = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss").format(time)
  val ticks = (value.nano / 100).toString().padStart(7, '0').trimEnd('0')
  return if (ticks.isEmpty()) "${base}Z" else "${base}.${ticks}Z"
 }
 private fun q(v:String)=buildString{append('\"');v.forEach{c->when(c){'\\'->append("\\\\");'\"'->append("\\\"");'\n'->append("\\n");'\r'->append("\\r");'\t'->append("\\t");else->if(c.code<0x20)append("\\u%04x".format(c.code))else append(c)}};append('\"')}
}
