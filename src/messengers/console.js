import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

// Type messages in the terminal instead of texting. Handy for a dry run.
export class ConsoleMessenger {
  constructor({ outDir }) {
    this.outDir = outDir;
  }

  start(onMessage) {
    this.rl = readline.createInterface({ input: process.stdin });
    this.rl.on('line', (line) => line.trim() && onMessage(line.trim()));
    console.log('Console mode: type what you would text the bot (try "help").');
    return new Promise((resolve) => this.rl.on('close', resolve));
  }

  stop() {
    this.rl?.close();
  }

  async send(text) {
    console.log(`\n[bot] ${text}\n`);
  }

  async sendPhoto(buf, caption = '') {
    fs.mkdirSync(this.outDir, { recursive: true });
    const file = path.join(this.outDir, `last-screenshot.png`);
    fs.writeFileSync(file, buf);
    console.log(`[bot] (screenshot saved to ${file}) ${caption}`);
  }

  async sendFile(file, caption = '') {
    console.log(`[bot] (file: ${file}) ${caption}`);
  }
}
