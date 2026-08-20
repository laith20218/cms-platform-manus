import { describe, expect, it } from 'vitest';
import { validateOfflineEnvelopeShape, type OfflinePackage } from '@/features/offline/services/offline-api';

const subjectId = '11111111-1111-1111-1111-111111111111';

function validEnvelope(): OfflinePackage {
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  return {
    packageId: '22222222-2222-2222-2222-222222222222',
    subjectId,
    subjectName: 'Test subject',
    questionsCount: 1,
    downloadedAt: new Date().toISOString(),
    expiresAt,
    manifest: {
      packageId: '22222222-2222-2222-2222-222222222222',
      userId: '33333333-3333-3333-3333-333333333333',
      installationId: 'test-installation',
      contentVersion: 1,
      allowedSubjects: [subjectId],
      issuedAt: new Date().toISOString(),
      expiresAt,
      nonceBase64Url: 'nonce',
      aadHashBase64Url: 'aad',
      signatureBase64Url: 'signature',
    },
    ciphertextBase64Url: 'ciphertext',
    tagBase64Url: 'tag',
    wrappedKeyBase64Url: 'wrapped',
    keyReleaseToken: 'release-token',
  };
}

describe('validateOfflineEnvelopeShape', () => {
  it('accepts a complete, in-scope, non-expired encrypted envelope', () => {
    expect(() => validateOfflineEnvelopeShape(validEnvelope(), subjectId)).not.toThrow();
  });

  it('rejects expiry, subject-scope mismatch, and missing encrypted material', () => {
    const expired = validEnvelope();
    expired.expiresAt = new Date(Date.now() - 1_000).toISOString();
    expect(() => validateOfflineEnvelopeShape(expired, subjectId)).toThrow();

    const outOfScope = validEnvelope();
    outOfScope.manifest.allowedSubjects = [];
    expect(() => validateOfflineEnvelopeShape(outOfScope, subjectId)).toThrow();

    const incomplete = validEnvelope();
    incomplete.wrappedKeyBase64Url = '';
    expect(() => validateOfflineEnvelopeShape(incomplete, subjectId)).toThrow();
  });
});
