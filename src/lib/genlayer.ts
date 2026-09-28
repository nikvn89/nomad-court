import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus, ExecutionResult } from 'genlayer-js/types';

export const CONTRACT_ADDRESS = '0x9C1eB73167FAfECeAd0FD046e0b54020D34250a7';

/** StudioNet, chain id 61999. */
export const STUDIONET_CHAIN_ID_HEX = '0xf22f';
export const STUDIONET_RPC = 'https://studio.genlayer.com/api';
export const EXPLORER_BASE = 'https://explorer-studio.genlayer.com';

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] | object }) => Promise<any>;
      on?: (event: string, handler: (...args: any[]) => void) => void;
      removeListener?: (event: string, handler: (...args: any[]) => void) => void;
    };
  }
}

function proxyRpc(): string {
  return typeof window !== 'undefined' ? `${window.location.origin}/api/rpc` : '/api/rpc';
}

/**
 * Read-only client. It carries no provider, so every read works for a visitor
 * with no wallet installed. This is what makes the public explorer public.
 */
export function readClient() {
  return createClient({ chain: studionet, endpoint: proxyRpc() });
}

/**
 * Put the wallet on StudioNet without touching MetaMask Snaps.
 *
 * genlayer-js `client.connect()` calls wallet_getSnaps / wallet_requestSnaps,
 * which many wallets have no handler for — that is the
 * "method [wallet_getSnaps] doesn't has corresponding handler" failure.
 * Snaps are not required for eth_sendTransaction, so the app switches networks
 * with the standard EIP-3326 / EIP-3085 pair instead and never calls connect().
 */
export async function ensureStudioNet(): Promise<void> {
  if (!window.ethereum) throw new Error('No browser wallet detected.');

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: STUDIONET_CHAIN_ID_HEX }],
    });
  } catch (err: any) {
    if (err?.code === 4902 || err?.data?.originalError?.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: STUDIONET_CHAIN_ID_HEX,
            chainName: 'GenLayer StudioNet',
            nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
            // MetaMask registers a network by absolute URL. The app's own reads
            // and writes still go through the same-origin /api/rpc proxy.
            rpcUrls: [STUDIONET_RPC],
            blockExplorerUrls: [EXPLORER_BASE],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

export async function connectWallet(): Promise<string> {
  if (!window.ethereum) {
    throw new Error('No browser wallet detected. Install MetaMask to act on a case.');
  }
  const accounts: string[] = await window.ethereum.request({ method: 'eth_requestAccounts' });
  const current = accounts?.[0];
  if (!current) throw new Error('No wallet account was selected.');
  await ensureStudioNet();
  return current;
}

export async function currentAccount(): Promise<string | null> {
  if (!window.ethereum) return null;
  try {
    const accounts: string[] = await window.ethereum.request({ method: 'eth_accounts' });
    return accounts?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function writeClient(account: string) {
  await ensureStudioNet();
  return createClient({
    chain: studionet,
    account: account as `0x${string}`,
    provider: window.ethereum,
  });
}

export function executionName(receipt: any): string {
  return (
    receipt?.txExecutionResultName ??
    receipt?.tx_execution_result_name ??
    receipt?.executionResultName ??
    receipt?.execution_result_name ??
    ''
  );
}

export function executionFailed(receipt: any): boolean {
  const name = executionName(receipt);
  return (
    name === ExecutionResult.FINISHED_WITH_ERROR ||
    name === 'FINISHED_WITH_ERROR' ||
    name === 'ERROR'
  );
}

/**
 * Pull the contract's own UserError text out of a thrown error. Without this
 * the UI shows an opaque provider blob instead of, say,
 * "Only the recorded Host or Guest can submit evidence".
 */
export function revertReason(err: unknown): string {
  const seen = new Set<unknown>();
  let node: any = err;

  while (node && !seen.has(node)) {
    seen.add(node);

    const text = String(node?.message ?? node?.reason ?? '');
    const match =
      text.match(/\[rollback\]\s*(.+)/i) ??
      text.match(/UserError[:(]\s*(.+?)\s*[)]?$/i);
    if (match?.[1]) return match[1].trim();

    node = node.cause ?? node.error ?? node.data?.originalError;
  }

  return String((err as any)?.message ?? err ?? 'Unknown error');
}

export function isTransient(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? '').toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('rate limited') ||
    msg.includes('failed to fetch') ||
    msg.includes('timeout') ||
    msg.includes('pending')
  );
}

export async function waitFinalized(client: any, hash: `0x${string}`, retries = 30) {
  let lastError: any = null;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const receipt = await client.waitForTransactionReceipt({
        hash,
        status: TransactionStatus.FINALIZED,
        fullTransaction: true,
        interval: 12_000,
        retries,
      });

      if (executionFailed(receipt)) {
        throw new Error(`Transaction reverted (${executionName(receipt)})`);
      }
      return receipt;
    } catch (err: any) {
      lastError = err;
      if (!isTransient(err) && attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, Math.min(5_000 + attempt * 2_000, 20_000)));
    }
  }

  throw new Error(`Finalization timeout: ${lastError?.message ?? lastError ?? 'unknown error'}`);
}

/**
 * genlayer-js decodes the accepted leader's GenVM result at this exact path,
 * and GenLayer's Explorer reads the same field for its "Return Value". Never
 * walk the receipt looking for a number: it holds many unrelated ones.
 */
export function decodeDisputeIdFromLeaderReceipt(receipt: any): string {
  const result = receipt?.consensus_data?.leader_receipt?.[0]?.result;

  if (!result || typeof result !== 'object') {
    throw new Error('create_dispute receipt is missing consensus_data.leader_receipt[0].result');
  }
  if (result.status !== 'return') {
    throw new Error(
      `create_dispute leader result must be "return", observed ${String(result.status)}`,
    );
  }

  const readable = result?.payload?.readable;
  if (typeof readable !== 'string') {
    throw new Error('create_dispute leader result is missing payload.readable');
  }

  let returned: unknown;
  try {
    returned = JSON.parse(readable);
  } catch {
    throw new Error(`create_dispute returned malformed calldata: ${readable}`);
  }
  if (typeof returned !== 'string' || !/^[1-9]\d*$/.test(returned)) {
    throw new Error(`create_dispute returned a non-canonical dispute ID: ${readable}`);
  }
  return returned;
}

export function txUrl(hash: string): string {
  return `${EXPLORER_BASE}/tx/${hash}`;
}
