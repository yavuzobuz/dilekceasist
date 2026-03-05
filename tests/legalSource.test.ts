import { describe, expect, it } from 'vitest';
import { normalizeLegalSource, resolveLegalSourceForQuery } from '../src/utils/legalSource';

describe('legalSource utils', () => {
  it('normalizes supported direct sources', () => {
    expect(normalizeLegalSource('yargitay')).toBe('yargitay');
    expect(normalizeLegalSource('danistay')).toBe('danistay');
    expect(normalizeLegalSource('all')).toBe('all');
  });

  it('returns null for unsupported source values', () => {
    expect(normalizeLegalSource('kik')).toBeNull();
    expect(normalizeLegalSource('')).toBeNull();
  });

  it('resolves explicit Danistay queries', () => {
    expect(resolveLegalSourceForQuery('Danistay kararlarini ara')).toBe('danistay');
  });

  it('resolves idari and imar domain queries to Danistay', () => {
    expect(resolveLegalSourceForQuery('3194 sayili imar kanunu ruhsatsiz yapi yikim karari')).toBe('danistay');
  });

  it('resolves explicit Yargitay queries', () => {
    expect(resolveLegalSourceForQuery('Yargitay 3. HD karar ara')).toBe('yargitay');
  });

  it('resolves mixed Yargitay and Danistay requests to all', () => {
    expect(resolveLegalSourceForQuery('Yargitay ve Danistay emsal karar ara')).toBe('all');
  });
});
