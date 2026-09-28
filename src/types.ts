export type DisputeStatus = 'OPEN' | 'RESOLVED' | string;

export interface Dispute {
  id: string;
  host: string;
  guest: string;
  depositWei: bigint;
  hostEvidenceUrl: string;
  guestEvidenceUrl: string;
  rulesUrl: string;
  status: DisputeStatus;
  hostShare: number;
  guestShare: number;
  rationale: string;
}

/** Who the connected wallet is, relative to one dispute. */
export type Viewer = 'GUEST' | 'HOST' | 'OBSERVER' | 'DISCONNECTED';

export type Phase = 'AWAITING_EVIDENCE' | 'READY_TO_RESOLVE' | 'RESOLVED';
