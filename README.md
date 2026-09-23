# Sporcle Dash recorder

A bot you control by text. It joins your [Sporcle Dash](https://www.sporcle.com/dash/) team and saves every question in the game, including each part of multi-part questions, to a log you can go through afterwards.

It only reads. It never submits answers, places wagers, creates teams or leaves the team; anything whose label matches `neverClick` in `src/selectors.js` is off limits unless you tell it to click it.

## How a game goes

```
you: 4821                  ← the 4-digit game code
bot: [screenshot] Game 4821 entered. Now send me the 6-digit team code.
you: 305117                ← your team code
bot: [screenshot] I asked to join. Approve "Recorder" in Dash and I'll start recording.
      … you approve it in Dash …
bot: I'm in. Recording every question.
bot: Q1 [Question 1]: What is the capital of …
bot: Q2 [Question 2] (3 parts): Part A: …
      …
bot: Looks like the game is over. I'll wrap up in 60s.
bot: Stopped. Recorded 17 questions.  [questions.md] [questions.json]
```

When a question has a next arrow, the bot clicks through every part and records each one. If the host reveals parts over time instead, each new part is added to the same question.

### Commands

| Text | What it does |
| --- | --- |
| `1234` | Game code; opens Dash and enters it |
| `123456` | Team code; joins the team and asks to be approved |
| `status` | What the bot is doing |
| `shot` | Screenshot of the bot's screen |
| `log` | Sends the log so far |
| `stop` | Finishes, sends the log, closes the browser |
| `buttons` | Lists the buttons and inputs on screen |
| `click <text>` | Clicks the button with that text |
| `type <text>` / `fill <text>` / `enter` | Types into the selected box / fills the first empty box / presses Enter |
| `go` | Starts recording now (e.g. if approval went through but the bot didn't notice) |

If the page doesn't look the way the bot expects, it texts you a screenshot and the buttons it can see, and waits. Use `click`/`type`/`enter` to get it past that screen, then resend the code or send `go`.

## Setup

Requires Node 22+.

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

### Texting it (Telegram)

The bot uses Telegram. It's free, it can send screenshots, and it works from a laptop with no public URL or port forwarding.

1. In Telegram, message **@BotFather**, send `/newbot`, and copy the token into `TELEGRAM_BOT_TOKEN` in `.env`.
2. Run `npm start` and send your new bot any message. It replies with your chat id.
3. Put that id in `TELEGRAM_CHAT_ID` and restart `npm start`. Only that chat can control the bot.

Keep `npm start` running on any computer that stays on during the game (a laptop, a Raspberry Pi or a small cloud VM).

### Trying it in a terminal

`npm run console` runs the same bot, but you type the messages into the terminal. Screenshots are saved to `games/last-screenshot.png`. Set `HEADLESS=false` to watch the browser.

### If Dash needs a Sporcle login

Set `BROWSER_PROFILE_DIR=browser-profile` in `.env`, run `npm run login`, sign in in the window that opens, and press Enter. The bot reuses that session.

## What gets saved

Each game gets a folder in `games/`, e.g. `games/2026-09-23-19-30_game-4821/`:

- `questions.md`: readable log with each question, its parts and a screenshot of each
- `questions.json`: the same thing as structured data
- `shots/`: `q02-p3.png` = question 2, part 3
- `screens.jsonl`: every distinct screen the bot saw, including lobby and score screens
- `network.jsonl`: every WebSocket message and JSON response Dash sent. If the scraper misses something, it's almost certainly in here.
- `game-code.png`, `pending.png`, `recording.png`: screenshots from joining

## Tuning to the real Dash page

This was built without access to sporcle.com/dash (it was blocked from the build environment) and there's little public documentation, so `src/selectors.js` is a set of educated guesses with fallbacks: code boxes, "Join a Team", name field, "waiting for approval" text, the question container, and next/previous arrows. After your first game, check `screens.jsonl` and `network.jsonl`. If questions were missed or had extra text, adjust the matching entry in `src/selectors.js`. It's all in that one file.

`npm test` runs the whole flow against `test/mock-dash/index.html`: game code, join team, team code, approval, three questions (one with three parts) and game over. The mock copies the flow described above, not Sporcle's real HTML.
