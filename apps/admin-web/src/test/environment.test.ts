import { describe, it, expect } from 'vitest';
import { resolveAdminEnvironment, apiOriginHost, environmentDictKey } from '../lib/environment';

/**
 * Phase 2 (deployment alignment) — the environment label is DERIVED from the
 * configured API origin. The production Admin must never claim «بيئة الإنتاج»
 * while calling the preview API, and a preview deployment must label itself
 * «بيئة المعاينة» — honestly, without any secret or private URL in the UI.
 */

describe('resolveAdminEnvironment', () => {
  it('classifies preview origins (dash-, dot- and subdomain-delimited)', () => {
    expect(resolveAdminEnvironment('https://cms-api-preview.onrender.com')).toBe('preview');
    expect(resolveAdminEnvironment('https://preview-api.example.com')).toBe('preview');
    expect(resolveAdminEnvironment('https://api.preview.example.com')).toBe('preview');
    expect(resolveAdminEnvironment('http://cms-api-preview.localhost.localdomain:8080')).toBe('preview');
  });

  it('classifies local origins', () => {
    expect(resolveAdminEnvironment('http://localhost:5100')).toBe('local');
    expect(resolveAdminEnvironment('http://127.0.0.1:5100')).toBe('local');
    expect(resolveAdminEnvironment('http://cms.local')).toBe('local');
  });

  it('classifies production origins (anything without a preview segment)', () => {
    expect(resolveAdminEnvironment('https://cms-api.onrender.com')).toBe('production');
    expect(resolveAdminEnvironment('https://api.cms-platform.example.com')).toBe('production');
  });

  it('refuses to guess on unparsable configuration', () => {
    expect(resolveAdminEnvironment('')).toBe('unknown');
    expect(resolveAdminEnvironment('not-a-url')).toBe('unknown');
  });

  it('does not misread "preview" inside unrelated words', () => {
    expect(resolveAdminEnvironment('https://api.repreview.example.com')).toBe('production');
  });
});

describe('apiOriginHost', () => {
  it('returns only the public host — never path, query or credentials', () => {
    expect(apiOriginHost('https://cms-api-preview.onrender.com/api/v1')).toBe('cms-api-preview.onrender.com');
    expect(apiOriginHost('https://user:secret@api.example.com/x?token=1')).toBe('api.example.com');
    expect(apiOriginHost('garbage')).toBe('');
  });
});

describe('environmentDictKey', () => {
  it('maps every environment to its bilingual dictionary key', () => {
    expect(environmentDictKey('production')).toBe('environment.production');
    expect(environmentDictKey('preview')).toBe('environment.preview');
    expect(environmentDictKey('local')).toBe('environment.local');
    expect(environmentDictKey('unknown')).toBe('environment.unknown');
  });
});
