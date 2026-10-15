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

## Training features

- **Drill mode**: one prompt at a time against a visible timer (6 s by default). Answers under 2 s count as fast. Misses and slow answers come back a few prompts later in the same set. Types: Smart mix, My weak spots, Hard prompts, Prompts I haven't seen.
- **Coach**: after each of your turns it rates your speed, says where the prompt usually sits in a word (start, middle or end), suggests shorter go-to words, reminds you of backup forms (-S, -ED, -ING) and points out words that would have picked up more bonus letters.
- **Weak spots**: every prompt you see is remembered in this browser with your misses, average time and a mastery level. The worst ones are listed with go-to words and can be drilled, or mixed into play rounds.
- **Progress**: a chart of your average answer time per session.
- **Strategy tab**: a written strategy, a practice routine, and a cheat sheet of the prompts at your difficulty with the fewest everyday words.
- **Pocket words**: when you have 6 or fewer bonus letters left, the bonus panel lists common words for each one.

Bots only play words from an everyday-English frequency list: Casual bots know the ~6,000 most common words, Regular ~15,000, and Sweaty all ~34,000 plus the odd obscure Scrabble word when they're stuck. The frequency list is [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) (top 50k English words from subtitles, MIT license), filtered to words in the dictionary.

## Dictionary

`words.js` holds the 267,751-word SOWPODS (Collins Scrabble Words) list, the same list used by community JKLM helper tools, plus a precomputed count of how many words contain each 2–3 letter prompt. JKLM's own English dictionary isn't published and differs a bit, so a few words may be accepted here and not there, or the other way round.
