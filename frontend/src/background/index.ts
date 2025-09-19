import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  decodeJwt,
  generateNonce,
  generateRandomness,
  getExtendedEphemeralPublicKey,
  getZkLoginSignature,
  genAddressSeed,
  jwtToAddress,
  type ZkLoginSignatureInputs,
} from '@mysten/sui/zklogin';

import { mergeConfig, type SupportedProvider, type ZkLoginConfig } from '../shared/zkloginConfig.js';

const CONFIG_STORAGE_KEY = 'zklogin:config';
const ACCOUNTS_STORAGE_KEY = 'zklogin:accounts';
const SALTS_STORAGE_KEY = 'zklogin:user-salts';

const PROVIDER_ENDPOINTS: Record<SupportedProvider, string> = {
  twitch: 'https://id.twitch.tv/oauth2/authorize',
};

const clients = new Map<string, SuiClient>();

function randomHex(bytes: number) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (b) => b.toString(16).padStart(2, '0')).join('');
}

function parseFragment(url: string) {
  const fragment = url.includes('#') ? url.split('#')[1] : '';
  return new URLSearchParams(fragment);
}

async function getConfig(): Promise<ZkLoginConfig> {
  const stored = (await chrome.storage.local.get(CONFIG_STORAGE_KEY))[CONFIG_STORAGE_KEY] as
    | Partial<ZkLoginConfig>
    | undefined;
  return mergeConfig(stored);
}

async function updateConfig(partial: Partial<ZkLoginConfig>): Promise<ZkLoginConfig> {
  const stored = (await chrome.storage.local.get(CONFIG_STORAGE_KEY))[CONFIG_STORAGE_KEY] ?? {};
  const next = {
    ...stored,
    ...partial,
    clientIds: {
      ...(stored.clientIds ?? {}),
      ...(partial.clientIds ?? {}),
    },
    scopes: {
      ...(stored.scopes ?? {}),
      ...(partial.scopes ?? {}),
    },
  };
  await chrome.storage.local.set({ [CONFIG_STORAGE_KEY]: next });
  const merged = mergeConfig(next);
  try {
    chrome.runtime.sendMessage({ type: 'zklogin/config:updated', config: merged });
  } catch (_) {
    // ignore
  }
  return merged;
}

async function getSuiClient(network: ZkLoginConfig['network']) {
  if (!clients.has(network)) {
    clients.set(network, new SuiClient({ url: getFullnodeUrl(network) }));
  }
  return clients.get(network)!;
}

async function getAccounts(): Promise<AccountRecord[]> {
  const stored = await chrome.storage.session.get(ACCOUNTS_STORAGE_KEY);
  return (stored?.[ACCOUNTS_STORAGE_KEY] ?? []) as AccountRecord[];
}

async function saveAccounts(accounts: AccountRecord[]) {
  await chrome.storage.session.set({ [ACCOUNTS_STORAGE_KEY]: accounts });
}

async function addAccount(account: AccountRecord) {
  const accounts = await getAccounts();
  const filtered = accounts.filter((existing) => existing.address !== account.address);
  filtered.unshift(account);
  await saveAccounts(filtered);
}

async function clearAccounts() {
  await chrome.storage.session.remove(ACCOUNTS_STORAGE_KEY);
}

async function removeAccount(address: string) {
  const accounts = await getAccounts();
  const filtered = accounts.filter((account) => account.address !== address);
  await saveAccounts(filtered);
}

async function getOrCreateSalt(sub: string): Promise<bigint> {
  const stored = (await chrome.storage.local.get(SALTS_STORAGE_KEY))[SALTS_STORAGE_KEY] as
    | Record<string, string>
    | undefined;
  if (stored && stored[sub]) {
    return BigInt(stored[sub]);
  }
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  let value = 0n;
  for (const byte of buf) {
    value = (value << 8n) | BigInt(byte);
  }
  const map = stored ? { ...stored } : {};
  map[sub] = value.toString();
  await chrome.storage.local.set({ [SALTS_STORAGE_KEY]: map });
  return value;
}

