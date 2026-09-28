export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test((value ?? '').trim());
}

export function isZeroAddress(value: string): boolean {
  return (value ?? '').trim().toLowerCase() === ZERO_ADDRESS;
}

export interface UrlVerdict {
  ok: boolean;
  /** true when the URL is valid but not encrypted. */
  warn: boolean;
  message: string;
}

/**
 * The contract rejects anything that is not http:// or https:// for evidence
 * (`Evidence must be a public HTTP/HTTPS URL`), so the form has to reject it
 * first — before the user pays for a transaction that cannot succeed.
 */
export function checkEvidenceUrl(value: string): UrlVerdict {
  const raw = (value ?? '').trim();

  if (!raw) {
    return { ok: false, warn: false, message: 'Paste a public link to your evidence.' };
  }
  if (/\s/.test(raw)) {
    return { ok: false, warn: false, message: 'A link cannot contain spaces or line breaks.' };
  }
  if (raw.startsWith('https://')) {
    if (raw.length <= 'https://'.length) {
      return { ok: false, warn: false, message: 'That link is incomplete.' };
    }
    return { ok: true, warn: false, message: 'Looks like a public link.' };
  }
  if (raw.startsWith('http://')) {
    if (raw.length <= 'http://'.length) {
      return { ok: false, warn: false, message: 'That link is incomplete.' };
    }
    return {
      ok: true,
      warn: true,
      message: 'This link is not encrypted. https:// is safer, but http:// is accepted.',
    };
  }
  return {
    ok: false,
    warn: false,
    message:
      'Evidence must be a link starting with https:// — plain text is rejected on chain.',
  };
}

export interface HostVerdict {
  ok: boolean;
  message: string;
}

/**
 * Mirrors the two checks create_dispute makes, so an impossible transaction is
 * never signed: "Host address cannot be empty" and
 * "Host and Guest must be different accounts".
 */
export function checkHostAddress(value: string, connected: string | null): HostVerdict {
  const raw = (value ?? '').trim();

  if (!raw) return { ok: false, message: 'Enter the other party’s wallet address.' };
  if (!isAddress(raw)) {
    return { ok: false, message: 'A wallet address is 0x followed by 40 hex characters.' };
  }
  if (isZeroAddress(raw)) {
    return { ok: false, message: 'The zero address cannot be a party to a case.' };
  }
  if (connected && raw.toLowerCase() === connected.toLowerCase()) {
    return { ok: false, message: 'Host and Guest must be different accounts.' };
  }
  return { ok: true, message: 'Valid address.' };
}
