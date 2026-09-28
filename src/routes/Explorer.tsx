import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import type { Dispute } from '../types';
import { phaseOf, scanDisputes, totalsOf } from '../lib/disputes';
import { revertReason } from '../lib/genlayer';
import { weiToGen } from '../lib/format';
import DisputeCard from '../components/DisputeCard';
import Notice from '../components/Notice';

type Filter = 'ALL' | 'AWAITING_EVIDENCE' | 'READY_TO_RESOLVE' | 'RESOLVED';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'AWAITING_EVIDENCE', label: 'Awaiting evidence' },
  { key: 'READY_TO_RESOLVE', label: 'Ready to resolve' },
  { key: 'RESOLVED', label: 'Resolved' },
];

export default function Explorer() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');

  useEffect(() => {
    let alive = true;
    scanDisputes()
      .then((found) => {
        if (alive) setDisputes(found);
      })
      .catch((err) => {
        if (alive) setError(revertReason(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const totals = useMemo(() => totalsOf(disputes), [disputes]);
  const shown = useMemo(() => {
    const ordered = [...disputes].sort((a, b) => Number(b.id) - Number(a.id));
    return filter === 'ALL' ? ordered : ordered.filter((d) => phaseOf(d) === filter);
  }, [disputes, filter]);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-3xl font-bold text-white">Open case explorer</h1>
        <p className="max-w-2xl text-gray-400">
          Every case filed on NomadCourt, read straight from the contract. No wallet is needed to
          read this page — connect one only when you want to file a case or act on your own.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="glass-panel p-5">
          <p className="text-sm text-gray-500">Cases filed</p>
          <p className="text-3xl font-bold text-white">{totals.cases}</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-sm text-gray-500">Bonds locked in open cases</p>
          <p className="text-3xl font-bold text-white">{weiToGen(totals.lockedWei)} GEN</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-sm text-gray-500">Cases adjudicated</p>
          <p className="text-3xl font-bold text-white">{totals.resolved}</p>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-lg px-3 py-2 text-sm ${
                filter === f.key
                  ? 'bg-indigo-600 text-white'
                  : 'border border-gray-800 text-gray-400 hover:text-gray-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error ? <Notice kind="error">{error}</Notice> : null}

        {loading ? (
          <div className="flex items-center gap-2 text-gray-400">
            <Loader2 className="animate-spin" size={18} />
            Reading cases from the contract…
          </div>
        ) : shown.length === 0 ? (
          <div className="glass-panel p-8 text-center text-gray-400">
            <p>No case matches this filter yet.</p>
            <Link to="/dispute/new" className="mt-3 inline-block text-indigo-300 underline">
              File the first one
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {shown.map((d) => (
              <DisputeCard key={d.id} dispute={d} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
