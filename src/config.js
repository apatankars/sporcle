import path from 'node:path';

const bool = (v, dflt) => (v === undefined || v === '' ? dflt : /^(1|true|yes|on)$/i.test(v));
const num = (v, dflt) => (v === undefined || v === '' ? dflt : Number(v));

export function loadConfig(env = process.env) {
  return {
    messenger: env.MESSENGER || (env.TELEGRAM_BOT_TOKEN ? 'telegram' : 'console'),
    telegramToken: env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: env.TELEGRAM_CHAT_ID || '',

    dashUrl: env.DASH_URL || 'https://www.sporcle.com/dash/',
    botName: env.BOT_NAME || 'Recorder',
    headless: bool(env.HEADLESS, true),
    // Reuse a logged-in browser profile (see `npm run login`) if Dash needs it.
    profileDir: env.BROWSER_PROFILE_DIR ? path.resolve(env.BROWSER_PROFILE_DIR) : '',
    chromiumPath: env.CHROMIUM_PATH || '',

    outDir: path.resolve(env.OUT_DIR || 'games'),
    pollMs: num(env.POLL_MS, 1000),
    approvalTimeoutMin: num(env.APPROVAL_TIMEOUT_MIN, 20),
    maxParts: num(env.MAX_PARTS, 15),
    stepScreenshots: bool(env.STEP_SCREENSHOTS, true),
    notifyEachQuestion: bool(env.NOTIFY_EACH_QUESTION, true),
    captureNetwork: bool(env.CAPTURE_NETWORK, true),
    stopAfterGameOverSec: num(env.STOP_AFTER_GAME_OVER_SEC, 60),
  };
}
