import { beforeEach, describe, expect, it } from 'vitest';
import { getOrCreateInstallationId } from '@/utils';

describe('browser installation identity', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates an opaque installation ID once and returns the same value after rehydration', () => {
    const created = getOrCreateInstallationId();
    const rehydrated = getOrCreateInstallationId();

    expect(created).toMatch(/^web-[a-f0-9]{32}$/i);
    expect(rehydrated).toBe(created);
    expect(localStorage.getItem('cms-device-fingerprint')).toBe(created);
  });

  it('replaces a legacy malformed installation value before it is sent to the Backend', () => {
    localStorage.setItem('cms-device-fingerprint', 'legacy-unstable-fingerprint');

    const installationId = getOrCreateInstallationId();

    expect(installationId).toMatch(/^web-[a-f0-9]{32}$/i);
    expect(installationId).not.toBe('legacy-unstable-fingerprint');
  });
});