async function fetchZkProof(config: ZkLoginConfig, payload: ZkProofRequestBody) {
  const response = await fetch(config.proverUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Prover request failed (${response.status}): ${body}`);
  }
  return response.json();
}

async function loginWithProvider(provider: SupportedProvider, interactive: boolean): Promise<LoginResult> {
  const config = await getConfig();
  const clientId = config.clientIds[provider]?.trim();
  if (!clientId) {
    return { ok: false, error: `No client id configured for ${provider}.` };
  }
  const scope = config.scopes[provider] ?? 'openid';
  const suiClient = await getSuiClient(config.network);

  const { epoch } = await suiClient.getLatestSuiSystemState();
  const maxEpoch = Number(epoch) + config.maxEpochOffset;

  const ephemeralKeypair = Ed25519Keypair.generate();
  const randomness = generateRandomness();
  const nonce = generateNonce(ephemeralKeypair.getPublicKey(), maxEpoch, randomness);

  const state = randomHex(16);
  const redirectUri = chrome.identity.getRedirectURL();

  const authUrl = new URL(PROVIDER_ENDPOINTS[provider]);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'id_token');
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('nonce', nonce);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('response_mode', 'fragment');
  if (provider === 'twitch') {
    authUrl.searchParams.set('force_verify', 'true');
    authUrl.searchParams.set('prompt', interactive ? 'login' : 'none');
  }

  const responseUrl = await new Promise<string>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      {
        url: authUrl.toString(),
        interactive,
        abortOnLoadForNonInteractive: !interactive,
        timeoutMsForNonInteractive: interactive ? undefined : 15000,
      },
      (redirectUrl) => {
        const err = chrome.runtime.lastError;
        if (err || !redirectUrl) {
          reject(new Error(err?.message ?? 'OAuth flow failed.'));
          return;
        }
        resolve(redirectUrl);
      },
    );
  });

  const params = parseFragment(responseUrl);
  if (params.get('state') !== state) {
    throw new Error('OAuth state mismatch.');
  }
  const err = params.get('error');
  if (err) {
    throw new Error(params.get('error_description') ?? err);
  }
  const idToken = params.get('id_token');
  if (!idToken) {
    throw new Error('OAuth response did not include an id_token.');
  }

  const jwtPayload = decodeJwt(idToken);
  if (!jwtPayload.sub) {
    throw new Error('JWT payload missing "sub" claim.');
  }
  const aud = Array.isArray(jwtPayload.aud) ? jwtPayload.aud[0] : jwtPayload.aud ?? '';
  if (!aud) {
    throw new Error('JWT payload missing "aud" claim.');
  }

  const salt = await getOrCreateSalt(jwtPayload.sub);
  const address = jwtToAddress(idToken, salt);

  const payload: ZkProofRequestBody = {
    maxEpoch: maxEpoch.toString(),
    jwtRandomness: randomness.toString(),
    extendedEphemeralPublicKey: getExtendedEphemeralPublicKey(ephemeralKeypair.getPublicKey()),
    jwt: idToken,
    salt: salt.toString(),
    keyClaimName: 'sub',
  };

  const zkProofs = await fetchZkProof(config, payload);

  const account: AccountRecord = {
    provider,
    address,
    salt: salt.toString(),
    sub: jwtPayload.sub,
    aud,
    maxEpoch,
    randomness: randomness.toString(),
    zkProofs,
    ephemeralPrivateKey: ephemeralKeypair.getSecretKey(),
  };

  await addAccount(account);
  try {
    chrome.runtime.sendMessage({ type: 'zklogin/accounts:updated' });
  } catch (_) {
    // ignore
  }
  return { ok: true, account };
}

async function signAndExecuteTransactionBlock(params: SignAndExecuteParams) {
  const config = await getConfig();
  const accounts = await getAccounts();
  const account = accounts.find((acct) => acct.address === params.address);
  if (!account) {
    throw new Error('No zkLogin account found.');
  }

  const suiClient = await getSuiClient(config.network);
  const transaction = Transaction.from(params.transactionBlock);
  transaction.setSender(account.address);

  const keypair = Ed25519Keypair.fromSecretKey(account.ephemeralPrivateKey);
  const { bytes, signature: userSignature } = await transaction.sign({
    client: suiClient,
    signer: keypair,
  });

  const addressSeed = genAddressSeed(
    BigInt(account.salt),
    'sub',
    account.sub,
    account.aud,
  ).toString();

  const zkLoginSignature = getZkLoginSignature({
    inputs: {
      ...account.zkProofs,
      addressSeed,
    },
    maxEpoch: account.maxEpoch.toString(),
    userSignature,
  });

  return suiClient.executeTransactionBlock({
    transactionBlock: bytes,
    signature: zkLoginSignature,
    options: params.options,
    requestType: params.requestType,
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    return;
  }

  switch (message.type) {
    case 'zklogin/config:get': {
      getConfig()
        .then((config) => sendResponse({ ok: true, config }))
        .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    }
    case 'zklogin/config:update': {
      updateConfig(message.config ?? {})
        .then((config) => sendResponse({ ok: true, config }))
        .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    }
    case 'zklogin/accounts:get': {
      getAccounts()
        .then((accounts) => sendResponse({ ok: true, accounts }))
        .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    }
    case 'zklogin/accounts:clear': {
      clearAccounts()
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    }
    case 'zklogin/accounts:remove': {
      removeAccount(message.address)
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    }
    case 'zklogin/login': {
      loginWithProvider(message.provider ?? 'twitch', true)
        .then((result) => sendResponse(result))
        .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    }
    case 'zklogin/signAndExecuteTransactionBlock': {
      signAndExecuteTransactionBlock(message.params)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    }
    default:
      break;
  }
});

/* Types */

type AccountRecord = {
  provider: SupportedProvider;
  address: string;
  salt: string;
  sub: string;
  aud: string;
  maxEpoch: number;
  randomness: string;
  zkProofs: Omit<ZkLoginSignatureInputs, 'addressSeed'>;
  ephemeralPrivateKey: string;
};

type ZkProofRequestBody = {
  maxEpoch: string;
  jwtRandomness: string;
  extendedEphemeralPublicKey: string;
  jwt: string;
  salt: string;
  keyClaimName: 'sub';
};

type LoginResult =
  | { ok: true; account: AccountRecord }
  | { ok: false; error: string };

type SignAndExecuteParams = {
  address: string;
  transactionBlock: string | Uint8Array;
  options?: Parameters<SuiClient['executeTransactionBlock']>[0]['options'];
  requestType?: Parameters<SuiClient['executeTransactionBlock']>[0]['requestType'];
};
