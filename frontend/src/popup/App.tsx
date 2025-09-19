import { useEffect, useState } from 'react';

export function App() {
  const [backendUrl, setBackendUrl] = useState<string>('http://localhost:4000');

  useEffect(() => {
    chrome.storage.sync.get(['upsuiderBackendUrl'], (result) => {
      if (result.upsuiderBackendUrl) {
        setBackendUrl(result.upsuiderBackendUrl);
      }
    });
  }, []);

  const persistBackendUrl = (value: string) => {
    setBackendUrl(value);
    chrome.storage.sync.set({ upsuiderBackendUrl: value });
  };

  return (
    <main style={{ padding: 16, width: 280 }}>
      <h1 style={{ marginBottom: 12 }}>Upsuider 설정</h1>
      <label htmlFor="backend-url" style={{ fontSize: 12, color: '#475569' }}>
        백엔드 API URL
      </label>
      <input
        id="backend-url"
        style={{
          width: '100%',
          marginTop: 6,
          padding: '8px 10px',
          borderRadius: 8,
          border: '1px solid #cbd5f5',
        }}
        value={backendUrl}
        onChange={(event) => persistBackendUrl(event.target.value)}
      />
      <p style={{ fontSize: 11, color: '#7c8dad', marginTop: 10 }}>
        Twitch 오버레이는 이 주소를 사용하여 트랜잭션을 요청합니다.
      </p>
    </main>
  );
}
