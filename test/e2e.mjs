// Drives the whole flow against test/mock-dash: game code -> join team ->
// team code -> approval -> 3 questions (one with 3 parts) -> game over.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Agent } from '../src/agent.js';
import { loadConfig } from '../src/config.js';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-test-'));
const cfg = {
  ...loadConfig({}),
  dashUrl: pathToFileURL(path.resolve('test/mock-dash/index.html')).href,
  chromiumPath: process.env.CHROMIUM_PATH || '',
  outDir,
  pollMs: 300,
  stopAfterGameOverSec: 1,
  captureNetwork: false,
  botName: 'TestBot',
};

const log = [];
const messenger = {
  async send(t) { log.push(t); console.log('[bot]', t.split('\n')[0]); },
  async sendPhoto(_b, c) { log.push(c); console.log('[bot:photo]', c.split('\n')[0]); },
  async sendFile(f, c) { log.push(`file:${f}`); console.log('[bot:file]', path.basename(f), c); },
};
const waitFor = async (re, ms = 30_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (log.some((l) => re.test(l))) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timed out waiting for ${re}\n${log.join('\n')}`);
};

const agent = new Agent(cfg, messenger);
let page;
await agent.handle('1234');
await waitFor(/6-digit team code/);
page = agent.dash.page;
await agent.handle('654321');
await waitFor(/Approve "TestBot"/);
await waitFor(/Recording every question/);
await waitFor(/game is over/, 40_000);
const submitClicked = await page.evaluate(() => window.submitClicked);
const joinedAs = await page.evaluate(() => window.joinedAs);
await waitFor(/Recorded \d+ question/);

const dir = fs.readdirSync(outDir).map((d) => path.join(outDir, d))[0];
const qs = JSON.parse(fs.readFileSync(path.join(dir, 'questions.json'), 'utf8'));
console.log(JSON.stringify(qs.map((q) => ({ label: q.label, parts: q.parts.map((p) => p.text) })), null, 2));

assert.equal(joinedAs, 'TestBot', 'joined with the bot name');
assert.equal(submitClicked, false, 'never clicked Submit Answer');
assert.equal(qs.length, 3, 'recorded 3 questions');
assert.match(qs[0].parts[0].text, /capital of France/);
assert.equal(qs[1].parts.length, 3, 'walked all 3 parts of question 2');
assert.match(qs[1].parts[2].text, /closest to the sun/);
assert.match(qs[2].parts[0].text, /Dune/);
assert.ok(!qs.some((q) => q.parts.some((p) => /0:\d\d/.test(p.text))), 'timer stripped');
assert.ok(fs.existsSync(path.join(dir, qs[1].parts[2].screenshot)), 'part screenshot saved');
assert.ok(log.some((l) => l.endsWith('questions.md')), 'sent the log file');
console.log('\nPASS');
