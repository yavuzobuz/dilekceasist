import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearTransientStorageItem,
  readTransientStorageItem,
  TRANSIENT_STORAGE_KEYS,
  writeTransientStorageItem,
} from '../src/utils/transientStorage';

describe('transientStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('prefers sessionStorage and falls back to legacy localStorage', () => {
    localStorage.setItem(TRANSIENT_STORAGE_KEYS.templateContent, 'legacy-value');
    expect(readTransientStorageItem(TRANSIENT_STORAGE_KEYS.templateContent)).toBe('legacy-value');

    sessionStorage.setItem(TRANSIENT_STORAGE_KEYS.templateContent, 'session-value');
    expect(readTransientStorageItem(TRANSIENT_STORAGE_KEYS.templateContent)).toBe('session-value');
  });

  it('writes to sessionStorage and removes stale localStorage data', () => {
    localStorage.setItem(TRANSIENT_STORAGE_KEYS.editorReturnRoute, '/app');

    writeTransientStorageItem(TRANSIENT_STORAGE_KEYS.editorReturnRoute, '/alt-app');

    expect(sessionStorage.getItem(TRANSIENT_STORAGE_KEYS.editorReturnRoute)).toBe('/alt-app');
    expect(localStorage.getItem(TRANSIENT_STORAGE_KEYS.editorReturnRoute)).toBeNull();
  });

  it('clears both storage locations', () => {
    localStorage.setItem(TRANSIENT_STORAGE_KEYS.templateContext, 'legacy');
    sessionStorage.setItem(TRANSIENT_STORAGE_KEYS.templateContext, 'current');

    clearTransientStorageItem(TRANSIENT_STORAGE_KEYS.templateContext);

    expect(sessionStorage.getItem(TRANSIENT_STORAGE_KEYS.templateContext)).toBeNull();
    expect(localStorage.getItem(TRANSIENT_STORAGE_KEYS.templateContext)).toBeNull();
  });
});
