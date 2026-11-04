// The publishing guidelines (PLATFORM_SPEC 5.3 to 5.5). Reviewers reject with these codes, so keep the codes stable.
export const RULES = [
  {
    code: 'Q1',
    title: 'Runs',
    body: 'No crash on launch. It loads in a reasonable time on a mid-range laptop and works in Chrome and Firefox.',
  },
  {
    code: 'Q2',
    title: 'A real game',
    body: 'Paid games have a complete core loop and roughly 15 minutes of content or more. Free games can be shorter, but must be finished.',
  },
  {
    code: 'Q3',
    title: 'Honest store page',
    body: 'Screenshots and the trailer show the real game, and the description matches what you get.',
  },
  {
    code: 'Q4',
    title: 'Original',
    body: 'No unmodified asset flips sold as a full game and no third-party IP. AI-generated art and audio must be disclosed.',
  },
  {
    code: 'Q5',
    title: 'Works without the token',
    body: "The game never requires buying its token to play or progress, and every shop item has a stablecoin price.",
  },
  {
    code: 'Q6',
    title: 'Wallet-safe',
    body: 'Signatures and payments go only through the store SDK. No raw wallet prompts and no external payment links.',
  },
  {
    code: 'Q7',
    title: 'Purchases through the SDK',
    body: 'Every in-game purchase uses the store SDK shop. Shop sales carry no store fee.',
  },
  {
    code: 'Q8',
    title: 'Content labeled',
    body: 'Declare an age rating and flag adult content. Illegal content is rejected.',
  },
];


// Why a developer application can be turned down. The applicant sees the code, its text and the reviewer's note.
export const APPLICATION_REASONS = [
  { code: 'A1', title: 'Profile incomplete', body: 'The studio name, links or past work are missing or unclear.' },
  { code: 'A2', title: "Links don't check out", body: "We couldn't confirm the links or past work belong to you." },
  { code: 'A3', title: 'Not a game developer', body: 'The application does not show game development work, or looks like spam.' },
  { code: 'A4', title: 'Other', body: "See the reviewer's note." },
];

export const ruleCodes = RULES.map((r) => r.code);
export const applicationCodes = APPLICATION_REASONS.map((r) => r.code);
