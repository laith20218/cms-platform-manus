import { apiClient } from '@/services/api-client';
import { entitlementRequestConfig } from '@/features/entitlements/services/entitlement-api';

export interface OfflinePackageManifest {
  packageId: string;
  userId: string;
  installationId: string;
  contentVersion: number;
  allowedSubjects: string[];
  issuedAt: string;
  expiresAt: string;
  nonceBase64Url: string;
  aadHashBase64Url: string;
  signatureBase64Url: string;
}

/**
 * Encrypted Phase-36/45 package envelope. It deliberately excludes plaintext
 * questions and any raw AES package key.
 */
export interface OfflinePackage {
  packageId: string;
  subjectId: string;
  examId?: string;
  subjectName: string;
  examTitle?: string;
  questionsCount: number;
  downloadedAt: string;
  expiresAt: string;
  manifest: OfflinePackageManifest;
  ciphertextBase64Url: string;
  tagBase64Url: string;
  wrappedKeyBase64Url: string;
  keyReleaseToken: string;
}

export interface OfflineAnswer {
  questionId: string;
  selectedOptionId: string;
  durationSeconds: number;
  answeredAt: string;
  isCorrect: boolean;
}

/**
 * Performs client-side structural, ownership, scope and expiry checks before
 * encrypted data is persisted. Signature verification and key release require
 * the native trusted client and are intentionally not faked in the browser.
 */
export function validateOfflineEnvelopeShape(pkg: OfflinePackage, expectedSubjectId: string): void {
  const now = Date.now();
  if (pkg.packageId !== pkg.manifest?.packageId || pkg.subjectId !== expectedSubjectId ||
      !pkg.manifest.allowedSubjects?.includes(expectedSubjectId) ||
      new Date(pkg.manifest.expiresAt).getTime() <= now ||
      new Date(pkg.expiresAt).getTime() <= now ||
      !pkg.ciphertextBase64Url || !pkg.tagBase64Url || !pkg.wrappedKeyBase64Url || !pkg.keyReleaseToken ||
      !pkg.manifest.signatureBase64Url || !pkg.manifest.nonceBase64Url) {
    throw new Error('حزمة Offline المشفّرة غير صالحة أو انتهت صلاحيتها');
  }
}

export const offlineApi = {
  download: async (subjectId: string, examId?: string): Promise<OfflinePackage> => {
    const entitlement = await entitlementRequestConfig();
    const res = await apiClient.post('/offline/download', { subjectId, examId }, {
      ...entitlement,
      headers: { ...entitlement.headers, 'X-Idempotency-Key': crypto.randomUUID() },
    });
    const pkg = res.data as OfflinePackage;
    validateOfflineEnvelopeShape(pkg, subjectId);
    return pkg;
  },

  sync: async (packageId: string, answers: OfflineAnswer[], examSessionId?: string) => {
    const res = await apiClient.post('/offline/sync', { packageId, examSessionId, answers });
    return res.data;
  },

  getPackages: async () => {
    const res = await apiClient.get('/offline/packages');
    return res.data;
  },

  deletePackage: async (packageId: string) => {
    await apiClient.delete(`/offline/packages/${packageId}`);
  },
};
