# Looksy test framework (sample)

A self-contained Playwright test framework targeting Looksy. This exists
as a realistic `--repo` target for the AI test generator until your real
`core-automation-playwright-ts` framework is wired up.

It mirrors the conventions of the New Look shared framework:

- Lazy proxy POMs (locators as getters, not constructor assignment)
- Fixture-injected tests (POMs available via test args, never `new HomePage(page)`)
- Test data factories with deterministic timestamps
- Composite flows for cross-page sequences used in multiple tests
- Selector priority: `testid > role > label > placeholder`
- No hard waits, no raw CSS selectors, no XPath
- Three-tag test names: `@web @<domain> @priority-<level>`

## What's in here

```
examples/looksy/
├── FRAMEWORK.md             ← convention rules (the AI generator reads this)
├── README.md                ← you are here
├── tsconfig.json            ← TypeScript config
├── pages/                   ← page object models, one per route
│   ├── home.page.ts         ← / route
│   ├── catalog.page.ts      ← /shop and /shop/:category
│   ├── product.page.ts      ← /product/:slug
│   ├── cart-drawer.page.ts  ← global slide-out cart
│   ├── checkout.page.ts     ← /checkout (3-step stepper)
│   ├── order-confirmation.page.ts  ← /order/:orderId
│   └── account.page.ts      ← /account
├── fixtures/
│   ├── looksy.fixture.ts            ← base test with all POMs injected
│   └── authenticated.fixture.ts     ← extends base with signed-in user
├── utils/
│   ├── selectors.ts         ← testid helpers — the only place CSS-style
│   │                          attribute selection is permitted
│   └── flows.ts             ← composite multi-page flows
├── test-data/
│   └── factories.ts         ← user, address, card, variant builders
├── types/
│   └── index.ts             ← shared types — ProductVariant, TestUser, etc
├── config/
│   └── playwright.config.ts ← runner config (auto-starts Looksy optional)
└── tests/
    └── checkout.spec.ts     ← reference tests showing the conventions
```

## How to use this with the AI generator

From the `qa-ai-prototype` root:

```bash
npm run gen -- \
  --repo ./examples/looksy \
  --request "test that a guest user can apply WELCOME10 and complete checkout" \
  --print --verbose
```

The catalogue extractor walks this folder and finds:
- 7 POMs in `pages/`
- 2 fixtures in `fixtures/`
- 2 utilities in `utils/`
- factories in `test-data/`

Generated tests should import from these files, use the POM methods,
and tag correctly. If they don't, the validators in the prototype will
catch it and trigger a retry.

## Running the reference tests against Looksy

The reference tests in `tests/checkout.spec.ts` are real, runnable
Playwright tests. The framework has its own `package.json`, so install
its dependencies first (this gives your editor proper IntelliSense
too — without it, you'll see `Cannot find module '@playwright/test'`
errors in the example files):

```bash
cd /path/to/qa-ai-prototype/examples/looksy
npm install
npx playwright install chromium    # one-off
```

Then run:

```bash
# Terminal 1 — start Looksy
cd /path/to/looksy-shop
npm run dev

# Terminal 2 — run the tests
cd /path/to/qa-ai-prototype/examples/looksy
npm test
```

Or from the prototype root, point Playwright at the example's config:

```bash
cd /path/to/qa-ai-prototype
npx playwright test --config=examples/looksy/config/playwright.config.ts
```

## When to swap to your real framework

This is a **placeholder** — designed to behave like a real framework
so the AI generator can be exercised end-to-end on your laptop. Once
you have access to your real `core-automation-playwright-ts` repo,
just change the `--repo` flag:

```bash
# Was:
npm run gen -- --repo ./examples/looksy --request "..."

# Becomes:
npm run gen -- --repo /path/to/core-automation-playwright-ts --request "..."
```

The prototype doesn't care which framework it points at, as long as
the framework follows the conventions in `FRAMEWORK.md`. If the real
framework has different conventions, update the prompt template
(`src/prompts/test-generation.yaml`) and the validators
(`src/validators/static.ts`) to match.

## Adapting this template to your own framework

If you want to reuse this structure as the basis for your real
framework, the things you'd change:

1. `pages/` — replace Looksy POMs with the ones for your real app
2. `test-data/factories.ts` — your real users, addresses, payment shapes
3. `types/index.ts` — your domain types
4. `config/playwright.config.ts` — your `baseURL` and project setup
5. `FRAMEWORK.md` — your conventions, if they differ

The rest (fixture pattern, utility split, POM pattern) is generic.
