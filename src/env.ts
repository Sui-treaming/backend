import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(4000),
  SUI_FULLNODE_URL: z.string().url().default('https://fullnode.testnet.sui.io:443'),
  SUI_KEYPAIR: z.string().optional(),
  ALLOW_ORIGIN: z.string().optional(),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB_NAME: z.string().min(1).default('upsuider_core'),
  MONGODB_SALT_DB_NAME: z.string().min(1).optional(),
  TWITCH_EVENTSUB_SECRET: z.string().min(1, 'TWITCH_EVENTSUB_SECRET is required'),
  TWITCH_CLIENT_ID: z.string().min(1).optional(),
});

const rawEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

export const env = envSchema.parse(rawEnv);
