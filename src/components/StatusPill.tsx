import type { Dispute } from '../types';
import { phaseOf, evidenceCount } from '../lib/disputes';

const STYLES: Record<string, string> = {
  AWAITING_EVIDENCE: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  READY_TO_RESOLVE: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  RESOLVED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

export default function StatusPill({ dispute }: { dispute: Dispute }) {
  const phase = phaseOf(dispute);
  const label =
    phase === 'RESOLVED'
      ? 'Resolved'
      : phase === 'READY_TO_RESOLVE'
        ? 'Ready for adjudication'
        : `Awaiting evidence ${evidenceCount(dispute)}/2`;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${STYLES[phase]}`}
    >
      {label}
    </span>
  );
}
