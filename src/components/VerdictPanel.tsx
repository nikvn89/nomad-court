import type { Dispute } from '../types';
import { weiToGen } from '../lib/format';

/**
 * The consensus outcome. `rationale` is model-written text, so it is rendered
 * as text — React escapes it — and never as markup.
 */
export default function VerdictPanel({ dispute }: { dispute: Dispute }) {
  const total = dispute.depositWei;
  const guestWei = (total * BigInt(dispute.guestShare)) / 100n;
  const hostWei = total - guestWei;

  return (
    <section className="glass-panel space-y-4 p-6">
      <h2 className="text-lg font-bold text-white">Consensus verdict</h2>

      <div className="h-3 w-full overflow-hidden rounded-full bg-gray-800">
        <div
          className="h-full bg-indigo-500"
          style={{ width: `${Math.max(0, Math.min(100, dispute.guestShare))}%` }}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500">Guest</p>
          <p className="text-xl font-bold text-white">{dispute.guestShare}%</p>
          <p className="text-gray-400">{weiToGen(guestWei)} GEN</p>
        </div>
        <div>
          <p className="text-gray-500">Host</p>
          <p className="text-xl font-bold text-white">{dispute.hostShare}%</p>
          <p className="text-gray-400">{weiToGen(hostWei)} GEN</p>
        </div>
      </div>

      {dispute.rationale ? (
        <div>
          <p className="text-sm font-semibold text-gray-300">Rationale</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-400">
            {dispute.rationale}
          </p>
        </div>
      ) : null}
    </section>
  );
}
