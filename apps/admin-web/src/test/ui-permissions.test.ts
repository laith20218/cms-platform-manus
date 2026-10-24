import { describe, it, expect } from 'vitest';
import {
  ALL_UI_KEYS,
  BUTTON_KEYS,
  ROLE_TEMPLATES,
  TAB_KEYS,
  UI_PERMISSION_LABELS,
  UI_PERMISSIONS_TREE,
  UI_PERMISSIONS_REGISTRY_VERSION,
  VIEW_KEYS,
  createCanFunction,
  type UiPermissionsBundle,
} from '../lib/uiPermissions';

/** Push 3 / Track 3: mirror-parity suite for the frontend UI permission registry (v2 — Push 4). */
describe('uiPermissions mirror', () => {
  it('carries exactly 70 keys', () => {
    expect(ALL_UI_KEYS).toHaveLength(70);
  });

  it('splits 12 views / 11 tabs / 47 buttons', () => {
    expect(VIEW_KEYS).toHaveLength(12);
    expect(TAB_KEYS).toHaveLength(11);
    expect(BUTTON_KEYS).toHaveLength(47);
    expect([...VIEW_KEYS, ...TAB_KEYS, ...BUTTON_KEYS]).toEqual([...ALL_UI_KEYS]);
  });

  it('formats every key as level:area(.item)?', () => {
    // Views are bare areas (view:overview); tabs and buttons add one dot-segment
    // (tab:overview.metrics, btn:codes.revoke-bulk).
    const pattern = /^(view|tab|btn):[a-z0-9-]+(\.[a-z0-9-]+)*$/;
    for (const key of ALL_UI_KEYS) {
      expect(key).toMatch(pattern);
    }
    for (const key of [...TAB_KEYS, ...BUTTON_KEYS]) {
      expect(key).toMatch(/\./);
    }
    for (const key of VIEW_KEYS) {
      expect(key).not.toMatch(/\./);
    }
  });

  it('covers every key exactly once across the tree', () => {
    expect(Object.keys(UI_PERMISSIONS_TREE).sort()).toEqual([...VIEW_KEYS].slice().sort());
    const flattened = Object.values(UI_PERMISSIONS_TREE).flat();
    expect(flattened).toHaveLength(70 - 12);
    expect(new Set(flattened).size).toBe(flattened.length);
    const everything = [...Object.keys(UI_PERMISSIONS_TREE), ...flattened];
    expect(everything.sort()).toEqual([...ALL_UI_KEYS].sort());
  });

  it('labels every key bilingually', () => {
    for (const key of ALL_UI_KEYS) {
      const label = UI_PERMISSION_LABELS[key];
      expect(label, `missing label for ${key}`).toBeDefined();
      expect(label.ar.length).toBeGreaterThan(0);
      expect(label.en.length).toBeGreaterThan(0);
    }
  });

  it('mirrors the backend registry version', () => {
    expect(UI_PERMISSIONS_REGISTRY_VERSION).toBe('v2');
  });

  it('keeps every template key inside the registry', () => {
    for (const template of ROLE_TEMPLATES) {
      for (const key of template.keys) {
        expect(ALL_UI_KEYS).toContain(key);
      }
    }
  });
});

describe('createCanFunction', () => {
  const fullBundle: UiPermissionsBundle = {
    mode: 'unconfigured',
    isSuperAdmin: false,
    registryVersion: UI_PERMISSIONS_REGISTRY_VERSION,
    allKeys: [...ALL_UI_KEYS],
    allowedKeys: [...ALL_UI_KEYS],
  };

  const customBundle: UiPermissionsBundle = {
    mode: 'custom',
    isSuperAdmin: false,
    registryVersion: UI_PERMISSIONS_REGISTRY_VERSION,
    allKeys: [...ALL_UI_KEYS],
    allowedKeys: ['view:codes', 'btn:codes.export'],
  };

  it('grants everything for full-access bundles (unconfigured = zero behavior change)', () => {
    const can = createCanFunction(fullBundle);
    expect(can('view:overview')).toBe(true);
    expect(can('btn:questions.create')).toBe(true);
    expect(can('tab:reports.operations')).toBe(true);
  });

  it('denies ungranted and unknown keys for custom bundles', () => {
    const can = createCanFunction(customBundle);
    expect(can('view:codes')).toBe(true);
    expect(can('btn:codes.export')).toBe(true);
    expect(can('view:overview')).toBe(false);
    expect(can('btn:questions.create')).toBe(false);
    expect(can('nope:unknown')).toBe(false);
  });

  it('fails open on a missing bundle (loading or fetch error) — the API is the real gate', () => {
    const can = createCanFunction(null);
    expect(can('view:overview')).toBe(true);
    expect(can('btn:questions.create')).toBe(true);
  });
});
