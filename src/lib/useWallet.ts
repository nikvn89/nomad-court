import { useCallback, useEffect, useState } from 'react';
import { connectWallet, currentAccount, revertReason } from './genlayer';

export interface WalletState {
  account: string | null;
  busy: boolean;
  error: string;
  connect: () => Promise<void>;
}

export function useWallet(): WalletState {
  const [account, setAccount] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    currentAccount().then((acc) => {
      if (alive) setAccount(acc);
    });

    const onAccounts = (accounts: string[]) => setAccount(accounts?.[0] ?? null);
    // A chain switch changes what every read means, so re-read rather than
    // reloading the page and throwing away the user's place.
    const onChain = () => currentAccount().then(setAccount);

    window.ethereum?.on?.('accountsChanged', onAccounts);
    window.ethereum?.on?.('chainChanged', onChain);

    return () => {
      alive = false;
      window.ethereum?.removeListener?.('accountsChanged', onAccounts);
      window.ethereum?.removeListener?.('chainChanged', onChain);
    };
  }, []);

  const connect = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setAccount(await connectWallet());
    } catch (err) {
      setError(revertReason(err));
    } finally {
      setBusy(false);
    }
  }, []);

  return { account, busy, error, connect };
}
