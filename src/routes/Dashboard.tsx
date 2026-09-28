import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import type { Dispute } from '../types';
import { disputesForWallet, scanDisputes } from '../lib/disputes';
import { revertReason } from '../lib/genlayer';
import DisputeCard from '../components/DisputeCard';
import Notice from '../components/Notice';

interface Props {
  account: string | null;
  onConnect: () => void;
}

function Section({ title, blurb, cases }: { title: string; blurb: string; cases: Dispute[] }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-bold text-white">
          {title} <span className="text-gray-500">({cases.length})</span>
        </h2>
        <p className="text-sm text-gray-500">{blurb}</p>
      </div>
      {cases.length === 0 ? (
        <div className="glass-panel p-6 text-sm text-gray-500">Nothing here yet.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cases.map((d) => (
            <DisputeCard key={d.id} dispute={d} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function Dashboard({ account, onConnect }: Props) {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    scanDisputes()
      .then((found) => alive && setDisputes(found))
      .catch((err) => alive && setError(revertReason(err)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const mine = useMemo(() => disputesForWallet(disputes, account), [disputes, account]);

  if (!account) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-3xl font-bold text-white">My cases</h1>
        <Notice kind="info">
          Connect a wallet to see the cases you are a party to. Your role in each case is read from
          the contract — there is nothing to pick.{' '}
          <button type="button" onClick={onConnect} className="underline">
            Connect now
          </button>
        </Notice>
        <Link to="/" className="inline-block text-indigo-300 underline">
          Browse every case instead
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">My cases</h1>
        <p className="mt-2 text-gray-400">
          Sorted by the role the contract records for your wallet.
        </p>
      </div>

      {error ? <Notice kind="error">{error}</Notice> : null}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="animate-spin" size={18} />
          Reading cases from the contract…
        </div>
      ) : (
        <>
          <Section
            title="Cases you filed"
            blurb="You are the guest: you opened the case and locked the bond."
            cases={mine.asGuest}
          />
          <Section
            title="Cases filed against you"
            blurb="You are the host: someone opened a case naming your wallet."
            cases={mine.asHost}
          />
        </>
      )}
    </div>
  );
}
