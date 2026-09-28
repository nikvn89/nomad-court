interface Props {
  kind: 'info' | 'error' | 'success';
  children: React.ReactNode;
  txHash?: string;
}

import { txUrl } from '../lib/genlayer';

const STYLES = {
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
  error: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
};

export default function Notice({ kind, children, txHash }: Props) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${STYLES[kind]}`}>
      <div>{children}</div>
      {txHash ? (
        <a
          className="mt-2 inline-block font-mono text-xs underline"
          href={txUrl(txHash)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {txHash}
        </a>
      ) : null}
    </div>
  );
}
