# QA AI prototype — Phase 0

A pure open-source, locally-runnable prototype for generating
framework-aligned Playwright tests using a small Qwen Coder model via
Ollama.

This validates the **harness loop** before any infrastructure spend:

- ts-morph extracts a structured catalogue from your framework repo
- A context builder selects relevant POMs, fixtures, and utils for a request
- A YAML-versioned system prompt encodes framework conventions
- The harness calls Ollama, validates the output, retries with the error fed back
- Static validators enforce the hard rules (no raw selectors, no hard waits, fixture imports)

Everything runs on your laptop. No cloud, no paid API, no GPU required.

## Table of contents

- [Prerequisites](#prerequisites)
- [Install](#install)
- [Quick start: run against the bundled Looksy framework](#quick-start-run-against-the-bundled-looksy-framework)
- [Writing a request](#writing-a-request)
- [Reading and improving the output](#reading-and-improving-the-output)
- [Swap to your real framework when ready](#swap-to-your-real-framework-when-ready)
- [Project structure](#project-structure)
- [Architecture mapping](#architecture-mapping)
- [Tests](#tests)
- [What's deliberately not here yet](#whats-deliberately-not-here-yet)
- [Next concrete steps](#next-concrete-steps)

## Prerequisites

You need three things on your machine. Skip any you've already got.

**Node.js 20 or newer.** Check with `node --version`. Install via
`nvm install 20` or from nodejs.org if missing.

**Ollama** to run the model locally — no API keys, no paid services.

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows: download the installer from https://ollama.com/download
```

After install, verify Ollama is running:

```bash
curl http://localhost:11434/api/tags
```

That should return JSON. If you see "connection refused," start it
manually with `ollama serve` in a spare terminal.

**The Qwen Coder model.** The prototype defaults to the 7B variant —
fits on a laptop with 16 GB RAM, generates code well enough to validate
the loop.

```bash
ollama pull qwen2.5-coder:7b
```

That's about 4.5 GB, takes a few minutes on a decent connection. Verify:

```bash
ollama list                                            # should list qwen2.5-coder:7b
ollama run qwen2.5-coder:7b "Print one Playwright assertion."
                                                       # /bye to exit
```

## Install

```bash
unzip qa-ai-prototype.zip
cd qa-ai-prototype
npm install
```

Quick smoke test of the prototype's own internals — don't proceed if
these fail:

```bash
npm test    # 6 passing: 5 validator + 1 extractor smoke
```

## Quick start: run against the bundled Looksy framework

The prototype ships with **two** sample frameworks under `examples/`:

| Folder                  | What it is                                 | When to use                                          |
|-------------------------|--------------------------------------------|------------------------------------------------------|
| `examples/looksy/`      | Full Playwright framework targeting Looksy | **Default for end-to-end runs.** Recommended.        |
| `examples/checkout/`    | Minimal 2-POM smoke set                    | Just for verifying the catalogue extractor works.    |

Use the **looksy** example for everything else. It has 7 POMs, 2
fixtures, factory data, types, and a Playwright config — a realistic
framework shape that exercises the full prototype.

### Your first run

```bash
npm run gen -- \
  --repo ./examples/looksy \
  --request "test that a guest user can complete checkout with card payment" \
  --print --verbose
```

What you should see (in order):

1. **Extraction phase** — "Found 7 POMs, 2 fixtures, 5 utilities" with
   their names listed.
2. **Context build** — the markdown context that will be sent to the
   model. Should mention `CheckoutPage`, `CartDrawerPage`, the
   `looksy.fixture` import path, and the test data factories.
3. **Generation** — model streams tokens for 20-60 seconds (first run
   is slowest because the model loads into memory).
4. **Validation** — the static validators check the output. You should
   see "0 hard violations, 0 soft violations" if the model gets it right.
5. **Output** — generated Playwright test printed to stdout.

If you see a test that imports from `../fixtures/looksy.fixture`, uses
POM methods like `await checkoutPage.fillContactAndContinue(...)`, and
ends its name with `@web @checkout @priority-high` — the loop works.

### Run the generated test against Looksy

The generated test is real, runnable Playwright code. To execute it:

```bash
# Terminal 1 — start the Looksy app
cd /path/to/looksy-shop
npm run dev    # http://localhost:5173

# Terminal 2 — write the generated test out and run it
cd /path/to/qa-ai-prototype
npm run gen -- \
  --repo ./examples/looksy \
  --request "..." \
  --out ./examples/looksy/tests/generated.spec.ts

npx playwright install chromium    # one-off
npx playwright test \
  --config=examples/looksy/config/playwright.config.ts \
  generated.spec.ts
```

A pass means the model produced a test that uses your conventions AND
runs successfully against the live app. That's the metric to bring to
Nipam.

## Writing a request

The `--request` flag is the lever you're pulling. The model gets:

1. The system prompt with framework rules (versioned in `src/prompts/test-generation.yaml`)
2. The relevant slice of the catalogue (POM signatures, fixtures, utils)
3. **Your request text**

Three levels of detail, in increasing specificity:

### Minimal — let the model figure out the journey

```bash
--request "test the on-sale filter on the catalog page"
```

Good for exploratory generation. The model picks reasonable assertions.
Sometimes surprising, sometimes wrong. Useful early on to see what the
model knows about your framework.

### Medium — specify the journey, not every assertion

```bash
--request "a guest user filters the catalog to on-sale only, picks the Selvedge Straight Jean in storm, adds size L to cart, and proceeds to checkout"
```

This is the sweet spot. Concrete enough to constrain the test, loose
enough that the model picks POM methods and assertions from the catalogue.

### High-detail — Gherkin-style explicit steps

```bash
--request "
Given I am on the home page
When I navigate to /shop and apply the on-sale filter
Then the result count should be less than 16
When I click the Selvedge Straight Jean
And I select size L and color Storm
And I click Add to Bag
Then the cart drawer should open
And the cart badge should show 1
"
```

Good for regressions where you need exact steps. Less freedom for the
model, more determinism.

**The medium form is what you should write 80% of the time.** Start
medium, drop to high-detail only when the model produces something
wrong and you want to constrain it more.

## Reading and improving the output

After a run, three things to check in the generated test:

**1. Does it import from the framework fixture, not `@playwright/test`?**

```ts
// ✓ good
import { test, expect } from "../fixtures/looksy.fixture";

// ✗ bad — bypasses the framework
import { test, expect } from "@playwright/test";
```

If the bad version slips through, your validator's `fixture-import`
rule needs strengthening. Look at `src/validators/static.ts`.

**2. Are selectors testid-first?**

```ts
// ✓ good — uses POM methods (which use testid internally)
await catalogPage.filterByCategory("knitwear");

// ✗ bad — raw CSS, should be caught by `no-raw-locator`
await page.locator(".filter-pill.knitwear").click();
```

**3. Are the tags right?**

```ts
test("name @web @<domain> @priority-<level>", async ({ ... }) => { ... });
```

Missing tags surface as warnings (soft gate) but don't fail generation.
If they're consistently missing, strengthen the prompt's tag rules in
`src/prompts/test-generation.yaml`.

## Swap to your real framework when ready

When you have access to your real `core-automation-playwright-ts`,
the swap is one flag:

```bash
# Was:
npm run gen -- --repo ./examples/looksy --request "..."

# Becomes:
npm run gen -- --repo /path/to/core-automation-playwright-ts --request "..."
```

The prototype doesn't care which framework it points at, **as long as
the framework follows the conventions in `examples/looksy/FRAMEWORK.md`**.
If your real framework has different conventions:

- **Different fixture import path?** Update the prompt's "Fixture imports"
  section in `src/prompts/test-generation.yaml`.
- **Different tag scheme?** Update the prompt's tag rules.
- **Different POM file location?** Pass `--pom-glob` etc. to the CLI.
- **Stricter selector rules?** Update validators in `src/validators/static.ts`.

For the first run on the real repo, save the catalogue so you can
inspect what the extractor found:

```bash
npm run gen -- \
  --repo /path/to/core-automation-playwright-ts \
  --request "test add to cart" \
  --save-catalogue ./real-catalogue.json \
  --verbose
```

Then `cat real-catalogue.json | jq '.poms | length'` to see if the
extraction picked up everything. If it missed POMs, the file location
or shape probably differs from the bundled example — adjust the globs.

After the first extraction, reuse the catalogue across runs:

```bash
npm run gen -- \
  --repo /path/to/core-automation-playwright-ts \
  --catalogue ./real-catalogue.json \
  --request "..."
```

This skips re-extraction (faster) and gives you a stable target while
you iterate on prompts.

## Project structure

```
qa-ai-prototype/
├── README.md                 ← you are here
├── package.json              ← scripts: gen, test, build
├── tsconfig.json
│
├── src/                      ← the prototype itself
│   ├── cli.ts                ← CLI entrypoint, parses args, runs the harness
│   ├── types.ts              ← shared types (Catalogue, GenRequest, GenResult)
│   │
│   ├── catalogue/extractor.ts    ← ts-morph walks --repo, extracts POMs/fixtures/utils
│   ├── context/builder.ts        ← picks the right slice of catalogue for the request
│   │
│   ├── prompts/test-generation.yaml   ← system prompt — framework conventions
│   ├── prompts/loader.ts         ← assembles the full prompt from system + context + request
│   │
│   ├── harness/loop.ts           ← Ollama call + retry-on-validation-failure loop
│   └── validators/static.ts      ← hard rules (no raw locator, no hard waits, etc)
│
├── tests/                    ← unit tests for the prototype's own internals
│   ├── extractor.test.ts     ← smoke test for catalogue extraction
│   └── validator.test.ts     ← validator rules
│
└── examples/                 ← sample frameworks the prototype can target
    ├── checkout/             ← minimal 2-POM example (smoke testing only)
    └── looksy/               ← full framework targeting the Looksy app ★
        ├── FRAMEWORK.md      ← conventions doc — read this for the rules
        ├── README.md         ← framework-level docs
        ├── pages/            ← 7 POMs, one per Looksy route
        ├── fixtures/         ← base + authenticated test extensions
        ├── utils/            ← selector helpers, composite flows
        ├── test-data/        ← user/address/card/variant factories
        ├── types/            ← shared domain types
        ├── config/           ← Playwright config pointing at localhost:5173
        └── tests/            ← reference test showing the conventions
```

## Architecture mapping

The architecture maps directly to the five-layer rule enforcement stack
designed earlier:

| Layer                    | Where in code                         | Status            |
|--------------------------|---------------------------------------|-------------------|
| 1. System prompt rules   | `src/prompts/test-generation.yaml`    | ✓ here            |
| 2. Curated context       | `src/catalogue/` + `src/context/`     | ✓ here            |
| 3. Structured output     | (tool-use schema)                     | Phase 1b          |
| 4. Static validation     | `src/validators/static.ts`            | ✓ here (regex)    |
| 5. Runtime validation    | (Playwright dry-compile)              | Phase 1c          |

## Tests

```bash
npm test
```

Unit tests cover the validator rules and a smoke test for the catalogue
extractor against the bundled examples. Run before changing the prompt
or the rules to make sure you don't regress.

## What's deliberately not here yet

- No Bifrost gateway (this is single-process)
- No Kestra orchestration (this is a CLI)
- No pgvector or embeddings (catalogue-first retrieval is enough for Phase 0)
- No Continue.dev integration (Phase 1)
- No PR review or self-healing flows (Phase 2/3)
- No vLLM (Ollama is fine for laptop validation; vLLM comes when scaling)

These all go in subsequent phases. The point of Phase 0 is to prove the
harness loop produces framework-aligned tests on a small model. If it
works here, the same code (with Bifrost swapped in for the Ollama client)
runs identically against vLLM in production.

## Next concrete steps

1. Run the generator against `examples/looksy` end-to-end against the
   live Looksy app. Note first-shot vs post-retry success rate.
2. Generate 10-20 tests across the @home, @catalog, @product, @cart,
   @checkout, @account, @promo domains. Score them.
3. When `core-automation-playwright-ts` access is available, swap
   `--repo`. Tune globs as needed.
4. Compare 7B output against Qwen2.5-Coder 32B (needs either a bigger
   laptop, a single L40S/A10G, or a cloud GPU). If 7B is good enough,
   the proposal to Nipam writes itself: "framework-aligned tests on a
   small model with context engineering — give us one GPU and we can
   serve the whole team."
