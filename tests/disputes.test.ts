import { describe, expect, it } from 'vitest';
import type { Dispute } from '../src/types';
import {
  disputesForWallet,
  evidenceCount,
  parseDispute,
  phaseOf,
  scanDisputes,
  totalsOf,
  viewerRole,
} from '../src/lib/disputes';

const GUEST = '0x037f58e33c1ec8fda272361e0aac1e31054a1cde';
const HOST = '0x146e44881d35814ba582d265af5b97ef2695ec8e';
const STRANGER = '0x6276095faea15108740445ff277fda8c304657f4';

function payload(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    host: HOST,
    guest: GUEST,
    deposit_amount: '10000000000000000000',
    host_evidence_url: '',
    guest_evidence_url: '',
    rules_url: 'https://example.org/rules',
    status: 'OPEN',
    host_share: '0',
    guest_share: '0',
    rationale: '',
    ...over,
  });
}

function dispute(id: string, over: Partial<Dispute> = {}): Dispute {
  return { ...(parseDispute(id, payload()) as Dispute), ...over };
}

describe('parseDispute', () => {
  it('treats "{}" as a missing case, not an error', () => {
    expect(parseDispute('9', '{}')).toBeNull();
  });

  it('treats an empty response as missing', () => {
    expect(parseDispute('9', '')).toBeNull();
  });

  it('unwraps a { result } envelope', () => {
    expect(parseDispute('1', { result: payload() })?.host).toBe(HOST);
  });

  it('reads every field, keeping the deposit as a bigint', () => {
    const d = parseDispute('1', payload({ status: 'RESOLVED', host_share: '40', guest_share: '60' }));
    expect(d).not.toBeNull();
    expect(d!.id).toBe('1');
    expect(d!.depositWei).toBe(10_000_000_000_000_000_000n);
    expect(d!.hostShare).toBe(40);
    expect(d!.guestShare).toBe(60);
    expect(d!.status).toBe('RESOLVED');
  });

  it('returns null for malformed json rather than throwing', () => {
    expect(parseDispute('1', '{not json')).toBeNull();
  });
});

describe('scanDisputes', () => {
  function chainOf(ids: string[]) {
    return async (id: string) => (ids.includes(id) ? dispute(id) : null);
  }

  it('walks a contiguous run and stops at the end', async () => {
    const found = await scanDisputes(chainOf(['1', '2', '3']));
    expect(found.map((d) => d.id)).toEqual(['1', '2', '3']);
  });

  it('returns nothing when no case exists', async () => {
    expect(await scanDisputes(chainOf([]))).toEqual([]);
  });

  it('does not lose an id when a single hole appears', async () => {
    const found = await scanDisputes(chainOf(['1', '3']));
    expect(found.map((d) => d.id)).toEqual(['1', '3']);
  });

  it('honours the limit', async () => {
    const found = await scanDisputes(async (id) => dispute(id), 4);
    expect(found).toHaveLength(4);
  });
});

describe('viewerRole', () => {
  const d = dispute('1');

  it('is DISCONNECTED without a wallet', () => {
    expect(viewerRole(d, null)).toBe('DISCONNECTED');
  });

  it('reads GUEST and HOST from the contract fields', () => {
    expect(viewerRole(d, GUEST)).toBe('GUEST');
    expect(viewerRole(d, HOST)).toBe('HOST');
  });

  it('ignores address casing', () => {
    expect(viewerRole(d, GUEST.toUpperCase().replace('0X', '0x'))).toBe('GUEST');
  });

  it('is OBSERVER for any other wallet', () => {
    expect(viewerRole(d, STRANGER)).toBe('OBSERVER');
  });
});

describe('phaseOf and evidenceCount', () => {
  it('awaits evidence until both sides have filed', () => {
    expect(phaseOf(dispute('1'))).toBe('AWAITING_EVIDENCE');
    expect(evidenceCount(dispute('1'))).toBe(0);

    const half = dispute('1', { guestEvidenceUrl: 'https://a' });
    expect(phaseOf(half)).toBe('AWAITING_EVIDENCE');
    expect(evidenceCount(half)).toBe(1);
  });

  it('is ready to resolve with both', () => {
    const both = dispute('1', { guestEvidenceUrl: 'https://a', hostEvidenceUrl: 'https://b' });
    expect(phaseOf(both)).toBe('READY_TO_RESOLVE');
    expect(evidenceCount(both)).toBe(2);
  });

  it('is resolved once the status leaves OPEN', () => {
    expect(phaseOf(dispute('1', { status: 'RESOLVED' }))).toBe('RESOLVED');
  });
});

describe('totalsOf', () => {
  it('counts only open bonds as locked', () => {
    const totals = totalsOf([
      dispute('1'),
      dispute('2', { status: 'RESOLVED' }),
      dispute('3'),
    ]);
    expect(totals.cases).toBe(3);
    expect(totals.resolved).toBe(1);
    expect(totals.lockedWei).toBe(20_000_000_000_000_000_000n);
  });
});

describe('disputesForWallet', () => {
  it('splits by the role the contract records', () => {
    const all = [dispute('1'), dispute('2')];
    expect(disputesForWallet(all, GUEST).asGuest).toHaveLength(2);
    expect(disputesForWallet(all, GUEST).asHost).toHaveLength(0);
    expect(disputesForWallet(all, HOST).asHost).toHaveLength(2);
    expect(disputesForWallet(all, STRANGER).asGuest).toHaveLength(0);
  });
});
