import fs from 'node:fs';
import path from 'node:path';
import S from './selectors.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Watches the page and writes every distinct question (with all of its
// parts) to disk:
//   questions.json  - structured log, rewritten on every change
//   questions.md    - the same thing, readable
//   screens.jsonl   - append-only record of every distinct screen seen
//   shots/          - a screenshot of every question part
export class Recorder {
  constructor(dash, cfg, { onQuestion, onGameOver } = {}) {
    this.dash = dash;
    this.cfg = cfg;
    this.dir = dash.gameDir;
    this.onQuestion = onQuestion || (() => {});
    this.onGameOver = onGameOver || (() => {});
    this.questions = [];
    this.seen = new Set();
    this.running = false;
    this.gameOverAt = null;
    fs.mkdirSync(path.join(this.dir, 'shots'), { recursive: true });
  }

  start() {
    this.running = true;
    this.loop = this.#loop();
  }

  async stop() {
    this.running = false;
    await this.loop?.catch(() => {});
    this.save();
  }

  async #loop() {
    while (this.running) {
      try {
        await this.tick();
      } catch (err) {
        if (!this.dash.isOpen) break;
        this.#appendScreen({ error: String(err?.message || err) });
      }
      await sleep(this.cfg.pollMs);
    }
  }

  async tick() {
    const screen = await this.dash.readScreen();
    if (!screen.text || this.seen.has(screen.text)) return this.#checkGameOver();
    this.seen.add(screen.text);
    this.#appendScreen(screen);

    const isQuestion = (screen.fromQuestionEl || S.questionHint.test(screen.text)) && !S.gameOverText.test(screen.text);
    if (!isQuestion) return this.#checkGameOver();

    // Same label as the question we're already on means the host revealed
    // another part; otherwise it's a new question.
    const last = this.questions.at(-1);
    let q;
    if (last && screen.label && last.label === screen.label && !last.parts.some((p) => p.text === screen.text)) {
      q = last;
    } else {
      q = { n: this.questions.length + 1, label: screen.label, firstSeen: new Date().toISOString(), parts: [] };
      this.questions.push(q);
    }
    await this.#addPart(q, screen);
    await this.#walkParts(q);
    this.save();
    this.onQuestion(q);
  }

  // Clicks the "next" arrow until it runs out (or stops changing the
  // screen), recording each part on the way.
  async #walkParts(q) {
    for (let i = 0; i < this.cfg.maxParts; i++) {
      if (!(await this.dash.clickNextPart())) return;
      const screen = await this.dash.readScreen();
      if (!screen.text || q.parts.some((p) => p.text === screen.text)) return;
      this.seen.add(screen.text);
      this.#appendScreen({ ...screen, viaNextArrow: true });
      await this.#addPart(q, screen);
    }
  }

  async #addPart(q, screen) {
    const shot = `shots/q${String(q.n).padStart(2, '0')}-p${q.parts.length + 1}.png`;
    await this.dash.screenshot(shot).catch(() => {});
    q.parts.push({ text: screen.text, seenAt: new Date().toISOString(), screenshot: shot });
    if (!q.label && screen.label) q.label = screen.label;
  }

  async #checkGameOver() {
    if (this.gameOverAt || !(await this.dash.hasText(S.gameOverText))) return;
    this.gameOverAt = Date.now();
    this.onGameOver();
  }

  #appendScreen(rec) {
    fs.appendFileSync(path.join(this.dir, 'screens.jsonl'), JSON.stringify({ t: new Date().toISOString(), ...rec }) + '\n');
  }

  save() {
    fs.writeFileSync(path.join(this.dir, 'questions.json'), JSON.stringify(this.questions, null, 2));
    fs.writeFileSync(path.join(this.dir, 'questions.md'), this.markdown());
  }

  markdown() {
    const out = [`# Sporcle Dash log: ${path.basename(this.dir)}`, ''];
    for (const q of this.questions) {
      out.push(`## ${q.n}. ${q.label || 'Question'}`, '');
      q.parts.forEach((p, i) => {
        if (q.parts.length > 1) out.push(`**Part ${i + 1}**`, '');
        out.push(p.text.split('\n').map((l) => `> ${l}`).join('\n'), '', `![](${p.screenshot})`, '');
      });
    }
    return out.join('\n');
  }
}
