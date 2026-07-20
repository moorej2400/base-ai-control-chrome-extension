// Declarative scenarios for the browser-control e2e suite.
//
// Each scenario sends ONE prompt to the real agent, then scores the outcome.
// Two kinds of check:
//   - hard  (default): asserted against the bench's GROUND-TRUTH event log
//     (real DOM changes / page loads). These gate the suite.
//   - advisory (advisory:true): inspects the transcript for expected tool use.
//     Reported but non-gating — the agent may reach a correct end state via a
//     different-but-valid tool path, and only a human/AI should judge that.
//
// ctx passed to each check fn:
//   finalValues  { [id]: string|boolean }  last value/checked seen per field id
//   submitted    boolean                    was the form submitted / submit clicked
//   paths        string[]                    page-loaded paths, in order
//   transcript   string                      concatenated text of the last assistant turn
//   toolNames    string[]                    tool names used in the last assistant turn

const BENCH = 'http://localhost:4599';

export const scenarios = [
  {
    name: 'fill-form',
    prompt: [
      `Go to ${BENCH} and fill out the Step 1 form:`,
      '- Full name: Ada Lovelace',
      '- Email: ada@example.com',
      '- Favorite color: Blue',
      '- Shirt size: Large',
      '- Check "Subscribe to newsletter"',
      '- Preferred contact: Phone',
      '- Quantity: 7',
      '- Message: Hello from the agent',
      'Do NOT click Submit. Then briefly report what you set.',
    ].join('\n'),
    checks: [
      { name: 'fullname = Ada Lovelace', fn: (c) => c.finalValues.fullname === 'Ada Lovelace' },
      { name: 'email = ada@example.com', fn: (c) => c.finalValues.email === 'ada@example.com' },
      { name: 'color = blue', fn: (c) => c.finalValues.color === 'blue' },
      { name: 'size = l', fn: (c) => c.finalValues.size === 'l' },
      { name: 'subscribe checked', fn: (c) => c.finalValues.subscribe === true },
      { name: 'contact = phone', fn: (c) => c.finalValues['contact-phone'] === true },
      { name: 'quantity = 7', fn: (c) => String(c.finalValues.quantity) === '7' },
      { name: 'message set', fn: (c) => c.finalValues.message === 'Hello from the agent' },
      { name: 'NOT submitted', fn: (c) => c.submitted === false },
    ],
  },

  {
    name: 'navigation',
    prompt: [
      `Go to ${BENCH}. Click the "Go to step 2" link to navigate to the Step 2 page.`,
      'Confirm the page heading mentions Step 2. Then use the browser Back action to return to Step 1.',
      'Report which pages you ended up on.',
    ].join('\n'),
    checks: [
      { name: 'reached /page2', fn: (c) => c.paths.includes('/page2') },
      {
        name: 'navigated back to step 1 after step 2',
        fn: (c) => c.paths.indexOf('/page2') !== -1 && c.paths.lastIndexOf('/') > c.paths.indexOf('/page2'),
      },
      { name: 'used navigate_history (back)', advisory: true, fn: (c) => c.toolNames.includes('navigate_history') },
    ],
  },

  {
    name: 'tabs',
    prompt: [
      `Open two new browser tabs: the first at ${BENCH} and the second at ${BENCH}/page2.`,
      'Then list all open tabs and tell me the total count and the titles of the two you just opened.',
    ].join('\n'),
    checks: [
      { name: 'opened a step-1 tab', fn: (c) => c.paths.includes('/') },
      { name: 'opened a step-2 tab', fn: (c) => c.paths.includes('/page2') },
      { name: 'used new_tab', advisory: true, fn: (c) => c.toolNames.includes('new_tab') },
      { name: 'used list_tabs', advisory: true, fn: (c) => c.toolNames.includes('list_tabs') },
    ],
  },

  {
    name: 'screenshot',
    prompt: [
      `Go to ${BENCH}. Near the top there is a "Rendered badge" image showing a`,
      '4-digit number. The number is baked into the image pixels — it is NOT in the',
      'page text, DOM, or any script, so reading the HTML will not reveal it.',
      'Take a screenshot and tell me the 4-digit number shown in the badge.',
    ].join('\n'),
    checks: [
      // Hard: capture succeeded (bytes returned) — the screenshot mechanism works.
      { name: 'take_screenshot succeeded', fn: (c) => c.rawTools.some((t) => t.type === 'tool-take_screenshot' && t.state === 'output-available') },
      // ADVISORY: whether the model actually READ the pixel-only token via vision.
      // With the GitHub Copilot provider this currently FAILS by design: its
      // Responses adapter is text-only (function_call_output takes no image), so
      // the screenshot never reaches the model. Passes only on a provider that
      // delivers images to the model. See docs/BROWSER_CONTROL_PLAN.md.
      { name: 'reply reads badge token via vision (needs image-capable provider)', advisory: true, fn: (c) => !!c.badgeToken && c.transcript.includes(c.badgeToken) },
      // Advisory: after the text-only note, ideally the agent stops retrying the
      // screenshot and reports back rather than looping. Model-behaviour dependent
      // (and sensitive to accumulated session context), so not gating.
      { name: 'did not loop on screenshots (<= 2)', advisory: true, fn: (c) => c.toolNames.filter((n) => n === 'take_screenshot').length <= 2 },
    ],
  },

  {
    name: 'dynamic-wait',
    prompt: [
      `Go to ${BENCH}. Click the "Load promo field" button.`,
      'A promo code input appears after a short delay — wait for it to exist, then enter PROMO2026 into it.',
      'Confirm the promo field now contains that code.',
    ].join('\n'),
    checks: [
      { name: 'promo field filled = PROMO2026', fn: (c) => c.finalValues.promo === 'PROMO2026' },
      { name: 'used wait_for', advisory: true, fn: (c) => c.toolNames.includes('wait_for') },
    ],
  },
];
