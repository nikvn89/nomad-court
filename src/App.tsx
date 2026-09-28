import { Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import Notice from './components/Notice';
import Explorer from './routes/Explorer';
import NewDispute from './routes/NewDispute';
import Dashboard from './routes/Dashboard';
import DisputeDetail from './routes/DisputeDetail';
import { useWallet } from './lib/useWallet';
import { CONTRACT_ADDRESS, EXPLORER_BASE } from './lib/genlayer';

export default function App() {
  const wallet = useWallet();

  return (
    <div className="min-h-screen text-gray-100">
      <Navbar account={wallet.account} busy={wallet.busy} onConnect={wallet.connect} />

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        {wallet.error ? <Notice kind="error">{wallet.error}</Notice> : null}

        <Routes>
          <Route path="/" element={<Explorer />} />
          <Route
            path="/dispute/new"
            element={<NewDispute account={wallet.account} onConnect={wallet.connect} />}
          />
          <Route
            path="/dashboard"
            element={<Dashboard account={wallet.account} onConnect={wallet.connect} />}
          />
          <Route
            path="/dispute/:id"
            element={<DisputeDetail account={wallet.account} onConnect={wallet.connect} />}
          />
          <Route path="*" element={<Explorer />} />
        </Routes>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-gray-600">
        <p>
          GenLayer StudioNet ·{' '}
          <a
            className="underline"
            href={`${EXPLORER_BASE}/address/${CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {CONTRACT_ADDRESS}
          </a>
        </p>
        <p className="mt-1">
          Evidence is referenced by public link and is not stored on chain.
        </p>
      </footer>
    </div>
  );
}
