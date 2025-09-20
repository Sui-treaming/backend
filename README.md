# Upsuider Backend

Node.js/Fastify backend that connects Twitch interactions to on-chain activity on Sui
and manages streamer assets via Walrus storage. The repository also bundles the
Move package used for minting Upsuider-branded NFTs.

## Directory Layout
```
backend/
├── contracts/           # Sui Move package (`sui move build`, `sui move test`)
├── deploy/              # Nginx and iptables helpers for production rollout
├── src/                 # Fastify application code
├── ecosystem.config.js  # pm2 process configuration
├── package.json         # Scripts and runtime dependencies
└── tsconfig.json        # TypeScript build settings
```

## Quickstart
1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env` file at the repository root with the required secrets (see
   *Environment* section).
3. Run the development server:
   ```bash
   npm run dev
   ```
   Fastify starts on `http://127.0.0.1:4000` by default.
4. Build and run a production bundle when ready:
   ```bash
   npm run build
   npm start
   ```

## Environment
Minimal configuration required to boot the server:

- `MONGODB_URI` – MongoDB connection string.
- `SUI_KEYPAIR` – Base64-encoded Ed25519 private key from `sui keytool export`.
- `TWITCH_EVENTSUB_SECRET` – Shared secret used to validate EventSub callbacks.

Additional knobs (all parsed via `src/env.ts` with sane defaults):

- `PORT` (default `4000`)
- `ALLOW_ORIGIN` – CORS origin, `true` when unset.
- `MONGODB_DB_NAME`, `MONGODB_SALT_DB_NAME`
- `SUI_FULLNODE_URL` – RPC endpoint (defaults to testnet).
- `LOCAL_UPLOAD_DIR` – Directory for temporary asset storage (`uploads`).
- `ASSET_PUBLIC_BASE_URL` – Override origin for asset URLs.
- `WALRUS_*` – Walrus aggregator/publisher endpoints and size limit.
- `UPSUIDER_NFT_NAME`, `UPSUIDER_NFT_DESCRIPTION`, `UPSUIDER_NFT_IMAGE_URL` –
  Metadata overrides used when minting NFTs from EventSub.

## Runtime Building Blocks
- **MongoDB layer (`src/db` & `src/repositories`)** – Ensures indexes and exposes
  helpers for viewers, salts, zkLogin wallets, and streamer asset metadata.
- **Sui helpers (`src/sui.ts`, `src/services`)** – Wrap Sui client usage for
  coin transfers, Walrus template calls, and the Upsuider NFT mint function.
- **Local uploads (`src/storage/localUploads.ts`)** – Persists PNGs to disk and
  serves them under `/uploads/*` via `@fastify/static`.
- **Walrus integration (`src/routes/walrus.ts`)** – Accepts raw PNG or
  multipart uploads, stores metadata, and returns the public URL.
- **Twitch EventSub (`src/routes/eventsub.ts`)** – Verifies signatures,
  deduplicates messages, resolves viewer wallets, and mints NFTs on Sui when a
  channel point reward is redeemed.
- **Transactions API (`src/routes/transactions.ts`)** – Demonstrates server-side
  Sui transfers by moving coins to a requested recipient.
- **Viewer & salt APIs (`src/routes/viewers.ts`, `src/routes/salts.ts`)** – CRUD
  endpoints for Twitch user wallet bindings and zkLogin salt lifecycle.

## HTTP Endpoints
All API routes are registered under `/api` unless noted otherwise.

- `GET /health` – Liveness probe. `GET /` returns a simple status payload.
- `POST /api/viewers` – Upsert a zkLogin wallet for a Twitch user.
- `GET /api/viewers/:twitchId` – Look up wallet metadata by Twitch user ID.
- `POST /api/salts` – Legacy salt upsert with explicit payload.
- `POST /api/salts/ensure` – Derive Twitch user ID from JWT and mint/return a salt.
- `GET /api/salts/:twitchId` – Check if a salt exists (no salt leakage).
- `POST /api/salts/verify` – Confirm a provided salt matches stored value.
- `POST /api/transactions/transfer` – Execute a Sui micro-transfer using the server key.
- `POST /api/walrus/upload` – Ingest PNG assets (requires `streamid` header).
- `POST /eventsub/callback` – Twitch EventSub webhook endpoint.

Static files saved via Walrus upload are exposed from `/uploads/*`.

## Move Package (`contracts/`)
- Build locally with `sui move build` (and `sui move test`) before publishing.
- When ready, update `Move.toml` addresses and run `sui client publish --gas-budget 100000000 --json` from the `contracts/` folder. Capture the returned `packageId` and sync it with `src/services/upsuiderNft.ts`.
- Invoke the module from the CLI via `sui client call --package <PACKAGE_ID> --module upsuider_contract --function mint ...` to test minting or transfer flows.
- Named address `@upsuider_contract` defaults to `0x0`; replace it with the publishing account for devnet/testnet/mainnet.
- A detailed guide (including publish/call examples) lives in `contracts/README.md`.

## Deployment Notes
- `npm run pm2` boots the compiled server using the supplied `ecosystem.config.js`.
- `deploy/nginx/upsuider-backend.conf` and `deploy/iptables_port80_to_4000.sh`
  contain sample reverse-proxy/port-forward recipes (see `deploy/README.md`).
- The Fastify instance binds to `0.0.0.0` so it can be fronted by Nginx on port 80.

## Development Tips
- The codebase targets TypeScript 5.x; run `npm run build` to emit `dist/`.
- No automated tests are defined yet—consider wiring integration tests for the
  Sui transaction flows and Mongo-backed repositories.
- Keep your Walrus publisher/aggregator credentials out of the repo; only store
  them in environment variables or your infrastructure secret manager.
