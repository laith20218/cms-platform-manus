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
