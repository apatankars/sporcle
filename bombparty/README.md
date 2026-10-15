# BombParty Practice

A single-player recreation of [JKLM.fun](https://jklm.fun/)'s BombParty for practice, with optional bots.

Open `index.html` in a browser. No server or install is needed; `words.js` must sit next to it.

## Rules (as in JKLM)

- The bomb shows a 2–3 letter prompt. On your turn, type a dictionary word containing it and press Enter.
- Words can't be reused in a round.
- The fuse is random and hidden, and keeps burning between turns. When a word is played with less than the minimum turn time left, the timer is topped back up to that minimum (5 s by default).
- If the bomb explodes on you, you lose a life. Last player standing wins.
- Use every letter of the bonus alphabet (default `abcdefghijlmnopqrstuv`, i.e. A–V without K) to gain a life, up to the max.

## Defaults

Starting lives 2, max lives 3, minimum turn 5 s, prompt difficulty "500+ words" (prompts that at least 500 dictionary words contain), prompt changes after 2 failed turns, fuse 10–30 s. All of these can be changed in Room settings.

## Practice extras

Optional visible timer, example answers for every prompt you miss, answer-time stats, endless mode, and bots at three skill levels.

## Dictionary

`words.js` holds the 267,751-word SOWPODS (Collins Scrabble Words) list, the same list used by community JKLM helper tools, plus a precomputed count of how many words contain each 2–3 letter prompt. JKLM's own English dictionary isn't published and differs a bit, so a few words may be accepted here and not there, or the other way round.
