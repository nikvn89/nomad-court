import { describe, expect, it } from 'vitest';
import { genToWei, sameAddress, shortAddress, weiToGen } from '../src/lib/format';

describe('weiToGen', () => {
  it('renders whole GEN without a fraction', () => {
    expect(weiToGen(10_000_000_000_000_000_000n)).toBe('10');
  });

  it('renders a fraction without trailing zeros', () => {
    expect(weiToGen(2_500_000_000_000_000_000n)).toBe('2.5');
  });

  it('renders the smallest unit without exponent notation', () => {
    expect(weiToGen(1n)).toBe('0.000000000000000001');
  });

  it('renders zero', () => {
    expect(weiToGen(0n)).toBe('0');
  });
});

describe('genToWei', () => {
  it('converts whole numbers', () => {
    expect(genToWei('10')).toBe(10_000_000_000_000_000_000n);
  });

  it('converts decimals', () => {
    expect(genToWei('2.5')).toBe(2_500_000_000_000_000_000n);
  });

  it('round-trips through weiToGen', () => {
    for (const value of ['0.000000000000000001', '1', '7.25', '1234.5678']) {
      expect(weiToGen(genToWei(value)!)).toBe(value);
    }
  });

  it('rejects anything that is not a plain non-negative decimal', () => {
    for (const bad of ['', ' ', '-1', '1e18', 'abc', '1.', '.5', '1.0000000000000000001']) {
      expect(genToWei(bad)).toBeNull();
    }
  });
});

describe('shortAddress', () => {
  it('shortens a full address', () => {
    expect(shortAddress('0x9C1eB73167FAfECeAd0FD046e0b54020D34250a7')).toBe('0x9C1e…50a7');
  });

  it('leaves a short string alone', () => {
    expect(shortAddress('0x1234')).toBe('0x1234');
  });
});

describe('sameAddress', () => {
  it('ignores case', () => {
    expect(sameAddress('0xAbCd', '0xabcd')).toBe(true);
  });

  it('is false when either side is missing', () => {
    expect(sameAddress(null, '0xabcd')).toBe(false);
    expect(sameAddress('0xabcd', '')).toBe(false);
  });
});
