export type SupportedProvider = 'twitch';

export interface ZkLoginConfig {
  network: 'devnet' | 'testnet' | 'mainnet';
  proverUrl: string;
  saltService: 'local' | 'remote';
  saltServiceUrl?: string;
  maxEpochOffset: number;
  clientIds: Partial<Record<SupportedProvider, string>>;
  scopes: Partial<Record<SupportedProvider, string>>;
}

export const defaultConfig: ZkLoginConfig = {
  network: 'devnet',
  proverUrl: 'https://prover-dev.mystenlabs.com/v1',
  saltService: 'local',
  saltServiceUrl: undefined,
  maxEpochOffset: 2,
  clientIds: {
    twitch: '',
  },
  scopes: {
    twitch: 'openid user:read:email',
  },
};

export function mergeConfig(override?: Partial<ZkLoginConfig>): ZkLoginConfig {
  const base: ZkLoginConfig = {
    network: defaultConfig.network,
    proverUrl: defaultConfig.proverUrl,
    saltService: defaultConfig.saltService,
    saltServiceUrl: defaultConfig.saltServiceUrl,
    maxEpochOffset: defaultConfig.maxEpochOffset,
    clientIds: { ...defaultConfig.clientIds },
    scopes: { ...defaultConfig.scopes },
  };

  if (!override) {
    return base;
  }

  return {
    ...base,
    ...override,
    clientIds: {
      ...base.clientIds,
      ...override.clientIds,
    },
    scopes: {
      ...base.scopes,
      ...override.scopes,
    },
  };
}
