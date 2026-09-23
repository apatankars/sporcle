import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import S from './selectors.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Thrown when the page doesn't look like what the selectors expect. The
// agent reacts by sending a screenshot and switching to manual commands.
export class NeedsHelp extends Error {}

// Owns the browser and everything that touches the Dash page.
export class DashSession {
  constructor(cfg, gameDir) {
    this.cfg = cfg;
    this.gameDir = gameDir;
    this.context = null;
    this.page = null;
  }

  async open() {
    fs.mkdirSync(this.gameDir, { recursive: true });
    const launch = {
      headless: this.cfg.headless,
      viewport: { width: 1280, height: 900 },
      ...(this.cfg.chromiumPath ? { executablePath: this.cfg.chromiumPath } : {}),
    };
    if (this.cfg.profileDir) {
      this.context = await chromium.launchPersistentContext(this.cfg.profileDir, launch);
    } else {
      this.browser = await chromium.launch(launch);
      this.context = await this.browser.newContext({ viewport: launch.viewport });
    }
    this.page = this.context.pages()[0] || (await this.context.newPage());
    if (this.cfg.captureNetwork) this.#captureNetwork();
    await this.page.goto(this.cfg.dashUrl, { waitUntil: 'domcontentloaded' });
    await this.settle();
  }

  async close() {
    await this.context?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
    this.context = this.page = this.browser = null;
  }

  get isOpen() {
    return !!this.page && !this.page.isClosed();
  }

