import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest(({ mode }) => ({
  manifest_version: 3,
  name: mode === 'development' ? 'Upsuider Twitch Companion (Dev)' : 'Upsuider Twitch Companion',
  version: '0.1.0',
  description: 'Overlay extension that connects Twitch viewers to Sui-based rewards.',
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'Upsuider Companion',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  permissions: ['storage', 'identity'],
  host_permissions: ['https://www.twitch.tv/*', 'https://id.twitch.tv/*', 'https://api.twitch.tv/*', 'http://localhost:4000/*'],
  content_scripts: [
    {
      matches: ['https://www.twitch.tv/*'],
      js: ['src/content/main.ts'],
      run_at: 'document_idle',
    },
  ],
  web_accessible_resources: [
    {
      resources: ['assets/*', 'src/overlay/*'],
      matches: ['https://www.twitch.tv/*'],
    },
  ],
}));
