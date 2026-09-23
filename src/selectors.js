// Everything the agent knows about the Dash page layout lives here.
//
// These are best guesses: sporcle.com/dash couldn't be reached while this was
// written, so each entry lists several fallbacks. After your first real game,
// look at games/<id>/network.jsonl and the step screenshots, then tighten
// these up. CSS strings are tried in order; regexes match visible text or
// accessible names.

export default {
  // Screen 1: the 4-digit game code.
  gameCodeInput: [
    'input[name*="game" i]',
    'input[placeholder*="game" i]',
    'input[aria-label*="game" i]',
    'input[name*="code" i]',
    'input[placeholder*="code" i]',
    'input[inputmode="numeric"]',
    'input[type="tel"]',
    'input[type="number"]',
    'input[type="text"]',
  ],
  gameCodeSubmit: /^\s*(join( game)?|enter|continue|go|submit|play)\s*$/i,

  // Screen 2: choose to join an existing team (never "create").
  joinTeamButton: /join (an? )?(existing )?team|have a team code|enter team code|join with (a )?code/i,

  // Screen 3: the 6-digit team code, plus our display name.
  teamCodeInput: [
    'input[name*="team" i]',
    'input[placeholder*="team" i]',
    'input[aria-label*="team" i]',
  ],
  genericCodeInput: [
    'input[name*="code" i]',
    'input[placeholder*="code" i]',
    'input[inputmode="numeric"]',
    'input[type="tel"]',
    'input[type="number"]',
  ],
  nameInput: [
    'input[name*="name" i]:not([name*="team" i])',
    'input[placeholder*="name" i]:not([placeholder*="team" i])',
    'input[aria-label*="name" i]:not([aria-label*="team" i])',
    'input[autocomplete="nickname"]',
    'input[autocomplete="name"]',
  ],
  teamCodeSubmit: /^\s*(join( team)?|request( to join)?|ask to join|continue|submit|enter|go)\s*$/i,

  // Text shown while the captain hasn't approved us yet.
  pendingText: /waiting (for|on)|pending|awaiting approval|request (has been )?sent|needs? to (approve|accept)|ask(ed)? your (team )?captain/i,
  // Text that means the codes were rejected.
  errorText: /invalid|not found|doesn'?t exist|does not exist|incorrect|try again|denied|rejected/i,

  // Where the question lives. The first selector that matches wins; if
  // none match, the whole <main>/<body> text is used.
  questionContainer: [
    '[data-testid*="question" i]',
    '[class*="question-card" i]',
    '[class*="questionCard" i]',
    '[class*="question" i]',
    '[class*="prompt" i]',
  ],
  pageFallback: ['main', '#root', '#app', 'body'],
  // Screens with this text are logged as questions even without a "?".
  questionHint: /\?|question\s*\d|mystery|final|round|picture|audio|name (the|these)|identify/i,

  // Arrows for multi-part questions. Searched inside the question
  // container first, then the whole page.
  nextArrow: [
    'button[aria-label*="next" i]',
    '[role="button"][aria-label*="next" i]',
    'button[title*="next" i]',
    'button:has-text("Next")',
    'button:has-text("›")',
    'button:has-text("→")',
    'button:has-text("❯")',
    'button:has-text(">")',
    'button[class*="next" i]',
    '[class*="next" i][role="button"]',
    'button:has([class*="arrow-right" i])',
    'button:has([class*="chevron-right" i])',
    'button:has(svg[class*="right" i])',
  ],
  prevArrow: [
    'button[aria-label*="prev" i]',
    'button[aria-label*="back" i]',
    'button:has-text("‹")',
    'button:has-text("←")',
    'button:has-text("❮")',
    'button:has-text("<")',
    'button[class*="prev" i]',
  ],

  // The agent never clicks anything matching this on its own, so it can't
  // submit an answer, spend a wager or leave the team by accident.
  neverClick: /submit|wager|lock ?in|send|confirm|create|leave|log ?out|sign ?out|delete|remove|kick/i,

  gameOverText: /game over|final (scores?|standings|results)|thanks for playing|game (has )?ended/i,

  // Lines dropped before comparing screens (timers, scores, counters).
  noiseLines: [
    /^\d{1,2}:\d{2}$/,
    /^\d+$/,
    /^\d+\s*(s|sec|secs|seconds?)( left| remaining)?$/i,
    /^(time|timer)\s*:?\s*\d/i,
    /^[‹›<>←→❮❯\s]+$/,
  ],
};
