/**
 * PR-6 — shared SecurityEventType label mapping (extracted from
 * StudentsCenter.eventTypeLabel so StudentsCenter and SecurityCenter render
 * the same wire enum identically).
 *
 * Coverage: the FULL backend SecurityEventType enum (42 members,
 * CMS.Domain/Enums/Enums.cs) — every known value renders a bilingual
 * dictionary label; unknown values keep the legacy fallback behavior
 * (Arabic: authored fallback label; English: split-camelCase wire value).
 *
 * This module owns ONLY the wire-value → dictionary-path mapping; the
 * localized strings live in `students.security.events.*` (dictionary
 * section) so both centers share one vocabulary without duplicating the
 * switch statements.
 */
import { t, type Locale } from './dictionary';

/** eventType (wire value) → dictionary path under the students section. */
const SECURITY_EVENT_LABEL_PATHS: Record<string, string> = {
  LoginSuccess: 'students.security.events.loginSuccess',
  LoginFailed: 'students.security.events.loginFailed',
  Logout: 'students.security.events.logout',
  SessionCreated: 'students.security.events.sessionCreated',
  SessionRevoked: 'students.security.events.sessionRevoked',
  Refresh: 'students.security.events.refresh',
  RefreshReuse: 'students.security.events.refreshReuse',
  DeviceRegistered: 'students.security.events.deviceRegistered',
  DeviceChange: 'students.security.events.deviceChange',
  DeviceBindingFailed: 'students.security.events.deviceBindingFailed',
  DevtoolsDetected: 'students.security.events.devtoolsDetected',
  ScreenshotAttempt: 'students.security.events.screenshotAttempt',
  CopyAttempt: 'students.security.events.copyAttempt',
  DownloadAttempt: 'students.security.events.downloadAttempt',
  PrintAttempt: 'students.security.events.printAttempt',
  MultipleAccountsSuspected: 'students.security.events.multipleAccountsSuspected',
  BanIssued: 'students.security.events.banIssued',
  BanLifted: 'students.security.events.banLifted',
  PasswordChanged: 'students.security.events.passwordChanged',
  PasswordResetRequested: 'students.security.events.passwordResetRequested',
  MfaEnabled: 'students.security.events.mfaEnabled',
  MfaFailed: 'students.security.events.mfaFailed',
  MfaDisabled: 'students.security.events.mfaDisabled',
  PermissionChange: 'students.security.events.permissionChange',
  RoleChange: 'students.security.events.roleChange',
  SubscriptionActivated: 'students.security.events.subscriptionActivated',
  SubscriptionRevoked: 'students.security.events.subscriptionRevoked',
  OtpSent: 'students.security.events.otpSent',
  OtpVerified: 'students.security.events.otpVerified',
  OtpFailed: 'students.security.events.otpFailed',
  EntitlementDenied: 'students.security.events.entitlementDenied',
  OfflinePackageCreated: 'students.security.events.offlinePackageCreated',
  OfflinePackageRevoked: 'students.security.events.offlinePackageRevoked',
  OfflineSyncRejected: 'students.security.events.offlineSyncRejected',
  AdminScopeDenied: 'students.security.events.adminScopeDenied',
  SignedUrlIssued: 'students.security.events.signedUrlIssued',
  FileAccess: 'students.security.events.fileAccess',
  FileAccessDenied: 'students.security.events.fileAccessDenied',
  FileScanRejected: 'students.security.events.fileScanRejected',
  AdminAction: 'students.security.events.adminAction',
  SecurityAlert: 'students.security.events.securityAlert',
  SuspiciousActivity: 'students.security.events.suspiciousActivity',
};

/**
 * Localized event-type label. Unknown wire values keep the legacy
 * behavior: Arabic renders the authored fallback label; English echoes
 * the split-camelCase wire value.
 */
export function securityEventLabel(eventType: string, locale: Locale): string {
  const path = SECURITY_EVENT_LABEL_PATHS[eventType];
  if (path) return t(locale, path);
  return locale === 'ar'
    ? t(locale, 'students.security.events.fallback')
    : eventType.replace(/([A-Z])/g, ' $1').trim();
}

/** Ordered enum members — drives the SecurityCenter event-type filter. */
export const SECURITY_EVENT_TYPES: readonly string[] = Object.keys(SECURITY_EVENT_LABEL_PATHS);
