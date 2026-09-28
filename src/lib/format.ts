const WEI_PER_GEN = 1_000_000_000_000_000_000n;

export function shortAddress(value: string, lead = 6, tail = 4): string {
  const v = (value ?? '').trim();
  if (v.length <= lead + tail + 2) return v;
  return `${v.slice(0, lead)}…${v.slice(-tail)}`;
}

/** Wei -> GEN as a plain decimal string, no exponent, no trailing zero noise. */
export function weiToGen(wei: bigint): string {
  const negative = wei < 0n;
  const abs = negative ? -wei : wei;
  const whole = abs / WEI_PER_GEN;
  const frac = abs % WEI_PER_GEN;

  let out = whole.toString();
  if (frac > 0n) {
    const padded = frac.toString().padStart(18, '0').replace(/0+$/, '');
    out = `${out}.${padded}`;
  }
  return negative ? `-${out}` : out;
}

/**
 * GEN (as typed by a human) -> wei. Returns null when the input is not a
 * non-negative decimal number with at most 18 fractional digits.
 */
export function genToWei(value: string): bigint | null {
  const raw = (value ?? '').trim();
  if (!/^\d+(\.\d{1,18})?$/.test(raw)) return null;

  const [whole, frac = ''] = raw.split('.');
  const padded = frac.padEnd(18, '0');
  return BigInt(whole) * WEI_PER_GEN + BigInt(padded);
}

export function sameAddress(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
