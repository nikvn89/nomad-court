import { ExternalLink } from 'lucide-react';

interface Props {
  title: string;
  url: string;
  self: boolean;
}

export default function EvidenceBlock({ title, url, self }: Props) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-gray-200">{title}</span>
        {self ? (
          <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[11px] text-indigo-300">
            you
          </span>
        ) : null}
      </div>

      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 break-all text-sm text-indigo-300 underline"
        >
          {url}
          <ExternalLink size={12} />
        </a>
      ) : (
        <p className="mt-2 text-sm text-gray-500">Not submitted yet.</p>
      )}
    </div>
  );
}