  // Everything the page receives over WebSockets or as JSON goes to
  // network.jsonl. If the page layout defeats the scraper, the questions are
  // almost certainly in here.
  #captureNetwork() {
    const file = path.join(this.gameDir, 'network.jsonl');
    const write = (rec) => fs.appendFile(file, JSON.stringify({ t: new Date().toISOString(), ...rec }) + '\n', () => {});
    const clip = (s) => (typeof s === 'string' && s.length > 100_000 ? s.slice(0, 100_000) + '…[truncated]' : s);
    this.page.on('websocket', (ws) => {
      write({ kind: 'ws-open', url: ws.url() });
      ws.on('framereceived', (f) => write({ kind: 'ws-in', url: ws.url(), data: clip(String(f.payload)) }));
      ws.on('framesent', (f) => write({ kind: 'ws-out', url: ws.url(), data: clip(String(f.payload)) }));
    });
    this.page.on('response', async (res) => {
      const type = res.headers()['content-type'] || '';
      if (!/json|event-stream/.test(type)) return;
      try {
        write({ kind: 'http', status: res.status(), method: res.request().method(), url: res.url(), data: clip(await res.text()) });
      } catch {}
    });
  }

  async settle(ms = 800) {
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    await sleep(ms);
  }

  async screenshot(name) {
    const buf = await this.page.screenshot({ fullPage: false });
    if (name) fs.writeFileSync(path.join(this.gameDir, name), buf);
    return buf;
  }

  async hasText(re) {
    const text = await this.page.locator('body').innerText().catch(() => '');
    return re.test(text);
  }

  // --- low-level helpers ---------------------------------------------------

  async #firstVisible(selectors, { emptyOnly = false, within } = {}) {
    const root = within || this.page;
    for (const sel of selectors) {
      const all = root.locator(sel).filter({ visible: true });
      const n = await all.count().catch(() => 0);
      for (let i = 0; i < n; i++) {
        const el = all.nth(i);
        if (!(await el.isEnabled().catch(() => false))) continue;
        if (emptyOnly && (await el.inputValue().catch(() => ''))) continue;
        return el;
      }
    }
    return null;
  }

  // Types a code into either a single input or a row of one-digit boxes.
  async #typeCode(selectors, code) {
    const boxes = this.page.locator('input[maxlength="1"]').filter({ visible: true });
    if ((await boxes.count()) >= code.length) {
      await boxes.first().click();
      await this.page.keyboard.type(code, { delay: 60 });
      return true;
    }
    const el = await this.#firstVisible(selectors, { emptyOnly: true });
    if (!el) return false;
    await el.click();
    await el.fill('');
    await el.pressSequentially(code, { delay: 40 });
    return true;
  }

  async #fill(selectors, value) {
    const el = await this.#firstVisible(selectors, { emptyOnly: true });
    if (!el) return false;
    await el.fill(value);
    return true;
  }

  async fillFirstEmpty(value) {
    return this.#fill(['input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])', 'textarea'], value);
  }

  // Clicks the first visible button/link whose text matches `re`. Skips
  // anything matching selectors.neverClick unless `force` is set.
  async clickText(re, { force = false } = {}) {
    const candidates = [
      this.page.getByRole('button', { name: re }),
      this.page.getByRole('link', { name: re }),
      this.page.locator('button, [role="button"], a, input[type="submit"], input[type="button"]').filter({ hasText: re }),
      this.page.getByText(re),
    ];
    for (const loc of candidates) {
      const vis = loc.filter({ visible: true });
      const n = await vis.count().catch(() => 0);
      for (let i = 0; i < n; i++) {
        const el = vis.nth(i);
        const label = ((await el.innerText().catch(() => '')) || (await el.getAttribute('aria-label').catch(() => '')) || '').trim();
        if (!force && S.neverClick.test(label)) continue;
        if (!(await el.isEnabled().catch(() => true))) continue;
        await el.click();
        return label || true;
      }
    }
    return false;
  }

  // --- join flow -----------------------------------------------------------

  async enterGameCode(code) {
    if (!(await this.#typeCode(S.gameCodeInput, code))) {
      throw new NeedsHelp("I couldn't find a game code box on the Dash page.");
    }
    await this.settle(400);
    await this.page.keyboard.press('Enter');
    await this.settle(1500);
    // If Enter didn't move us on, try the obvious button.
    const stillThere = await this.page.locator('input').filter({ visible: true }).evaluateAll(
      (els, c) => els.some((e) => e.value === c) || els.filter((e) => e.maxLength === 1).map((e) => e.value).join('') === c,
      code,
    );
    if (stillThere) {
      await this.clickText(S.gameCodeSubmit);
      await this.settle(1500);
    }
    if (await this.hasText(S.errorText)) throw new NeedsHelp(`Dash didn't accept game code ${code}.`);
  }

  // Walks through whatever mix of "Join a team", team code and name screens
  // Dash shows, in whatever order, until we're waiting for approval (or in).
  async joinTeam(teamCode) {
    let teamFilled = false;
    let nameFilled = false;
    for (let step = 0; step < 8; step++) {
      if (await this.hasText(S.pendingText)) return 'pending';
      if (teamFilled && (await this.looksInGame())) return 'joined';
      if (teamFilled && (await this.hasText(S.errorText))) throw new NeedsHelp(`Dash didn't accept team code ${teamCode}.`);

      let acted = false;
      if (!nameFilled && (await this.#fill(S.nameInput, this.cfg.botName))) {
        nameFilled = acted = true;
      }
      if (!teamFilled) {
        const joinBtnVisible = await this.page.getByRole('button', { name: S.joinTeamButton }).filter({ visible: true }).count();
        if (
          (await this.#typeCode(S.teamCodeInput, teamCode)) ||
          (!joinBtnVisible && (await this.#typeCode(S.genericCodeInput, teamCode)))
        ) {
          teamFilled = acted = true;
        } else if (await this.clickText(S.joinTeamButton)) {
          await this.settle(1200);
          continue;
        }
      }
      if (acted || teamFilled) {
        if (!(await this.clickText(S.teamCodeSubmit))) await this.page.keyboard.press('Enter');
      }
      await this.settle(1500);
    }
    if (await this.hasText(S.pendingText)) return 'pending';
    if (teamFilled && (await this.looksInGame())) return 'joined';
    throw new NeedsHelp("I couldn't finish joining the team on my own.");
  }

  async looksInGame() {
    if (await this.hasText(S.pendingText)) return false;
    const q = await this.#firstVisible(S.questionContainer);
    if (q) return true;
    return this.hasText(/question\s*\d|round\s*\d|scoreboard|standings/i);
  }

  // --- reading the question --------------------------------------------------

  // Returns the question text currently on screen, with timers and other
  // noise stripped, plus whether it came from a dedicated question element.
  async readScreen() {
    const raw = await this.page.evaluate(
      ({ qSel, fallback }) => {
        const visible = (el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
        };
        for (const sel of qSel) {
          let els;
          try { els = [...document.querySelectorAll(sel)].filter(visible); } catch { continue; }
          // Keep only outermost matches so nested pieces aren't doubled.
          els = els.filter((e) => !els.some((o) => o !== e && o.contains(e)));
          const text = els.map((e) => e.innerText).join('\n').trim();
          if (text.length >= 3) return { text, fromQuestionEl: true, selector: sel };
        }
        for (const sel of fallback) {
          const el = document.querySelector(sel);
          if (el) return { text: el.innerText.trim(), fromQuestionEl: false, selector: sel };
        }
        return { text: '', fromQuestionEl: false, selector: null };
      },
      { qSel: S.questionContainer, fallback: S.pageFallback },
    );
    const lines = raw.text
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter((l) => l && !S.noiseLines.some((re) => re.test(l)));
    const text = lines.join('\n');
    const label = (text.match(/(question\s*#?\s*\d+|round\s*\w+|mystery[^\n]*|final[^\n]*)/i) || [])[1] || null;
    return { ...raw, text, label };
  }

  async #findArrow(selectors) {
    const container = this.page.locator(S.questionContainer.join(', ')).filter({ visible: true }).first();
    const inContainer = (await container.count()) ? await this.#firstVisible(selectors, { within: container }) : null;
    const el = inContainer || (await this.#firstVisible(selectors));
    if (!el) return null;
    const label = ((await el.innerText().catch(() => '')) + ' ' + ((await el.getAttribute('aria-label')) || '')).trim();
    if (S.neverClick.test(label)) return null;
    return el;
  }

  async clickNextPart() {
    const el = await this.#findArrow(S.nextArrow);
    if (!el) return false;
    await el.click();
    await sleep(700);
    return true;
  }

  async clickPrevPart() {
    const el = await this.#findArrow(S.prevArrow);
    if (!el) return false;
    await el.click();
    await sleep(500);
    return true;
  }

  // A short text description of what's clickable, for manual mode.
  async describe() {
    return this.page.evaluate(() => {
      const vis = (el) => el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden';
      const buttons = [...document.querySelectorAll('button, [role="button"], a, input[type="submit"]')]
        .filter(vis)
        .map((e) => (e.innerText || e.value || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '))
        .filter(Boolean)
        .slice(0, 25);
      const inputs = [...document.querySelectorAll('input, textarea, select')]
        .filter(vis)
        .map((e) => `${e.name || e.placeholder || e.getAttribute('aria-label') || e.type}${e.value ? `="${e.value}"` : ''}`)
        .slice(0, 15);
      return { url: location.href, title: document.title, buttons, inputs };
    });
  }
}
