import type { ReactNode } from 'react';

interface Props {
  label: string;
  hint?: ReactNode;
  status?: { ok: boolean; warn?: boolean; message: string } | null;
  children: ReactNode;
}

/**
 * One labelled input with its helper line and its verdict line. The verdict is
 * shown while the user types, so nothing invalid ever reaches a signature
 * prompt.
 */
export default function Field({ label, hint, status, children }: Props) {
  const tone = !status
    ? ''
    : status.ok && status.warn
      ? 'text-amber-300'
      : status.ok
        ? 'text-emerald-300'
        : 'text-rose-300';

  return (
    <label className="block space-y-2">
      <span className="block text-sm font-semibold text-gray-200">{label}</span>
      {children}
      {hint ? <span className="block text-xs leading-relaxed text-gray-500">{hint}</span> : null}
      {status ? <span className={`block text-xs ${tone}`}>{status.message}</span> : null}
    </label>
  );
}
