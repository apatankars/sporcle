// Opens a visible browser with the saved profile so you can log in to
// Sporcle once. Only needed if Dash asks you to sign in before joining.
import readline from 'node:readline/promises';
import { chromium } from 'playwright';
import { loadConfig } from './config.js';

const cfg = loadConfig();
if (!cfg.profileDir) {
  console.error('Set BROWSER_PROFILE_DIR in .env first (e.g. BROWSER_PROFILE_DIR=browser-profile).');
  process.exit(1);
}
const ctx = await chromium.launchPersistentContext(cfg.profileDir, {
  headless: false,
  ...(cfg.chromiumPath ? { executablePath: cfg.chromiumPath } : {}),
});
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://www.sporcle.com/auth/login/');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await rl.question('Log in in the browser window, then press Enter here to save the session… ');
rl.close();
await ctx.close();
console.log(`Saved to ${cfg.profileDir}.`);
