export const TRANSIENT_STORAGE_KEYS = {
  editorReturnRoute: 'editorReturnRoute',
  templateContent: 'templateContent',
  templateContext: 'templateContext',
} as const;

type TransientStorageKey = (typeof TRANSIENT_STORAGE_KEYS)[keyof typeof TRANSIENT_STORAGE_KEYS];

export const readTransientStorageItem = (key: TransientStorageKey): string | null => {
  const sessionValue = sessionStorage.getItem(key);
  if (sessionValue !== null) {
    return sessionValue;
  }

  return localStorage.getItem(key);
};

export const writeTransientStorageItem = (key: TransientStorageKey, value: string): void => {
  sessionStorage.setItem(key, value);
  localStorage.removeItem(key);
};

export const clearTransientStorageItem = (key: TransientStorageKey): void => {
  sessionStorage.removeItem(key);
  localStorage.removeItem(key);
};
