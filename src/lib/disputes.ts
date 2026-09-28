import type { Dispute, Phase, Viewer } from '../types';
import { CONTRACT_ADDRESS, readClient } from './genlayer';
import { sameAddress } from './format';

/** Contract-side read cap. Raise only together with the explorer's paging. */
export const SCAN_LIMIT = 300;

function textOf(raw: any): string {
  if (typeof raw === 'string') return raw;
  if (typeof raw?.result === 'string') return raw.result;
  return '';
}

/**
 * get_dispute returns the literal string "{}" for an id that does not exist —
 * it does not revert. That is a normal answer, not an error, and it is what
 * lets the explorer walk ids without any extra contract method.
 */
export function parseDispute(id: string, raw: any): Dispute | null {
  const text = textOf(raw);
  if (!text || text === '{}') return null;

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed?.host) return null;

  return {
    id,
    host: String(parsed.host),
    guest: String(parsed.guest ?? ''),
    depositWei: BigInt(parsed.deposit_amount ?? '0'),
    hostEvidenceUrl: String(parsed.host_evidence_url ?? ''),
    guestEvidenceUrl: String(parsed.guest_evidence_url ?? ''),
    rulesUrl: String(parsed.rules_url ?? ''),
    status: String(parsed.status ?? ''),
    hostShare: Number(parsed.host_share ?? 0),
    guestShare: Number(parsed.guest_share ?? 0),
    rationale: String(parsed.rationale ?? ''),
  };
}

export async function readDispute(id: string): Promise<Dispute | null> {
  const raw = await readClient().readContract({
    address: CONTRACT_ADDRESS,
    functionName: 'get_dispute',
    args: [id],
  });
  return parseDispute(id, raw);
}

/**
 * Walk ids upward until the chain runs out.
 *
 * Dispute ids are sequential with no gaps: next_id starts at 1, only a
 * successful create_dispute advances it, and a reverted transaction rolls the
 * counter back with everything else. One empty id therefore means the end —
 * the extra look-ahead is belt and braces, and it costs one read.
 */
export async function scanDisputes(
  fetchOne: (id: string) => Promise<Dispute | null> = readDispute,
  limit = SCAN_LIMIT,
): Promise<Dispute[]> {
  const found: Dispute[] = [];

  for (let id = 1; id <= limit; id++) {
    const dispute = await fetchOne(String(id));

    if (dispute) {
      found.push(dispute);
      continue;
    }

    const lookahead = await fetchOne(String(id + 1));
    if (!lookahead) break;

    found.push(lookahead);
    id += 1;
  }

  return found;
}

export function viewerRole(dispute: Dispute | null, wallet: string | null): Viewer {
  if (!wallet) return 'DISCONNECTED';
  if (!dispute) return 'OBSERVER';
  if (sameAddress(wallet, dispute.guest)) return 'GUEST';
  if (sameAddress(wallet, dispute.host)) return 'HOST';
  return 'OBSERVER';
}

export function phaseOf(dispute: Dispute): Phase {
  if (dispute.status !== 'OPEN') return 'RESOLVED';
  if (dispute.hostEvidenceUrl && dispute.guestEvidenceUrl) return 'READY_TO_RESOLVE';
  return 'AWAITING_EVIDENCE';
}

export function evidenceCount(dispute: Dispute): number {
  return (dispute.hostEvidenceUrl ? 1 : 0) + (dispute.guestEvidenceUrl ? 1 : 0);
}

export interface ExplorerTotals {
  cases: number;
  resolved: number;
  lockedWei: bigint;
}

/** Every number on the explorer is derived here, from chain reads only. */
export function totalsOf(disputes: Dispute[]): ExplorerTotals {
  let resolved = 0;
  let lockedWei = 0n;

  for (const d of disputes) {
    if (phaseOf(d) === 'RESOLVED') resolved += 1;
    else lockedWei += d.depositWei;
  }

  return { cases: disputes.length, resolved, lockedWei };
}

export function disputesForWallet(disputes: Dispute[], wallet: string | null) {
  if (!wallet) return { asGuest: [], asHost: [] };
  return {
    asGuest: disputes.filter((d) => sameAddress(wallet, d.guest)),
    asHost: disputes.filter((d) => sameAddress(wallet, d.host)),
  };
}

const PASTE_ENDPOINT = 'https://bytebin.lucko.me/post';

/**
 * The contract stores a URL, never a file. When a guest writes the house rules
 * out by hand the app publishes that text to a public paste service and stores
 * the resulting link — and says so on screen, because the text leaves the
 * browser.
 */
export async function publishText(text: string): Promise<string> {
  const res = await fetch(PASTE_ENDPOINT, {
    method: 'POST',
    body: text,
    headers: { 'Content-Type': 'text/plain' },
  });
  if (!res.ok) throw new Error(`Could not publish the text (${res.status}).`);
  const json = await res.json();
  if (!json?.key) throw new Error('The paste service did not return a link.');
  return `https://bytebin.lucko.me/${json.key}`;
}
