import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Talks to you through a Telegram bot using long polling, so it works from a
// laptop behind a router with no public URL. Only TELEGRAM_CHAT_ID can
// control it; anyone else who messages the bot is told the chat is locked.
export class TelegramMessenger {
  constructor({ token, chatId }) {
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
    this.api = `https://api.telegram.org/bot${token}`;
    this.chatId = String(chatId || '');
    this.offset = 0;
    this.running = false;
  }

  async start(onMessage) {
    this.running = true;
    if (!this.chatId) console.log('TELEGRAM_CHAT_ID is not set. Message the bot and it will reply with your chat id.');
    while (this.running) {
      let updates;
      try {
        const res = await fetch(`${this.api}/getUpdates?timeout=30&offset=${this.offset}`);
        updates = (await res.json()).result || [];
      } catch (err) {
        console.error('Telegram poll failed:', err.message);
        await sleep(3000);
        continue;
      }
      for (const u of updates) {
        this.offset = u.update_id + 1;
        const msg = u.message;
        if (!msg?.text) continue;
        const from = String(msg.chat.id);
        if (!this.chatId) {
          await this.#call('sendMessage', { chat_id: from, text: `Your chat id is ${from}. Put TELEGRAM_CHAT_ID=${from} in .env and restart me.` });
          continue;
        }
        if (from !== this.chatId) {
          await this.#call('sendMessage', { chat_id: from, text: 'This recorder is private.' });
          continue;
        }
        onMessage(msg.text.trim());
      }
    }
  }

  stop() {
    this.running = false;
  }

  async send(text) {
    if (!this.chatId) return console.log(text);
    // Telegram caps messages at 4096 chars.
    for (let i = 0; i < text.length; i += 4000) {
      await this.#call('sendMessage', { chat_id: this.chatId, text: text.slice(i, i + 4000) });
    }
  }

  async sendPhoto(buf, caption = '') {
    if (!this.chatId) return;
    const form = new FormData();
    form.append('chat_id', this.chatId);
    form.append('caption', caption.slice(0, 1000));
    form.append('photo', new Blob([buf], { type: 'image/png' }), 'screen.png');
    await this.#call('sendPhoto', form);
  }

  async sendFile(file, caption = '') {
    if (!this.chatId || !fs.existsSync(file)) return;
    const form = new FormData();
    form.append('chat_id', this.chatId);
    form.append('caption', caption.slice(0, 1000));
    form.append('document', new Blob([fs.readFileSync(file)]), path.basename(file));
    await this.#call('sendDocument', form);
  }

  async #call(method, body) {
    try {
      const isForm = body instanceof FormData;
      const res = await fetch(`${this.api}/${method}`, {
        method: 'POST',
        body: isForm ? body : JSON.stringify(body),
        headers: isForm ? undefined : { 'content-type': 'application/json' },
      });
      const json = await res.json();
      if (!json.ok) console.error(`Telegram ${method} failed:`, json.description);
    } catch (err) {
      console.error(`Telegram ${method} failed:`, err.message);
    }
  }
}
