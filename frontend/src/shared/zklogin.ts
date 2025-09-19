import type { SupportedProvider, ZkLoginConfig } from './zkloginConfig.js';

const ACCOUNTS_STORAGE_KEY = 'zklogin:accounts';

type RawAccount = {
  provider: SupportedProvider;
  address: string;
  salt: string;
  sub: string;
  aud: string;
  maxEpoch: number;
  randomness: string;
};

export type ZkLoginAccount = RawAccount;

export async function getConfig(): Promise<ZkLoginConfig> {
  const response = await sendMessage<{ ok: boolean; config?: ZkLoginConfig; error?: string }>({
    type: 'zklogin/config:get',
  });

  if (!response.ok || !response.config) {
    throw new Error(response.error ?? 'Failed to load zkLogin config');
  }

  return response.config;
}

export async function updateConfig(partial: Partial<ZkLoginConfig>): Promise<ZkLoginConfig> {
  const response = await sendMessage<{ ok: boolean; config?: ZkLoginConfig; error?: string }>({
    type: 'zklogin/config:update',
    config: partial,
  });

  if (!response.ok || !response.config) {
    throw new Error(response.error ?? 'Failed to update config');
  }

  return response.config;
}

export async function getAccounts(): Promise<ZkLoginAccount[]> {
  const response = await sendMessage<{ ok: boolean; accounts?: RawAccount[]; error?: string }>({
    type: 'zklogin/accounts:get',
  });

  if (!response.ok || !response.accounts) {
    throw new Error(response.error ?? 'Failed to load accounts');
  }

  return response.accounts.map(sanitizeAccount);
}

export async function clearAccounts(): Promise<void> {
  const response = await sendMessage<{ ok: boolean; error?: string }>({
    type: 'zklogin/accounts:clear',
  });

  if (!response.ok) {
    throw new Error(response.error ?? 'Failed to clear accounts');
  }
}

export async function removeAccount(address: string): Promise<void> {
  const response = await sendMessage<{ ok: boolean; error?: string }>({
    type: 'zklogin/accounts:remove',
    address,
  });

  if (!response.ok) {
    throw new Error(response.error ?? 'Failed to remove account');
  }
}

export async function loginWithProvider(provider: SupportedProvider = 'twitch') {
  const response = await sendMessage<{ ok: boolean; account?: RawAccount; error?: string }>({
    type: 'zklogin/login',
    provider,
  });

  if (!response.ok || !response.account) {
    throw new Error(response.error ?? 'Login failed');
  }

  return sanitizeAccount(response.account);
}

export async function signAndExecuteTransactionBlock(params: {
  address: string;
  transactionBlock: string;
  options?: Record<string, unknown>;
  requestType?: string;
}) {
  const response = await sendMessage<{ ok: boolean; result?: unknown; error?: string }>({
    type: 'zklogin/signAndExecuteTransactionBlock',
    params,
  });

  if (!response.ok) {
    throw new Error(response.error ?? 'Failed to execute transaction');
  }

  return response.result;
}

export function observeAccountStorage(callback: (accounts: ZkLoginAccount[]) => void) {
  const handler: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, areaName) => {
    if (areaName !== 'session' || !changes[ACCOUNTS_STORAGE_KEY]) {
      return;
    }
    const newValue = changes[ACCOUNTS_STORAGE_KEY].newValue as RawAccount[] | undefined;
    callback((newValue ?? []).map(sanitizeAccount));
  };

  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

function sanitizeAccount(account: RawAccount): ZkLoginAccount {
  return {
    provider: account.provider,
    address: account.address,
    salt: account.salt,
    sub: account.sub,
    aud: account.aud,
    maxEpoch: account.maxEpoch,
    randomness: account.randomness,
  };
}

function sendMessage<TResponse>(message: Record<string, unknown>): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve(response as TResponse);
      });
    } catch (error) {
      reject(error);
    }
  });
}
