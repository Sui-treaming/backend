# Upsuider Twitch Web3 Companion

Twitch 시청자/스트리머 상호작용을 Web3 (Sui)와 결합하기 위한 초기 스캐폴드입니다. `backend/`는 Fastify + TypeScript 기반의 API 서버, `frontend/`는 Chrome 익스텐션(React + Vite)으로 구성되어 있습니다.

## Backend

- Fastify + TypeScript
- Sui SDK (`@mysten/sui`)를 이용해 간단한 SUI 전송 트랜잭션 예제 포함
- `.env.example`를 복사하여 `SUI_FULLNODE_URL`, `SUI_KEYPAIR` 등을 설정한 뒤 실행합니다.
- `MONGODB_URI`, `MONGODB_DB_NAME`, `MONGODB_SALT_DB_NAME`를 이용해 시청자-월렛 매핑 및 salt 저장소를 구성합니다.
- `/api/viewers` (POST)로 `twitchId`↔`walletAddress`를 연결하고, `/api/salts` (POST/GET)로 salt를 관리할 수 있습니다.

```bash
cd backend
cp .env.example .env
# 필요한 Node 버전 설치 후
npm install
npm run dev
```

## Frontend (Chrome Extension)

- Vite + React + `@crxjs/vite-plugin`
- zkLogin PoC(`poc_zklogin/`)를 참고해 Twitch 페이지에 전용 overlay iframe을 주입
- overlay에서 Twitch OAuth Client ID 관리, zkLogin 로그인, Sui 트랜잭션(zkLogin 서명) 테스트 지원

```bash
cd frontend
pnpm install
npm run build
# dist/ 폴더를 Chrome 확장 프로그램에서 로드
```

## Next Steps

1. zkLogin 연동 로직을 익스텐션과 백엔드에 실제 구현하세요.
2. Twitch OAuth/EventSub 연동 및 사용자 세션 저장소를 확장하세요.
3. 온체인 보상 로직(포인트 적립/사용, NFT 민팅)에 맞춰 컨트랙트를 작성하고 백엔드 SDK 호출을 추가하세요.
