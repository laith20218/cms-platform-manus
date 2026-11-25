/**
 * TwoFactorCard — admin self-service 2FA (W4-C, matrix row 2: was UI=none).
 *
 * API contract (AdminAuthController, verified by recon):
 *   POST /api/v1/auth/admin/2fa/enable   (no body) → { qrCodeUrl, secret, recoveryCodes[] }
 *   POST /api/v1/auth/admin/2fa/disable  { password } → 204 NoContent
 *
 * Deviation documented in the PR: the API exposes NO "is 2FA enabled?" status
 * on login/me payloads, so the card cannot display the current state. It
 * therefore offers both flows and surfaces the API's own verdicts honestly
 * (e.g. disabling when not enabled returns the backend's Arabic error); it
 * never fakes a success state.
 */
import { useState } from 'react';
import { KeyRound, LoaderCircle, ShieldCheck, ShieldOff, Copy, Check } from 'lucide-react';
import { Button, Dialog } from '@cms/ui';
import { apiRequest } from '../lib/api';

type Enable2FAResponse = {
  qrCodeUrl: string;
  secret: string;
  recoveryCodes: string[];
};

type Props = {
  token: string;
  isArabic: boolean;
  adminName?: string;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

export function TwoFactorCard({ token, isArabic, adminName, onError, onNotice }: Props) {
  const [busy, setBusy] = useState<'enable' | 'disable' | null>(null);
  const [setup, setSetup] = useState<Enable2FAResponse | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState<'secret' | 'codes' | null>(null);

  const dir = isArabic ? 'rtl' : 'ltr';

  const copy = isArabic
    ? {
        title: 'أمان الحساب',
        subtitle: 'المصادقة الثنائية (2FA)',
        body: `طبقة حماية إضافية لحساب${adminName ? ` «${adminName}»` : 'ك'}: يُطلب رمز تحقق من تطبيق المصادقة عند كل تسجيل دخول. فعّلها من هنا، أو عطّلها بتأكيد كلمة المرور.`,
        enable: 'تفعيل المصادقة الثنائية',
        disable: 'تعطيل المصادقة الثنائية',
        setupTitle: 'تفعيل المصادقة الثنائية',
        setupBody: 'امسح رمز QR بتطبيق المصادقة (Google Authenticator / Authy…) أو أدخل المفتاح يدويًا، ثم أكّد في التطبيق.',
        qrAlt: 'رمز QR لإعداد تطبيق المصادقة',
        secretLabel: 'المفتاح اليدوي',
        codesLabel: 'رموز الاسترجاع (تظهر مرة واحدة فقط — احفظها الآن)',
        codesHint: 'تُستخدم مرة واحدة لكل رمز إذا فقدت جهازك.',
        copied: 'تم النسخ',
        done: 'تم التفعيل — أكّد الحساب في تطبيق المصادقة',
        disableTitle: 'تعطيل المصادقة الثنائية',
        disableBody: 'أدخل كلمة مرور حسابك لتأكيد التعطيل. سيعود تسجيل الدخول إلى الاعتماد على كلمة المرور فقط.',
        passwordLabel: 'كلمة المرور الحالية',
        passwordPlaceholder: 'كلمة مرور حسابك',
        disableConfirm: 'تأكيد التعطيل',
        cancel: 'إلغاء',
        disableOk: 'تم تعطيل المصادقة الثنائية',
        enableFail: 'فشل تفعيل المصادقة الثنائية',
        disableFail: 'فشل تعطيل المصادقة الثنائية',
      }
    : {
        title: 'Account security',
        subtitle: 'Two-factor authentication (2FA)',
        body: `An extra layer of protection for${adminName ? ` «${adminName}»` : ' your account'}: an authenticator code is required at every sign-in. Enable it here, or disable it with a password confirmation.`,
        enable: 'Enable 2FA',
        disable: 'Disable 2FA',
        setupTitle: 'Enable two-factor authentication',
        setupBody: 'Scan the QR code with your authenticator app (Google Authenticator / Authy…) or enter the key manually, then confirm in the app.',
        qrAlt: 'QR code for the authenticator app',
        secretLabel: 'Manual key',
        codesLabel: 'Recovery codes (shown once — save them now)',
        codesHint: 'Each code can be used once if you lose your device.',
        copied: 'Copied',
        done: 'Enabled — confirm the account in your authenticator app',
        disableTitle: 'Disable two-factor authentication',
        disableBody: 'Enter your account password to confirm. Sign-in will rely on the password only.',
        passwordLabel: 'Current password',
        passwordPlaceholder: 'Your password',
        disableConfirm: 'Confirm disable',
        cancel: 'Cancel',
        disableOk: 'Two-factor authentication disabled',
        enableFail: 'Failed to enable 2FA',
        disableFail: 'Failed to disable 2FA',
      };

  const enable = async () => {
    setBusy('enable');
    try {
      const result = await apiRequest<Enable2FAResponse>('/api/v1/auth/admin/2fa/enable', token, { method: 'POST' });
      setSetup({ qrCodeUrl: result.qrCodeUrl, secret: result.secret, recoveryCodes: result.recoveryCodes ?? [] });
      onNotice(copy.done);
    } catch (error) {
      onError(error instanceof Error ? error.message : copy.enableFail);
    } finally {
      setBusy(null);
    }
  };

  const disable = async () => {
    if (!password.trim()) return;
    setBusy('disable');
    try {
      await apiRequest<void>('/api/v1/auth/admin/2fa/disable', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      setDisableOpen(false);
      setPassword('');
      onNotice(copy.disableOk);
    } catch (error) {
      // Honest failure surfacing: wrong password / not-enabled come from the API.
      onError(error instanceof Error ? error.message : copy.disableFail);
    } finally {
      setBusy(null);
    }
  };

  const copyText = async (text: string, which: 'secret' | 'codes') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* clipboard unavailable — the text is selectable anyway */ }
  };

  return (
    <section
      className="rounded-xl border p-5 flex flex-col sm:flex-row sm:items-center gap-4"
      dir={dir}
      style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', boxShadow: 'var(--cms-shadow-xs)' }}
      data-testid="two-factor-card"
    >
      <div
        className="p-3 rounded-xl shrink-0"
        style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}
      >
        <ShieldCheck className="w-6 h-6" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
          {copy.title}
        </p>
        <h3 className="text-sm font-bold" style={{ color: 'var(--cms-text)' }}>{copy.subtitle}</h3>
        <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--cms-text-soft)' }}>{copy.body}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="primary"
          size="sm"
          loading={busy === 'enable'}
          disabled={busy !== null}
          icon={<KeyRound className="h-3.5 w-3.5" />}
          onClick={() => void enable()}
          data-testid="two-factor-enable"
        >
          {copy.enable}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy !== null}
          icon={<ShieldOff className="h-3.5 w-3.5" />}
          onClick={() => { setPassword(''); setDisableOpen(true); }}
          data-testid="two-factor-disable-open"
        >
          {copy.disable}
        </Button>
      </div>

      {/* ===== Enable result: QR + secret + recovery codes (shown once) ===== */}
      <Dialog
        open={setup !== null}
        onOpenChange={(next) => { if (!next) setSetup(null); }}
        title={copy.setupTitle}
        description={copy.setupBody}
        dir={dir}
        size="md"
        testId="two-factor-setup-dialog"
      >
        <div className="px-5 py-4 space-y-4">
          {setup && (
            <>
              <div className="flex justify-center">
                <img
                  src={setup.qrCodeUrl}
                  alt={copy.qrAlt}
                  width={180}
                  height={180}
                  className="rounded-lg border"
                  style={{ borderColor: 'var(--cms-line)', background: '#fff' }}
                  data-testid="two-factor-qr"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-medium" style={{ color: 'var(--cms-text-soft)' }}>{copy.secretLabel}</label>
                  <button
                    type="button"
                    onClick={() => void copyText(setup.secret, 'secret')}
                    className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                    style={{ color: 'var(--cms-teal-700)' }}
                  >
                    {copied === 'secret' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied === 'secret' ? copy.copied : ''}
                  </button>
                </div>
                <code
                  dir="ltr"
                  className="block w-full text-center font-mono text-xs tracking-wider px-3 py-2 rounded-lg border break-all"
                  style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-ivory-100)', color: 'var(--cms-text)' }}
                  data-testid="two-factor-secret"
                >
                  {setup.secret}
                </code>
              </div>
              {setup.recoveryCodes.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium" style={{ color: 'var(--cms-danger)' }}>{copy.codesLabel}</label>
                    <button
                      type="button"
                      onClick={() => void copyText(setup.recoveryCodes.join('\n'), 'codes')}
                      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                      style={{ color: 'var(--cms-teal-700)' }}
                    >
                      {copied === 'codes' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied === 'codes' ? copy.copied : ''}
                    </button>
                  </div>
                  <div
                    dir="ltr"
                    className="grid grid-cols-2 gap-1.5 font-mono text-[11px] p-2 rounded-lg border"
                    style={{ borderColor: 'var(--cms-danger)', background: 'var(--cms-danger-50)', color: 'var(--cms-text)' }}
                    data-testid="two-factor-recovery-codes"
                  >
                    {setup.recoveryCodes.map((code) => <span key={code} className="text-center">{code}</span>)}
                  </div>
                  <p className="text-[10px]" style={{ color: 'var(--cms-text-muted)' }}>{copy.codesHint}</p>
                </div>
              )}
            </>
          )}
          <div className="flex justify-end rounded-b-2xl">
            <Button variant="secondary" size="sm" onClick={() => setSetup(null)}>{copy.cancel}</Button>
          </div>
        </div>
      </Dialog>

      {/* ===== Disable: password confirmation (API requires it) ===== */}
      <Dialog
        open={disableOpen}
        onOpenChange={(next) => { if (!next && busy !== 'disable') setDisableOpen(false); }}
        title={copy.disableTitle}
        description={copy.disableBody}
        dir={dir}
        size="sm"
        dismissGuard={busy === 'disable'}
        testId="two-factor-disable-dialog"
      >
        <form
          className="px-5 py-4 space-y-4"
          onSubmit={(event) => { event.preventDefault(); void disable(); }}
        >
          <div className="space-y-1.5">
            <label htmlFor="two-factor-password" className="block text-xs font-medium" style={{ color: 'var(--cms-text-soft)' }}>
              {copy.passwordLabel}
              <span aria-hidden="true" style={{ color: 'var(--cms-danger)' }}> *</span>
            </label>
            <input
              id="two-factor-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={copy.passwordPlaceholder}
              autoComplete="current-password"
              disabled={busy === 'disable'}
              required
              data-testid="two-factor-password"
              className="w-full h-10 px-3 rounded-[10px] border text-sm"
              style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy === 'disable'}
              onClick={() => setDisableOpen(false)}
              data-testid="two-factor-disable-cancel"
            >
              {copy.cancel}
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              loading={busy === 'disable'}
              disabled={!password.trim()}
              data-testid="two-factor-disable-confirm"
            >
              {copy.disableConfirm}
            </Button>
          </div>
        </form>
      </Dialog>

      {busy && !disableOpen && setup === null && (
        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--cms-text-muted)' }}>
          <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
          {isArabic ? 'جارٍ التنفيذ...' : 'Working...'}
        </div>
      )}
    </section>
  );
}
