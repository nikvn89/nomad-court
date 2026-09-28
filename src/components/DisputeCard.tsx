import { Link } from 'react-router-dom';
import type { Dispute } from '../types';
import StatusPill from './StatusPill';
import { shortAddress, weiToGen } from '../lib/format';
import { phaseOf } from '../lib/disputes';

export default function DisputeCard({ dispute }: { dispute: Dispute }) {
  const resolved = phaseOf(dispute) === 'RESOLVED';

  return (
    <Link
      to={`/dispute/${dispute.id}`}
      className="glass-panel block p-5 transition hover:border-indigo-500/40"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-lg font-bold text-white">Case #{dispute.id}</span>
        <StatusPill dispute={dispute} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-gray-500">Guest</dt>
          <dd className="font-mono text-gray-300">{shortAddress(dispute.guest)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Host</dt>
          <dd className="font-mono text-gray-300">{shortAddress(dispute.host)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Bond</dt>
          <dd className="text-gray-200">{weiToGen(dispute.depositWei)} GEN</dd>
        </div>
        <div>
          <dt className="text-gray-500">Split</dt>
          <dd className="text-gray-200">
            {resolved ? `${dispute.guestShare}% guest / ${dispute.hostShare}% host` : '—'}
          </dd>
        </div>
      </dl>

      {resolved && dispute.rationale ? (
        <p className="mt-4 line-clamp-2 text-sm text-gray-400">{dispute.rationale}</p>
      ) : null}
    </Link>
  );
}
