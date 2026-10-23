import { describe, expect, it } from 'vitest';
import { sanitizeActionUrl } from './sanitizeActionUrl';

/**
 * Security tests for notification actionUrl sanitization.
 *
 * The `origin` param is passed explicitly in every case so tests are
 * deterministic and do not depend on jsdom's default `window.location.origin`.
 */
const ORIGIN = 'https://app.example.com';

describe('sanitizeActionUrl', () => {
  describe('accepts valid internal paths', () => {
    const cases: Array<[string, string]> = [
      ['/dashboard', '/dashboard'],
      ['/subjects', '/subjects'],
      ['/subjects/math-101', '/subjects/math-101'],
      ['/subjects/math-101/lectures/42', '/subjects/math-101/lectures/42'],
      ['/exams', '/exams'],
      ['/exams/abc-123', '/exams/abc-123'],
      ['/exams/sess-9/review', '/exams/sess-9/review'],
      ['/library', '/library'],
      ['/favorites', '/favorites'],
      ['/profile', '/profile'],
      ['/notifications', '/notifications'],
      ['/stats', '/stats'],
      ['/leaderboard', '/leaderboard'],
      ['/activate-code', '/activate-code'],
      ['/settings', '/settings'],
      ['/terms', '/terms'],
      ['/privacy', '/privacy'],
      ['/', '/'],
    ];

    for (const [input, expected] of cases) {
      it(`accepts ${input}`, () => {
        expect(sanitizeActionUrl(input, ORIGIN)).toBe(expected);
      });
    }

    it('accepts a relative path without leading slash (resolved against origin)', () => {
      // `dashboard` resolves to `https://app.example.com/dashboard`
      expect(sanitizeActionUrl('dashboard', ORIGIN)).toBe('/dashboard');
    });

    it('accepts an absolute same-origin URL (base ignored, origin matches)', () => {
      expect(sanitizeActionUrl('https://app.example.com/dashboard', ORIGIN)).toBe('/dashboard');
    });

    it('preserves query string and hash on accepted paths', () => {
      expect(sanitizeActionUrl('/dashboard?ref=notif', ORIGIN)).toBe('/dashboard?ref=notif');
      expect(sanitizeActionUrl('/exams/123#section-2', ORIGIN)).toBe('/exams/123#section-2');
      expect(sanitizeActionUrl('/subjects/x?q=a&sort=desc#top', ORIGIN)).toBe(
        '/subjects/x?q=a&sort=desc#top',
      );
    });

    it('strips the origin from the returned value (always relative)', () => {
      const result = sanitizeActionUrl('https://app.example.com/dashboard', ORIGIN);
      expect(result).toBe('/dashboard');
      expect(result?.startsWith('http')).toBe(false);
    });
  });

  describe('rejects dangerous schemes', () => {
    const cases = [
      'javascript:alert(document.cookie)',
      'JAVASCRIPT:alert(1)', // uppercase
      '  javascript:alert(1)', // leading whitespace (trim'd)
      'javascript:alert(1)  ', // trailing whitespace
      'data:text/html,<script>alert(1)</script>',
      'DATA:text/html,<script>alert(1)</script>',
      'vbscript:msgbox("xss")',
      'file:///etc/passwd',
    ];

    for (const input of cases) {
      it(`rejects ${JSON.stringify(input)}`, () => {
        expect(sanitizeActionUrl(input, ORIGIN)).toBeNull();
      });
    }
  });

  describe('rejects external origins', () => {
    const cases = [
      'https://evil.com/dashboard',
      'http://evil.com/dashboard',
      'https://evil.com/',
      '//evil.com/dashboard', // protocol-relative → inherits https from base
      'https://app.example.com.evil.com/dashboard', // subdomain trick
      'https://app.example.com@evil.com/dashboard', // userinfo trick
      'http://localhost:8080/dashboard', // different port
    ];

    for (const input of cases) {
      it(`rejects ${JSON.stringify(input)}`, () => {
        expect(sanitizeActionUrl(input, ORIGIN)).toBeNull();
      });
    }
  });

  describe('rejects same-origin but non-whitelisted paths', () => {
    const cases = [
      '/admin',
      '/admin/users',
      '/api/users',
      '/api/internal/wipe',
      '/wp-admin',
      '/unknown-route',
      '/dashboard-evil', // prefix-but-not-allowed (NOT /dashboard/...)
    ];

    for (const input of cases) {
      it(`rejects ${JSON.stringify(input)}`, () => {
        expect(sanitizeActionUrl(input, ORIGIN)).toBeNull();
      });
    }
  });

  describe('rejects path traversal that normalizes off-whitelist', () => {
    const cases = [
      '/dashboard/../../etc/passwd', // normalizes to /etc/passwd
      '/subjects/../../../admin',
      '/exams/../admin/users',
    ];

    for (const input of cases) {
      it(`rejects ${JSON.stringify(input)}`, () => {
        expect(sanitizeActionUrl(input, ORIGIN)).toBeNull();
      });
    }
  });

  describe('rejects empty / nullish / malformed input', () => {
    const cases: Array<[string, unknown]> = [
      ['undefined', undefined],
      ['null', null],
      ['empty string', ''],
      ['whitespace only', '   '],
      ['tab+newline only', '\t\n'],
    ];

    for (const [label, input] of cases) {
      it(`rejects ${label}`, () => {
        expect(sanitizeActionUrl(input as string | undefined | null, ORIGIN)).toBeNull();
      });
    }

    it('rejects an absolute URL with an invalid port (new URL throws → catch returns null)', () => {
      // `new URL` throws TypeError("Invalid URL") on a non-numeric port.
      // Our try/catch must convert that to a null rejection, never a crash.
      expect(sanitizeActionUrl('https://app.example.com:abc/dashboard', ORIGIN)).toBeNull();
    });

    it('rejects an absolute URL with an invalid IPv6 host (new URL throws)', () => {
      expect(sanitizeActionUrl('https://[invalid-ipv6]/x', ORIGIN)).toBeNull();
    });
  });

  describe('whitelist boundary correctness', () => {
    // Ensure the whitelist matches exact prefixes, not just substring.
    it('accepts /dashboard/anything (prefix + slash)', () => {
      expect(sanitizeActionUrl('/dashboard/section-a', ORIGIN)).toBe('/dashboard/section-a');
    });

    it('rejects /dashboard-evil (substring without slash)', () => {
      expect(sanitizeActionUrl('/dashboard-evil', ORIGIN)).toBeNull();
    });

    it('accepts /subjects/deep/nested/path', () => {
      expect(sanitizeActionUrl('/subjects/math/lectures/42/questions', ORIGIN)).toBe(
        '/subjects/math/lectures/42/questions',
      );
    });
  });

  describe('default origin parameter (production behavior)', () => {
    // In production the function reads `window.location.origin`. We cannot
    // easily stub that here without mocking, so we only assert the contract:
    // when called with no origin, the function still returns a value for a
    // valid same-origin path relative to whatever window.location.origin is.
    it('does not throw when called with no origin argument', () => {
      // `/dashboard` is valid against ANY origin (it resolves to origin+/dashboard),
      // so the default-param path must accept it regardless of jsdom's origin.
      expect(sanitizeActionUrl('/dashboard')).toBe('/dashboard');
    });

    it('rejects javascript: even with no origin argument', () => {
      expect(sanitizeActionUrl('javascript:alert(1)')).toBeNull();
    });
  });
});
