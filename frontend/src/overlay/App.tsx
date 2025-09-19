import { useEffect, useMemo, useRef, useState } from 'react';
import { Transaction } from '@mysten/sui/transactions';

import {
  clearAccounts,
  getAccounts,
  getConfig,
  loginWithProvider,
  observeAccountStorage,
  removeAccount,
  signAndExecuteTransactionBlock,
  updateConfig,
  type ZkLoginAccount,
} from '../shared/zklogin.js';
import type { ZkLoginConfig } from '../shared/zkloginConfig.js';

import './style.css';

const RESIZE_EVENT = 'sui-zklogin-overlay:resize';

type StatusKind = 'idle' | 'info' | 'success' | 'error';

type StatusState = {
  kind: StatusKind;
  message: string;
  detail?: string;
};

const DEFAULT_TRANSFER_AMOUNT = '1000000';

function sendResize(height: number) {
  if (window.parent === window) {
    return;
  }
  window.parent.postMessage({ type: RESIZE_EVENT, payload: { height } }, '*');
}

export function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [config, setConfig] = useState<ZkLoginConfig | null>(null);
  const [clientIdInput, setClientIdInput] = useState('');
  const [accounts, setAccounts] = useState<ZkLoginAccount[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [redirectUri, setRedirectUri] = useState('');
  const [status, setStatus] = useState<StatusState>({ kind: 'idle', message: '' });
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState(DEFAULT_TRANSFER_AMOUNT);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSendingTx, setIsSendingTx] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [lastDigest, setLastDigest] = useState<string | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === element) {
          sendResize(Math.ceil(entry.contentRect.height + 32));
        }
      }
    });
    observer.observe(element);
    sendResize(element.getBoundingClientRect().height + 32);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const redirect = chrome.identity.getRedirectURL();
    setRedirectUri(redirect);

    getConfig()
      .then((cfg) => {
        setConfig(cfg);
        setClientIdInput(cfg.clientIds.twitch ?? '');
      })
      .catch((error) => {
        setStatus({ kind: 'error', message: '환경설정 로드에 실패했습니다.', detail: error.message });
      });

    getAccounts()
      .then((list) => {
        setAccounts(list);
      })
      .catch((error) => {
        setStatus({ kind: 'error', message: '계정 정보를 불러오지 못했습니다.', detail: error.message });
      });

    const unsubscribeStorage = observeAccountStorage((list) => {
      setAccounts(list);
    });

    const runtimeListener: Parameters<typeof chrome.runtime.onMessage.addListener>[0] = (message) => {
      if (!message || typeof message !== 'object') {
        return;
      }
      if (message.type === 'zklogin/accounts:updated') {
        void getAccounts().catch(() => {
          // 이미 storage 이벤트에서 처리하므로 여기서는 무시
        });
      }
      if (message.type === 'zklogin/config:updated' && message.config) {
        setConfig(message.config as ZkLoginConfig);
        setClientIdInput((message.config as ZkLoginConfig).clientIds.twitch ?? '');
      }
    };

    chrome.runtime.onMessage.addListener(runtimeListener);

    return () => {
      unsubscribeStorage();
      chrome.runtime.onMessage.removeListener(runtimeListener);
    };
  }, []);

  useEffect(() => {
    if (!selectedAddress && accounts.length > 0) {
      setSelectedAddress(accounts[0].address);
    }
    if (selectedAddress && !accounts.some((account) => account.address === selectedAddress)) {
      setSelectedAddress(accounts.length > 0 ? accounts[0].address : null);
    }
  }, [accounts, selectedAddress]);

  const selectedAccount = useMemo(() => {
    return accounts.find((account) => account.address === selectedAddress) ?? null;
  }, [accounts, selectedAddress]);

  const disableTransfer = useMemo(() => {
    if (!selectedAccount) {
      return true;
    }
    return !recipient.trim() || !amount.trim() || isSendingTx;
  }, [selectedAccount, recipient, amount, isSendingTx]);

  const configNetwork = config?.network ?? 'devnet';

  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    updateStatus('info', '설정을 저장하는 중입니다…');
    try {
      const cfg = await updateConfig({
        clientIds: {
          twitch: clientIdInput.trim(),
        },
      });
      setConfig(cfg);
      updateStatus('success', '설정이 저장되었습니다.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateStatus('error', '설정 저장에 실패했습니다.', message);
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);
    updateStatus('info', 'Twitch 로그인 플로우를 시작합니다…');
    try {
      const account = await loginWithProvider('twitch');
      setSelectedAddress(account.address);
      updateStatus('success', 'Twitch 로그인에 성공했습니다.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateStatus('error', '로그인에 실패했습니다.', message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleClearAccounts = async () => {
    if (!accounts.length) {
      return;
    }
    setIsClearing(true);
    updateStatus('info', '계정 정보를 초기화합니다…');
    try {
      await clearAccounts();
      setAccounts([]);
      setSelectedAddress(null);
      updateStatus('success', '계정이 모두 삭제되었습니다.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateStatus('error', '계정 삭제에 실패했습니다.', message);
    } finally {
      setIsClearing(false);
    }
  };

  const handleRemoveAccount = async (address: string) => {
    updateStatus('info', '선택한 계정을 삭제합니다…');
    try {
      await removeAccount(address);
      updateStatus('success', '계정이 삭제되었습니다.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateStatus('error', '계정 삭제에 실패했습니다.', message);
    }
  };

  const handleCopyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      updateStatus('success', '주소가 복사되었습니다.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateStatus('error', '복사에 실패했습니다.', message);
    }
  };

  const handleTransfer = async () => {
    if (!selectedAccount) {
      updateStatus('error', '연결된 zkLogin 계정을 선택하세요.');
      return;
    }
    const target = recipient.trim();
    if (target.length === 0) {
      updateStatus('error', '수신 주소를 입력하세요.');
      return;
    }

    let amountValue: bigint;
    try {
      amountValue = BigInt(amount.trim());
    } catch (error) {
      updateStatus('error', '전송 금액 형식이 올바르지 않습니다.', String(error));
      return;
    }

    if (amountValue <= 0n) {
      updateStatus('error', '전송 금액은 0보다 커야 합니다.');
      return;
    }

    setIsSendingTx(true);
    updateStatus('info', '트랜잭션을 생성하고 있습니다…');

    try {
      const tx = new Transaction();
      tx.setGasBudgetIfNotSet(2_000_000n);
      const split = tx.splitCoins(tx.gas, [tx.pure.u64(amountValue)]);
      tx.transferObjects([split], tx.pure.address(target));

      const serialized = tx.serialize();

      const result = (await signAndExecuteTransactionBlock({
        address: selectedAccount.address,
        transactionBlock: serialized,
        options: { showEffects: true, showEvents: true },
        requestType: 'WaitForLocalExecution',
      })) as { digest?: string };

      if (result?.digest) {
        setLastDigest(result.digest);
        updateStatus('success', '트랜잭션이 전송되었습니다.', `digest: ${result.digest}`);
      } else {
        updateStatus('success', '트랜잭션이 전송되었습니다.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateStatus('error', '트랜잭션 전송에 실패했습니다.', message);
    } finally {
      setIsSendingTx(false);
    }
  };

  const hasAccounts = accounts.length > 0;

  return (
    <div ref={containerRef}>
      <main>
        <section className="card">
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Upsuider zkLogin Companion</h1>
          <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
            Twitch 시청자용 zkLogin 인증과 온체인 트랜잭션을 테스트할 수 있는 오버레이입니다.
          </p>
        </section>

        <section className="card">
          <h2 className="section-title">Twitch OAuth 설정</h2>
          <label className="label" htmlFor="twitch-client-id">
            Twitch Client ID
          </label>
          <input
            id="twitch-client-id"
            placeholder="클라이언트 ID 입력"
            value={clientIdInput}
            onChange={(event) => setClientIdInput(event.target.value)}
            autoComplete="off"
          />
          <small>Redirect URI: {redirectUri}</small>
          <div className="button-row" style={{ marginTop: 12 }}>
            <button className="primary" onClick={handleSaveConfig} disabled={isSavingConfig}>
              {isSavingConfig ? '저장 중…' : '설정 저장'}
            </button>
            <button className="ghost" onClick={() => setClientIdInput(config?.clientIds.twitch ?? '')}>
              되돌리기
            </button>
          </div>
        </section>

        <section className="card">
          <h2 className="section-title">zkLogin 연결</h2>
          <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
            현재 네트워크: <strong style={{ color: '#cbd5f5' }}>{configNetwork}</strong>
          </p>
          <button className="primary" onClick={handleLogin} disabled={isLoggingIn || !clientIdInput.trim()}>
            {isLoggingIn ? '로그인 진행 중…' : 'Twitch로 로그인'}
          </button>
        </section>

        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 className="section-title" style={{ marginBottom: 0 }}>
              연결된 계정
            </h2>
            <button className="ghost danger" onClick={handleClearAccounts} disabled={!hasAccounts || isClearing}>
              {isClearing ? '삭제 중…' : '모두 삭제'}
            </button>
          </div>

          {!hasAccounts && <div className="status">아직 저장된 계정이 없습니다.</div>}

          {hasAccounts && (
            <div className="accounts-list">
              {accounts.map((account) => (
                <div
                  key={account.address}
                  className={`account-card ${account.address === selectedAddress ? 'active' : ''}`}
                  onClick={() => setSelectedAddress(account.address)}
                >
                  <div className="account-header">
                    <span>provider: {account.provider}</span>
                    <span className="badge">epoch ≤ {account.maxEpoch}</span>
                  </div>
                  <div className="account-address">{account.address}</div>
                  <div className="button-row">
                    <button
                      className="ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleCopyAddress(account.address);
                      }}
                    >
                      주소 복사
                    </button>
                    <button
                      className="ghost danger"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleRemoveAccount(account.address);
                      }}
                    >
                      계정 삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card transactions-card">
          <h2 className="section-title">Sui 전송 테스트</h2>
          <label className="label" htmlFor="recipient-address">
            수신 주소 (Sui)
          </label>
          <input
            id="recipient-address"
            placeholder="0x..."
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
          />
          <label className="label" htmlFor="transfer-amount">
            전송 금액 (미크로 SUI)
          </label>
          <input
            id="transfer-amount"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <button className="primary" onClick={handleTransfer} disabled={disableTransfer}>
            {isSendingTx ? '트랜잭션 전송 중…' : '트랜잭션 전송'}
          </button>
          {lastDigest && (
            <div className="status success" style={{ marginTop: 10 }}>
              digest: {lastDigest}
            </div>
          )}
        </section>

        <section className={`status ${status.kind === 'success' ? 'success' : status.kind === 'error' ? 'error' : ''}`}>
          {status.message}
          {status.detail && <div style={{ marginTop: 4 }}>{status.detail}</div>}
        </section>
      </main>
    </div>
  );

  function updateStatus(kind: StatusKind, message: string, detail?: string) {
    setStatus({ kind, message, detail });
  }
}
