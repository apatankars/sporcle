import { loadConfig } from './config.js';
import { Agent } from './agent.js';
import { TelegramMessenger } from './messengers/telegram.js';
import { ConsoleMessenger } from './messengers/console.js';

const cfg = loadConfig();
const messenger =
  cfg.messenger === 'telegram'
    ? new TelegramMessenger({ token: cfg.telegramToken, chatId: cfg.telegramChatId })
    : new ConsoleMessenger({ outDir: cfg.outDir });
const agent = new Agent(cfg, messenger);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await agent.finish('Shutting down.').catch(() => {});
    messenger.stop();
    process.exit(0);
  });
}

console.log(`Sporcle Dash recorder running (${cfg.messenger}). Saving games to ${cfg.outDir}`);
if (cfg.messenger === 'telegram' && cfg.telegramChatId) {
  messenger.send('Recorder is online. Send the 4-digit game code when you have it.').catch(() => {});
}
await messenger.start((text) => agent.handle(text));
