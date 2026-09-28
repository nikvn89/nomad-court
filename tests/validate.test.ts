import { describe, expect, it } from 'vitest';
import { checkEvidenceUrl, checkHostAddress, isAddress } from '../src/lib/validate';

const WALLET_A = '0x6276095FAEA15108740445ff277fdA8c304657F4';
const WALLET_B = '0x037f58E33c1Ec8fdA272361E0aAC1e31054a1CDE';

describe('isAddress', () => {
  it('accepts a checksummed address', () => {
    expect(isAddress(WALLET_A)).toBe(true);
  });

  it('rejects wrong length and non-hex', () => {
    expect(isAddress('0x1234')).toBe(false);
    expect(isAddress(`0x${'z'.repeat(40)}`)).toBe(false);
  });
});

describe('checkEvidenceUrl', () => {
  it('accepts https', () => {
    expect(checkEvidenceUrl('https://example.org/proof.pdf').ok).toBe(true);
  });

  it('accepts http but warns that it is not encrypted', () => {
    const v = checkEvidenceUrl('http://example.org/proof.pdf');
    expect(v.ok).toBe(true);
    expect(v.warn).toBe(true);
  });

  it('rejects plain text, which the contract also rejects', () => {
    expect(checkEvidenceUrl('the air conditioning never worked').ok).toBe(false);
  });

  it('rejects a link with whitespace in it', () => {
    expect(checkEvidenceUrl('https://example.org/a b').ok).toBe(false);
  });

  it('rejects a bare scheme', () => {
    expect(checkEvidenceUrl('https://').ok).toBe(false);
  });

  it('tolerates padding, because pasted links carry it', () => {
    expect(checkEvidenceUrl('  https://example.org/proof.pdf  ').ok).toBe(true);
  });
});

describe('checkHostAddress', () => {
  it('accepts a different valid address', () => {
    expect(checkHostAddress(WALLET_B, WALLET_A).ok).toBe(true);
  });

  it('blocks the connected wallet, whatever the casing', () => {
    const v = checkHostAddress(WALLET_A.toLowerCase(), WALLET_A);
    expect(v.ok).toBe(false);
    expect(v.message).toContain('different accounts');
  });

  it('blocks the zero address', () => {
    expect(checkHostAddress(`0x${'0'.repeat(40)}`, WALLET_A).ok).toBe(false);
  });

  it('blocks an empty field', () => {
    expect(checkHostAddress('', WALLET_A).ok).toBe(false);
  });
});
