/**
 * Terms of Use page — replaces href="#" placeholder.
 * Content is static (not legal advice). Update with real terms before production launch.
 */
export function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto py-8">
      <h1 className="text-2xl font-bold text-[var(--c-text)] mb-6">شروط الاستخدام</h1>
      <div className="prose prose-sm max-w-none text-[var(--c-text-soft)] space-y-4">
        <p>باستخدامك لمنصة CMS الطبية، فإنك توافق على الشروط التالية:</p>
        <h2 className="text-lg font-semibold text-[var(--c-text)]">1. الاستخدام الشخصي</h2>
        <p>المحتوى التعليمي مخصص لاستخدامك الشخصي فقط. لا يجوز إعادة توزيعه أو مشاركته مع أطراف ثالثة.</p>
        <h2 className="text-lg font-semibold text-[var(--c-text)]">2. الملكية الفكرية</h2>
        <p>جميع المواد التعليمية محمية بحقوق الملكية الفكرية. العلامة المائية المطبقة على الملفات تحدد هويتك.</p>
        <h2 className="text-lg font-semibold text-[var(--c-text)]">3. سلوك المستخدم</h2>
        <p>يجب الالتزام بآداب الاستخدام. لا يجوز محاولة الوصول غير المصرح به أو اختراق النظام.</p>
        <h2 className="text-lg font-semibold text-[var(--c-text)]">4. التعديلات</h2>
        <p>قد يتم تحديث هذه الشروط من وقت لآخر. استمرار استخدامك للمنصة يعني موافقتك على الشروط المحدثة.</p>
        <p className="text-xs text-[var(--c-text-faint)] mt-8">آخر تحديث: أكتوبر 2026 — هذه نسخة أولية يجب مراجعتها قانونياً قبل الإطلاق.</p>
      </div>
    </div>
  );
}
export { TermsPage as default } from "./TermsPage";
