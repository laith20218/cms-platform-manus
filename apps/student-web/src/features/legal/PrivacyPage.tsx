/**
 * Privacy Policy page — replaces href="#" placeholder.
 * Content is static (not legal advice). Update with real policy before production launch.
 */
export function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto py-8">
      <h1 className="text-2xl font-bold text-[var(--c-text)] mb-6">سياسة الخصوصية</h1>
      <div className="prose prose-sm max-w-none text-[var(--c-text-soft)] space-y-4">
        <p>نحن في منصة CMS الطبية نولي خصوصيتك أهمية قصوى. إليك كيف نتعامل مع بياناتك:</p>
        <h2 className="text-lg font-semibold text-[var(--c-text)]">1. البيانات التي نجمعها</h2>
        <p>نجمع الاسم، رقم الهاتف، الجامعة، والكلية لتقديم خدمة تعليمية مخصصة. لا نطلب معلومات حساسة كأرقام الحسابات البنكية.</p>
        <h2 className="text-lg font-semibold text-[var(--c-text)]">2. استخدام البيانات</h2>
        <p>تُستخدم بياناتك لتخصيص المحتوى التعليمي، إرسال الإشعارات، وتحسين جودة المنصة. لا نبيع بياناتك لأطراف ثالثة.</p>
        <h2 className="text-lg font-semibold text-[var(--c-text)]">3. حماية البيانات</h2>
        <p>نستخدم تشفير AES-256 للتخزين، TLS 1.3 للنقل، وعلامات مائية ديناميكية لحماية المحتوى. الوصول مقيد بصلاحيات RBAC.</p>
        <h2 className="text-lg font-semibold text-[var(--c-text)]">4. ربط الجهاز</h2>
        <p>نربط حسابك بجهاز محدد لمنع الاستخدام غير المصرح به. يمكنك التواصل مع الدعم لإلغاء ربط الجهاز عند الحاجة.</p>
        <h2 className="text-lg font-semibold text-[var(--c-text)]">5. حقوقك</h2>
        <p>لك الحق في الوصول إلى بياناتك، طلب تعديلها أو حذفها. تواصل مع الدعم الفني لممارسة هذه الحقوق.</p>
        <p className="text-xs text-[var(--c-text-faint)] mt-8">آخر تحديث: أكتوبر 2026 — هذه نسخة أولية يجب مراجعتها قانونياً قبل الإطلاق.</p>
      </div>
    </div>
  );
}
export { PrivacyPage as default } from "./PrivacyPage";
