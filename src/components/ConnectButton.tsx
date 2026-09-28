import { Wallet } from 'lucide-react';
import { shortAddress } from '../lib/format';

interface Props {
  account: string | null;
  busy: boolean;
  onConnect: () => void;
}

export default function ConnectButton({ account, busy, onConnect }: Props) {
  if (account) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/70 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
        <span className="font-mono text-sm text-gray-200">{shortAddress(account, 6, 4)}</span>
        <span className="rounded bg-gray-800 px-2 py-0.5 text-[11px] text-gray-400">StudioNet</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onConnect}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
    >
      <Wallet size={16} />
      {busy ? 'Connecting…' : 'Connect Wallet'}
    </button>
  );
}
