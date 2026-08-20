import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { offlineApi, validateOfflineEnvelopeShape, type OfflineAnswer } from '../services/offline-api';
import { getApiErrorMessage } from '@/utils/api-error';
import {
  savePackage, getAllPackages, deletePackage, getUnsyncedAnswers,
  markAnswersSynced, getUnsyncedCount, cleanupExpiredPackages, clearAllOfflineData,
  type OfflinePackageData, type OfflineAnswerRecord,
} from '../services/offline-db';

/**
 * Hook for managing offline content.
 * Provides download, sync, and status tracking.
 */
const OFFLINE_ENABLED = import.meta.env.VITE_OFFLINE_ENABLED === 'true';

export function useOffline() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [packages, setPackages] = useState<OfflinePackageData[]>([]);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const refreshData = useCallback(async () => {
    const pkgs = await getAllPackages();
    setPackages(pkgs);
    const count = await getUnsyncedCount();
    setUnsyncedCount(count);
  }, []);

  // Load packages + unsynced count after refreshData is initialized.
  useEffect(() => {
    if (!OFFLINE_ENABLED) {
      clearAllOfflineData().then(refreshData).catch(() => undefined);
      return;
    }

    refreshData();
    cleanupExpiredPackages().then((deleted) => {
      if (deleted > 0) {
        refreshData();
        toast.info(`تم حذف ${deleted} حزمة منتهية الصلاحية`);
      }
    });
  }, [refreshData]);

  // Download a package for offline use
  const downloadPackage = useCallback(async (subjectId: string, examId?: string) => {
    if (!OFFLINE_ENABLED) {
      toast.error('التنزيل دون اتصال غير متاح حالياً لحماية المحتوى.');
      return;
    }
    setIsDownloading(true);
    try {
      const pkg = await offlineApi.download(subjectId, examId);

      // Store only the verified encrypted envelope. Browser-side signature/key verification
      // is intentionally fail-closed until the trusted native release integration is available.
      validateOfflineEnvelopeShape(pkg, subjectId);
      await savePackage({
        packageId: pkg.packageId,
        subjectId: pkg.subjectId,
        examId: pkg.examId,
        subjectName: pkg.subjectName,
        examTitle: pkg.examTitle,
        questionsCount: pkg.questionsCount,
        downloadedAt: pkg.downloadedAt,
        expiresAt: pkg.expiresAt,
        manifest: pkg.manifest,
        ciphertextBase64Url: pkg.ciphertextBase64Url,
        tagBase64Url: pkg.tagBase64Url,
        wrappedKeyBase64Url: pkg.wrappedKeyBase64Url,
        keyReleaseToken: pkg.keyReleaseToken,
      });

      await refreshData();
      toast.info(`تم حفظ حزمة مشفّرة تحتوي ${pkg.questionsCount} سؤالاً. الاستخدام المحلي يبقى معطلاً حتى يكتمل عميل التحقق الموثوق.`);
      return pkg;
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'تعذّر تحميل الحزمة'));
      throw err;
    } finally {
      setIsDownloading(false);
    }
  }, [refreshData]);

  // Save an offline answer (called when answering offline)
  const saveOfflineAnswer = useCallback(async (
    packageId: string,
    questionId: string,
    selectedOptionId: string,
    durationSeconds: number,
    isCorrect: boolean
  ) => {
    void packageId;
    void questionId;
    void selectedOptionId;
    void durationSeconds;
    void isCorrect;
    // The browser deliberately cannot decrypt or verify the release token without
    // a trusted native key-release integration; reject answer capture rather than
    // creating unverifiable local state.
    throw new Error('إدخال إجابات Offline في المتصفح معطّل حتى يتوفر عميل التحقق الموثوق.');
  }, []);

  // Sync all unsynced answers to the server
  const syncAnswers = useCallback(async (onlineEvent = false) => {
    if (!OFFLINE_ENABLED) {
      await clearAllOfflineData();
      await refreshData();
      return;
    }
    if (!isOnline && !onlineEvent) {
      toast.info('لا يمكن المزامنة دون اتصال');
      return;
    }

    const unsynced = await getUnsyncedAnswers();
    if (unsynced.length === 0) {
      return;
    }

    setIsSyncing(true);
    try {
      // Group answers by package
      const byPackage = new Map<string, OfflineAnswerRecord[]>();
      for (const ans of unsynced) {
        const list = byPackage.get(ans.packageId) || [];
        list.push(ans);
        byPackage.set(ans.packageId, list);
      }

      let totalSynced = 0;
      let totalFailed = 0;

      // Sync each package's answers
      for (const [packageId, answers] of byPackage) {
        const apiAnswers: OfflineAnswer[] = answers.map(a => ({
          questionId: a.questionId,
          selectedOptionId: a.selectedOptionId,
          durationSeconds: a.durationSeconds,
          answeredAt: a.answeredAt,
          isCorrect: a.isCorrect,
        }));

        try {
          const result = await offlineApi.sync(packageId, apiAnswers);
          totalSynced += result.successCount;
          totalFailed += result.failedCount;

          // Mark as synced in IndexedDB
          await markAnswersSynced(answers.map(a => a.id!));
        } catch (err) {
          totalFailed += answers.length;
        }
      }

      await refreshData();

      if (totalSynced > 0) {
        toast.success(`تمت مزامنة ${totalSynced} إجابة بنجاح`);
      }
      if (totalFailed > 0) {
        toast.error(`فشلت مزامنة ${totalFailed} إجابة`);
      }
    } catch (err) {
      toast.error('تعذّرت المزامنة. حاول لاحقاً.');
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, refreshData]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('عاد الاتصال! جاري مزامنة إجاباتك...');
      void syncAnswers(true);
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.info('أنت غير متصل. يمكنك حل الأسئلة المحمّلة Offline.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncAnswers]);

  // Delete a package
  const removePackage = useCallback(async (packageId: string) => {
    await deletePackage(packageId);
    await offlineApi.deletePackage(packageId).catch(() => {}); // Best effort
    await refreshData();
    toast.success('تم حذف الحزمة');
  }, [refreshData]);

  return {
    isOnline,
    packages,
    unsyncedCount,
    isDownloading,
    isSyncing,
    downloadPackage,
    saveOfflineAnswer,
    syncAnswers,
    removePackage,
    refreshData,
  };
}
