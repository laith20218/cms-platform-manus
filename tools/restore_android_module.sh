#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)/apps/android"
mkdir -p "$root/app/src/main/java/com/cms/student/security" "$root/app/src/main/java/com/cms/student" "$root/app/src/test/java/com/cms/student/security"
cat > "$root/app/proguard-rules.pro" <<'EOF'
# Release minification is intentionally disabled until signing/provenance gates close.
EOF
cat > "$root/app/src/main/java/com/cms/student/CmsApplication.kt" <<'EOF'
package com.cms.student
import android.app.Application
class CmsApplication : Application() { companion object { const val offlineEnabled = false } }
EOF
cat > "$root/app/src/main/java/com/cms/student/MainActivity.kt" <<'EOF'
package com.cms.student
import android.os.Bundle
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
class MainActivity : AppCompatActivity() { override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE) } }
EOF
cat > "$root/app/src/main/java/com/cms/student/security/PlayIntegrityHelper.kt" <<'EOF'
package com.cms.student
enum class IntegrityCheckpoint { LOGIN, OFFLINE_DOWNLOAD, SENSITIVE_CONTENT, PERIODIC_REFRESH }
enum class IntegrityVerdict { NOT_CONFIGURED, ACCEPTED, REJECTED }
class PlayIntegrityHelper { fun evaluate(checkpoint: IntegrityCheckpoint, requestHash: String): IntegrityVerdict { require(requestHash.isNotBlank()) { "request hash is required" }; return IntegrityVerdict.NOT_CONFIGURED } }
EOF
cat > "$root/app/src/main/java/com/cms/student/security/OfflinePackageModels.kt" <<'EOF'
package com.cms.student.security
import java.time.Instant
import java.util.UUID
data class OfflinePackageManifest(val packageId: UUID, val userId: UUID, val installationId: String, val contentVersion: Int, val allowedSubjects: List<UUID>, val issuedAt: Instant, val expiresAt: Instant, val nonceBase64Url: String, val aadHashBase64Url: String, val signatureBase64Url: String)
data class OfflinePackageEnvelope(val manifest: OfflinePackageManifest, val ciphertextBase64Url: String, val tagBase64Url: String, val wrappedKeyBase64Url: String, val keyReleaseToken: String)
enum class RevocationStatus { ACTIVE, REVOKED, UNKNOWN }
fun interface ManifestSignatureVerifier { fun verify(manifest: OfflinePackageManifest): Boolean }
fun interface KeyReleaseTokenVerifier { fun verify(envelope: OfflinePackageEnvelope): Boolean }
fun interface RevocationStatusProvider { fun status(packageId: UUID): RevocationStatus }
fun interface PackageKeyProvider { fun withPackageKey(envelope: OfflinePackageEnvelope, use: (ByteArray) -> ByteArray): ByteArray? }
EOF
cat > "$root/app/src/main/java/com/cms/student/security/OfflinePackageVerifier.kt" <<'EOF'
package com.cms.student.security
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
class OfflinePackageVerifier(private val enabled: Boolean, private val manifestSignatureVerifier: ManifestSignatureVerifier, private val keyReleaseTokenVerifier: KeyReleaseTokenVerifier, private val revocationStatusProvider: RevocationStatusProvider, private val packageKeyProvider: PackageKeyProvider) {
 fun verifyAndDecrypt(e: OfflinePackageEnvelope, user: UUID, installation: String, subject: UUID, now: Instant = Instant.now()): ByteArray? { if (!enabled) return null; val m=e.manifest; if(m.packageId==UUID(0,0)||m.userId!=user||m.installationId!=installation||m.contentVersion<1||now<m.issuedAt||now>=m.expiresAt||m.expiresAt.isAfter(m.issuedAt.plusSeconds(604800))||subject !in m.allowedSubjects||e.keyReleaseToken.isBlank()||!keyReleaseTokenVerifier.verify(e)||revocationStatusProvider.status(m.packageId)!=RevocationStatus.ACTIVE||!manifestSignatureVerifier.verify(m)) return null; return packageKeyProvider.withPackageKey(e){ decrypt(e,it) } }
 private fun decrypt(e: OfflinePackageEnvelope,key:ByteArray):ByteArray { require(key.size==32); val n=d(e.manifest.nonceBase64Url); val c=d(e.ciphertextBase64Url); val t=d(e.tagBase64Url); require(n.size==12&&t.size==16&&c.isNotEmpty()); val aad=Phase36CanonicalManifest.serialize(e.manifest.copy(signatureBase64Url="")).toByteArray(StandardCharsets.UTF_8); return Cipher.getInstance("AES/GCM/NoPadding").run{init(Cipher.DECRYPT_MODE,SecretKeySpec(key,"AES"),GCMParameterSpec(128,n));updateAAD(aad);doFinal(c+t)} }
 private fun d(s:String)=java.util.Base64.getUrlDecoder().decode(s)
}
object Phase36CanonicalManifest { fun serialize(m:OfflinePackageManifest):String { val s=m.allowedSubjects.sorted().joinToString(","){q(it.toString().lowercase())}; return "{\"packageId\":${q(m.packageId.toString().lowercase())},\"userId\":${q(m.userId.toString().lowercase())},\"installationId\":${q(m.installationId)},\"contentVersion\":${m.contentVersion},\"allowedSubjects\":[$s],\"issuedAt\":${q(m.issuedAt.toString())},\"expiresAt\":${q(m.expiresAt.toString())},\"nonceBase64Url\":${q(m.nonceBase64Url)},\"aadHashBase64Url\":${q(m.aadHashBase64Url)}}" }; private fun q(v:String)=buildString{append('\"');v.forEach{c->when(c){'\\'->append("\\\\");'\"'->append("\\\"");'\n'->append("\\n");'\r'->append("\\r");'\t'->append("\\t");else->if(c.code<0x20)append("\\u%04x".format(c.code))else append(c)}};append('\"')} }
EOF
cat > "$root/app/src/test/java/com/cms/student/security/PlayIntegrityHelperTest.kt" <<'EOF'
package com.cms.student
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
class PlayIntegrityHelperTest { @Test fun `blank hash is rejected`()=assertThrows(IllegalArgumentException::class.java){PlayIntegrityHelper().evaluate(IntegrityCheckpoint.LOGIN,"")}; @Test fun `helper fails closed`()=assertEquals(IntegrityVerdict.NOT_CONFIGURED,PlayIntegrityHelper().evaluate(IntegrityCheckpoint.OFFLINE_DOWNLOAD,"A1234567890_-aBcDeFgHiJkLmNopQ")) }
EOF
cat > "$root/app/src/test/java/com/cms/student/security/OfflinePackageContractVectorTest.kt" <<'EOF'
package com.cms.student.security
import com.google.gson.Gson
import java.io.InputStreamReader
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Instant
import java.util.Base64
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
class OfflinePackageContractVectorTest {
 @Test fun `backend phase36 fixture decrypts natively`() { val v=vector(); assertTrue(v.testOnly); val e=envelope(v); val p=verifier(v,true).verifyAndDecrypt(e,UUID.fromString(v.expectedUserId),v.expectedInstallationId,UUID.fromString(v.expectedSubjectId),Instant.parse(v.verificationTimeUtc)); assertArrayEquals(v.expectedPlaintextUtf8.toByteArray(StandardCharsets.UTF_8),p) }
 @Test fun `backend fixture stays blocked when offline gate is false`() { val v=vector(); assertNull(verifier(v,false).verifyAndDecrypt(envelope(v),UUID.fromString(v.expectedUserId),v.expectedInstallationId,UUID.fromString(v.expectedSubjectId),Instant.parse(v.verificationTimeUtc))) }
 private fun vector()=Gson().fromJson(InputStreamReader(javaClass.classLoader!!.getResourceAsStream("phase36-contract-vector.json")!!),Vector::class.java)
 private fun envelope(v:Vector):OfflinePackageEnvelope { val m=v.envelope.manifest; return OfflinePackageEnvelope(OfflinePackageManifest(UUID.fromString(m.packageId),UUID.fromString(m.userId),m.installationId,m.contentVersion,m.allowedSubjects.map(UUID::fromString),Instant.parse(m.issuedAt),Instant.parse(m.expiresAt),m.nonceBase64Url,m.aadHashBase64Url,m.signatureBase64Url),v.envelope.ciphertextBase64Url,v.envelope.tagBase64Url,v.envelope.wrappedKeyBase64Url,v.envelope.keyReleaseToken) }
 private fun verifier(v:Vector,enabled:Boolean)=OfflinePackageVerifier(enabled,TestHmac(Base64.getDecoder().decode(v.testOnlyManifestSigningKeyBase64)),KeyReleaseTokenVerifier{it.keyReleaseToken==v.envelope.keyReleaseToken},RevocationStatusProvider{RevocationStatus.ACTIVE},PackageKeyProvider{_,use->use(Base64.getDecoder().decode(v.testOnlyPackageKeyBase64))})
 private class TestHmac(private val key:ByteArray):ManifestSignatureVerifier { override fun verify(m:OfflinePackageManifest):Boolean { val b=m.copy(aadHashBase64Url="",signatureBase64Url=""); val h=b64(MessageDigest.getInstance("SHA-256").digest(Phase36CanonicalManifest.serialize(b).toByteArray(StandardCharsets.UTF_8))); if(!MessageDigest.isEqual(h.toByteArray(),m.aadHashBase64Url.toByteArray()))return false; val s=b64(Mac.getInstance("HmacSHA256").run{init(SecretKeySpec(key,"HmacSHA256"));doFinal(Phase36CanonicalManifest.serialize(m.copy(signatureBase64Url="")).toByteArray(StandardCharsets.UTF_8))});return MessageDigest.isEqual(s.toByteArray(),m.signatureBase64Url.toByteArray())};private fun b64(b:ByteArray)=Base64.getUrlEncoder().withoutPadding().encodeToString(b) }
 private data class Vector(val schemaVersion:Int,val testOnly:Boolean,val expectedUserId:String,val expectedSubjectId:String,val expectedInstallationId:String,val verificationTimeUtc:String,val testOnlyManifestSigningKeyBase64:String,val testOnlyPackageKeyBase64:String,val envelope:Envelope,val expectedPlaintextUtf8:String)
 private data class Envelope(val manifest:Manifest,val ciphertextBase64Url:String,val tagBase64Url:String,val wrappedKeyBase64Url:String,val keyReleaseToken:String)
 private data class Manifest(val packageId:String,val userId:String,val installationId:String,val contentVersion:Int,val allowedSubjects:List<String>,val issuedAt:String,val expiresAt:String,val nonceBase64Url:String,val aadHashBase64Url:String,val signatureBase64Url:String)
}
EOF
