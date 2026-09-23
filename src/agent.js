import path from 'node:path';
import { DashSession, NeedsHelp } from './dash.js';
import { Recorder } from './recorder.js';
import S from './selectors.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HELP = `Send me:
  1234     the 4-digit game code (starts a game)
  123456   the 6-digit team code (after the game code)
Then approve me in Dash and I'll record every question.

Anytime:
  status   what I'm doing
  shot     screenshot of what I see
  log      send the question log so far
  stop     finish, send the log, close the browser

If I get stuck:
  buttons       list what's on screen
  click <text>  click a button by its text
  type <text>   type into the selected box
  fill <text>   fill the first empty box
  enter         press Enter
  go            skip ahead: start recording now`;

// States: idle -> awaitTeam -> joining -> awaitApproval -> recording -> idle
// "manual" is where it ends up whenever the page doesn't match expectations.
export class Agent {
  constructor(cfg, messenger) {
    this.cfg = cfg;
    this.msg = messenger;
    this.state = 'idle';
    this.queue = Promise.resolve();
  }

  handle(text) {
    // One message at a time, so commands don't interleave on the page.
    this.queue = this.queue.then(() => this.#handle(text)).catch((err) => this.#fail(err));
    return this.queue;
  }

  async #handle(text) {
    const cmd = text.split(/\s+/)[0];
    const arg = text.slice(cmd.length).trim();
    switch (cmd.toLowerCase()) {
      case 'help':
      case '/help':
      case '/start':
        return this.msg.send(HELP);
      case 'status':
        return this.msg.send(this.#status());
      case 'shot':
      case 'screenshot':
        return this.#shot('Here is what I see.');
      case 'log':
        return this.#sendLog();
      case 'stop':
      case 'quit':
      case 'reset':
        return this.finish('Stopped.');
    }

    if (this.dash?.isOpen) {
      const page = this.dash.page;
      switch (cmd.toLowerCase()) {
        case 'buttons': {
          const d = await this.dash.describe();
          return this.msg.send(`Buttons: ${d.buttons.join(' | ') || '(none)'}\nInputs: ${d.inputs.join(' | ') || '(none)'}\n${d.url}`);
        }
        case 'click': {
          const clicked = await this.dash.clickText(new RegExp(escapeRe(arg), 'i'), { force: true });
          await this.dash.settle(1000);
          return this.#shot(clicked ? `Clicked "${clicked}".` : `No "${arg}" button on screen.`);
        }
        case 'type':
          await page.keyboard.type(arg, { delay: 40 });
          return this.#shot(`Typed "${arg}".`);
        case 'fill': {
          const ok = await this.dash.fillFirstEmpty(arg);
          return this.#shot(ok ? `Filled "${arg}".` : 'No empty box on screen.');
        }
        case 'enter':
          await page.keyboard.press('Enter');
          await this.dash.settle(1000);
          return this.#shot('Pressed Enter.');
        case 'go':
        case 'approved':
        case 'ready':
          if (this.state === 'recording') return this.msg.send('Already recording.');
          if (this.state === 'awaitApproval') {
            this.forceGo = true; // the approval waiter starts recording
            return;
          }
          return this.#startRecording();
      }
    }

    if (/^\d{4}$/.test(text) && ['idle', 'awaitTeam', 'manual'].includes(this.state)) return this.#startGame(text);
    if (/^\d{6}$/.test(text) && (this.state === 'awaitTeam' || this.state === 'manual')) return this.#joinTeam(text);
    if (/^\d{6}$/.test(text) && this.state === 'idle') return this.msg.send('Send the 4-digit game code first, then the 6-digit team code.');

    return this.msg.send(`I didn't get "${text}". ${this.#status()}\nSend "help" for commands.`);
  }

  async #startGame(code) {
    if (this.dash) await this.#closeGame();
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    this.gameCode = code;
    this.dash = new DashSession(this.cfg, path.join(this.cfg.outDir, `${stamp}_game-${code}`));
    this.state = 'joining';
    await this.msg.send(`Opening Dash with game code ${code}…`);
    await this.dash.open();
    await this.dash.enterGameCode(code);
    this.state = 'awaitTeam';
    await this.#stepShot('game-code.png', `Game ${code} entered. Now send me the 6-digit team code.`);
  }

  async #joinTeam(teamCode) {
    this.state = 'joining';
    await this.msg.send(`Joining team ${teamCode} as "${this.cfg.botName}"…`);
    const result = await this.dash.joinTeam(teamCode);
    if (result === 'joined') {
      await this.#stepShot('joined.png', "I'm on the team.");
      return this.#startRecording();
    }
    this.state = 'awaitApproval';
    await this.#stepShot('pending.png', `I asked to join. Approve "${this.cfg.botName}" in Dash and I'll start recording.`);
    // Waiting happens outside the message queue so "shot"/"go" still work.
    this.#waitForApproval();
  }

  async #waitForApproval() {
    this.forceGo = false;
    const deadline = Date.now() + this.cfg.approvalTimeoutMin * 60_000;
    let clearPolls = 0;
    while (this.state === 'awaitApproval' && Date.now() < deadline) {
      if (this.forceGo) break;
      const pending = await this.dash.hasText(S.pendingText).catch(() => true);
      clearPolls = pending ? 0 : clearPolls + 1;
      if (clearPolls >= 2) break;
      await sleep(2000);
    }
    if (this.state !== 'awaitApproval') return;
    if (!this.forceGo && Date.now() >= deadline) {
      this.state = 'manual';
      return this.#shot(`Still not approved after ${this.cfg.approvalTimeoutMin} min. Send "go" to record anyway, or "stop".`);
    }
    this.queue = this.queue.then(() => this.#startRecording()).catch((err) => this.#fail(err));
  }

  async #startRecording() {
    this.state = 'recording';
    this.recorder = new Recorder(this.dash, this.cfg, {
      onQuestion: (q) => {
        if (!this.cfg.notifyEachQuestion) return;
        const parts = q.parts.length > 1 ? ` (${q.parts.length} parts)` : '';
        const preview = q.parts[0].text.replace(/\n/g, ' ').slice(0, 300);
        this.msg.send(`Q${q.n}${q.label ? ` [${q.label}]` : ''}${parts}: ${preview}`).catch(() => {});
      },
      onGameOver: () => {
        this.msg.send(`Looks like the game is over. I'll wrap up in ${this.cfg.stopAfterGameOverSec}s (or send "stop").`).catch(() => {});
        const dash = this.dash;
        setTimeout(() => this.dash === dash && this.handle('stop'), this.cfg.stopAfterGameOverSec * 1000);
      },
    });
    this.recorder.start();
    await this.#stepShot('recording.png', "I'm in. Recording every question. Send \"log\" anytime for the log so far.");
  }

  async finish(reason) {
    if (!this.dash) {
      this.state = 'idle';
      return this.msg.send('Nothing running. Send a 4-digit game code to start.');
    }
    const count = this.recorder?.questions.length || 0;
    await this.#closeGame();
    await this.msg.send(`${reason} Recorded ${count} question${count === 1 ? '' : 's'}. Saved in ${this.lastGameDir}.`);
    if (count) {
      await this.msg.sendFile(path.join(this.lastGameDir, 'questions.md'), 'Readable log');
      await this.msg.sendFile(path.join(this.lastGameDir, 'questions.json'), 'Structured log');
    }
  }

  async #closeGame() {
    this.state = 'idle';
    await this.recorder?.stop();
    this.lastGameDir = this.dash?.gameDir;
    await this.dash?.close();
    this.dash = this.recorder = null;
  }

  async #sendLog() {
    if (!this.recorder?.questions.length) return this.msg.send('No questions recorded yet.');
    this.recorder.save();
    return this.msg.sendFile(path.join(this.dash.gameDir, 'questions.md'), `${this.recorder.questions.length} questions so far`);
  }

  #status() {
    const q = this.recorder?.questions.length ?? 0;
    return {
      idle: 'Idle. Send a 4-digit game code to start.',
      joining: 'Working on joining…',
      awaitTeam: `In game ${this.gameCode}. Waiting for the 6-digit team code.`,
      awaitApproval: `Waiting for the captain to approve "${this.cfg.botName}".`,
      recording: `Recording game ${this.gameCode}: ${q} question${q === 1 ? '' : 's'} so far.`,
      manual: 'Stuck; waiting for manual commands (send "help").',
    }[this.state];
  }

  async #shot(caption) {
    if (!this.dash?.isOpen) return this.msg.send(caption);
    return this.msg.sendPhoto(await this.dash.screenshot(), caption);
  }

  async #stepShot(name, caption) {
    if (this.cfg.stepScreenshots && this.dash?.isOpen) {
      return this.msg.sendPhoto(await this.dash.screenshot(name), caption);
    }
    return this.msg.send(caption);
  }

  async #fail(err) {
    console.error(err);
    if (this.dash?.isOpen) {
      this.state = 'manual';
      const d = await this.dash.describe().catch(() => ({ buttons: [] }));
      const why = err instanceof NeedsHelp ? err.message : `Something broke: ${err.message}`;
      await this.#shot(`${why}\nButtons I can see: ${d.buttons.join(' | ') || '(none)'}\nHelp me with "click <text>", "type <text>", "enter", then resend the code or send "go". Or "stop".`).catch(() => {});
    } else {
      this.state = 'idle';
      await this.msg.send(`Something broke: ${err.message}. Send the game code to try again.`).catch(() => {});
    }
  }
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
