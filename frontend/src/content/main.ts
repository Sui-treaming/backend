const OVERLAY_FRAME_ID = 'upsuider-zklogin-overlay-frame';
const RESIZE_EVENT = 'sui-zklogin-overlay:resize';

function createOverlayFrame() {
  if (document.getElementById(OVERLAY_FRAME_ID)) {
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.id = OVERLAY_FRAME_ID;
  iframe.src = chrome.runtime.getURL('src/overlay/index.html');
  Object.assign(iframe.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    width: '360px',
    height: '520px',
    border: 'none',
    borderRadius: '18px',
    zIndex: '2147483647',
    boxShadow: '0 28px 60px rgba(15, 23, 42, 0.55)',
    overflow: 'hidden',
    background: 'transparent',
  } as const);

  document.body.appendChild(iframe);
}

function ensureOverlay() {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    createOverlayFrame();
  } else {
    document.addEventListener('DOMContentLoaded', createOverlayFrame, { once: true });
  }
}

ensureOverlay();

window.addEventListener('message', (event) => {
  if (event.source !== window) {
    return;
  }

  const { type, payload } = event.data || {};
  if (type === RESIZE_EVENT && payload) {
    const iframe = document.getElementById(OVERLAY_FRAME_ID) as HTMLIFrameElement | null;
    if (iframe && typeof payload.height === 'number') {
      iframe.style.height = `${Math.max(420, payload.height)}px`;
    }
  }
});
