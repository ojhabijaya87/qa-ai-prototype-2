# QA AI prototype — Phase 0

A pure open-source, locally-runnable prototype for generating
framework-aligned Playwright tests using Qwen3-Coder via Ollama.

This validates the full **harness loop** before any infrastructure spend:

- **ts-morph extracts a catalogue** from your framework — POMs, fixtures,
  utilities, **enum-like types, named-constant catalogues, existing tests**
- A **live-app crawler** auto-discovers routes (sitemap → BFS) and pulls
  every interactable element with multi-signal IDs (testid, role, accessible
  name, label, placeholder, alt, title, text). Descends into **iframes**
  and **shadow DOM**.
- The **context builder** picks the slice of catalogue + crawl + 3 most
  similar existing tests and renders it into a markdown prompt
- The **harness** calls Ollama, runs **layered validators** on the output
  (static → compile → dry-compile), and retries with errors fed back
- A versioned **system prompt** encodes framework conventions

Everything runs on your laptop. No cloud, no paid API. A GPU isn't strictly
required but is recommended on the 30B model — see [Prerequisites](#prerequisites).

## Table of contents

- [Architecture at a glance](#architecture-at-a-glance)
- [The five-layer context strategy](#the-five-layer-context-strategy)
- [Project structure](#project-structure)
- [Per-file roles](#per-file-roles)
- [Prerequisites](#prerequisites)
- [Install](#install)
- [Quick start](#quick-start)
- [Writing a request](#writing-a-request)
- [Reading the validator results](#reading-the-validator-results)
- [Swap to your real framework when ready](#swap-to-your-real-framework-when-ready)
- [Architecture mapping](#architecture-mapping)
- [Tests](#tests)
- [Next concrete steps](#next-concrete-steps)

## Architecture at a glance

```
   ┌──────────────────────────────────────────────────────────────────┐
   │                       USER INPUT                                 │
   │  --repo /path/to/framework      --request "guest checkout..."    │
   │  --app-url http://localhost:5173                                 │
   └────────┬─────────────────────────────────────┬───────────────────┘
            │                                     │
            ▼                                     ▼
   ┌───────────────────┐                ┌──────────────────────┐
   │  CATALOGUE        │                │  CRAWLER             │
   │  EXTRACTOR        │                │  (Playwright)        │
   │  (ts-morph)       │                │                      │
   │                   │                │  Discovery:          │
   │  - POMs           │                │   sitemap → BFS      │
   │  - Fixtures       │                │                      │
   │  - Utilities      │                │  Per route:          │
   │  - Enum-like types│                │   - testid           │
   │  - Named const    │                │   - role + name      │
   │    catalogues     │                │   - label / placeh   │
   │  - Existing tests │                │   - alt / title      │
   │                   │                │   - text             │
   │                   │                │   - aria snapshot    │
   │                   │                │                      │
   │                   │                │  Frames + Shadow DOM │
   └─────────┬─────────┘                └──────────┬───────────┘
             │                                     │
             └──────────────┬──────────────────────┘
                            ▼
                  ┌────────────────────────┐
                  │  CONTEXT BUILDER       │
                  │                        │
                  │  - Filter to domain    │
                  │  - Rank top 3 similar  │
                  │    existing tests by   │
                  │    keyword overlap     │
                  │  - Render markdown     │
                  │    prompt sections     │
                  └─────────┬──────────────┘
                            │
                            ▼
                  ┌────────────────────────┐         ┌──────────────────┐
                  │  PROMPT ASSEMBLY       │ ◄──────│  SYSTEM PROMPT   │
                  │                        │         │  (YAML, v0.2.0)  │
                  │  system + context +    │         │  - Hard rules    │
                  │  user request          │         │  - Wrong/right   │
                  └─────────┬──────────────┘         │    examples      │
                            │                        └──────────────────┘
                            ▼
                  ┌────────────────────────┐
                  │  OLLAMA HARNESS        │
                  │  (qwen3-coder:30b)     │
                  └─────────┬──────────────┘
                            ▼
                  ┌────────────────────────┐
                  │  STATIC VALIDATOR      │ ──── retry with errors
                  │  (regex rules)         │      fed back into the
                  │                        │      next prompt (max 3)
                  └─────────┬──────────────┘
                            ▼
                  ┌────────────────────────┐
                  │  WRITE FILE            │
                  │  to --out path         │
                  └─────────┬──────────────┘
                            ▼
                  ┌────────────────────────┐
                  │  COMPILE VALIDATOR     │
                  │  (tsc --noEmit)        │
                  └─────────┬──────────────┘
                            ▼
                  ┌────────────────────────┐
                  │  DRY-COMPILE VALIDATOR │
                  │  (playwright           │
                  │   test --list)         │
                  └─────────┬──────────────┘
                            ▼
                  ┌────────────────────────┐
                  │  GENERATED TEST        │
                  │  *.spec.ts             │
                  │  ready to run          │
                  └────────────────────────┘
```

## The five-layer context strategy

The model gets five sources of context before it writes a test. Each closes
a specific class of "fabricated value" failure:

| Layer | What | Closes |
|---|---|---|
| 1. System prompt | Framework conventions, hard rules, wrong/right examples | "How should the test be shaped?" |
| 2. Catalogue surface | POM classes, fixtures, utility signatures | "What methods can I call?" |
| 3. Catalogue values | Enum-like types, named-constant keys (`VARIANTS`, `PROMO_CODES`) | "What values are valid?" — fixes the `'jackets'` / `'Black'` fabrication |
| 4. Live DOM | Multi-signal element inventory + aria snapshot | "What testids/roles/labels actually exist?" |
| 5. Few-shot examples | Top 3 similar existing tests by keyword overlap | "What style does this team use?" — picks up `test.step`, factories, tag conventions |

The system prompt is the rulebook. The catalogue is the API. The DOM is
ground truth. Existing tests are the style guide. The model composes; it
doesn't invent.

## Project structure

```
qa-ai-prototype/
├── README.md                          ← you are here
├── FLOW.md                            ← stage-by-stage walkthrough
├── package.json
├── tsconfig.json
├── vitest.config.ts
│
├── src/
│   ├── cli.ts                         ← entrypoint; orchestrates all stages
│   ├── types.ts                       ← shared types
│   ├── crawler.ts                     ← live-app crawler (Playwright)
│   │
│   ├── catalogue/
│   │   └── extractor.ts               ← ts-morph passes
│   │
│   ├── context/
│   │   └── builder.ts                 ← filter, rank, render to prompt
│   │
│   ├── prompts/
│   │   ├── test-generation.yaml       ← versioned system prompt
│   │   └── loader.ts                  ← assembles system + context + request
│   │
│   ├── harness/
│   │   └── loop.ts                    ← Ollama call + static-validation retry loop
│   │
│   └── validators/
│       ├── static.ts                  ← Layer 1: regex rules
│       ├── compile.ts                 ← Layer 4: tsc --noEmit
│       └── dry-compile.ts             ← Layer 5: playwright test --list
│
├── tests/
│   ├── extractor.test.ts
│   └── validator.test.ts
│
└── examples/
    ├── checkout/                      ← minimal smoke-test sample
    └── looksy/                        ← full sample framework targeting Looksy ★
        ├── pages/                     ← 7 lazy proxy POMs
        ├── fixtures/                  ← base + authenticated
        ├── utils/                     ← selector helpers, composite flows
        ├── test-data/                 ← factories + VARIANTS + PROMO_CODES
        ├── types/                     ← shared domain types (literal unions)
        ├── config/playwright.config.ts
        └── tests/                     ← reference tests showing conventions
```

## Per-file roles

Quick reference for what each source file does and when you'd touch it.

| File | Role | When you'd edit |
|---|---|---|
| `src/cli.ts` | Argument parsing and stage orchestration: catalogue → crawl → generate → write → validate. Prints progress. | Adding a new flag; reordering the pipeline. |
| `src/types.ts` | Single source of truth for shared interfaces: `Catalogue`, `GenRequest`, `CrawlResult`, `InteractableElement`, `ValidationResult`. | Adding a new context layer or a new validator output. |
| `src/crawler.ts` | Live-app discovery and DOM extraction. Sitemap → BFS route discovery, multi-signal element walker (testid + role + label + placeholder + alt + title + text), traverses iframes + open shadow DOM. Returns `CrawlResult`. | Tweaking what counts as "interactable"; adding new selector signals. |
| `src/catalogue/extractor.ts` | ts-morph-driven extraction of framework structure. Six passes: POMs, fixtures, utilities, enum-like type aliases, named-constant catalogues, existing tests. Returns `Catalogue`. | Different framework conventions (POM file pattern, fixture shape). |
| `src/context/builder.ts` | Picks the slice of catalogue + crawl relevant to the request and renders it as Markdown for the prompt. Includes domain inference and similar-test ranking by keyword overlap. | Re-shaping prompt sections; tuning relevance heuristics. |
| `src/prompts/test-generation.yaml` | The system prompt. Versioned, source-controlled. Contains hard rules (selector priority, no hard waits, fixture import, factories, `test.step`), wrong/right examples, output format. | Change framework conventions or strengthen a rule. |
| `src/prompts/loader.ts` | Reads the YAML, assembles the final two-message prompt (system + user) by combining the system prompt, the rendered context, and the user's `--request` text. | Rarely. |
| `src/harness/loop.ts` | The retry harness. Calls Ollama, runs the static validator, feeds errors back into the prompt on failure, max 3 attempts. Surfaces `ModelNotFoundError` with a friendly install hint. | Adding a new layer to the inline retry loop. |
| `src/validators/static.ts` | Regex-based rule checks: `no-raw-locator`, `no-hard-waits`, `fixture-import`, `missing-tags`, `missing-describe`. Returns `ValidationResult` with errors that get fed back into retries. | Adding a new convention rule. |
| `src/validators/compile.ts` | Layer 4: spawns `tsc --noEmit` against the framework's tsconfig with the generated file in scope. Catches type errors, missing imports. | Rarely. |
| `src/validators/dry-compile.ts` | Layer 5: spawns `playwright test <file> --list` to load and parse the test inside Playwright's runner without executing it. Catches fixture name typos, top-level errors. | Rarely. |
| `tests/extractor.test.ts` | Smoke test for `extractCatalogue` against the bundled examples. | When you change the extractor's output shape. |
| `tests/validator.test.ts` | Unit tests for every static validator rule. | Whenever you change a rule. |

## Prerequisites

You need three things on your machine. Skip any you've already got.

**Node.js 20 or newer.** Check with `node --version`. Install via
`nvm install 20` or from nodejs.org.

**Ollama** to run the model locally — no API keys, no paid services.

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows: download the installer from https://ollama.com/download
```

Verify it's running:

```bash
curl http://localhost:11434/api/tags
```

That should return JSON. If "connection refused," start it manually with
`ollama serve` in a spare terminal.

**The Qwen3-Coder model.** The prototype defaults to `qwen3-coder:30b` —
Alibaba's leading open-source coder, with 256K context and a Mixture-of-Experts
architecture (30B total parameters, 3.3B active per token).

> **RAM check.** The model file is **19 GB** on disk. To run smoothly you'll
> want **32 GB of system RAM minimum**, ideally **48 GB+** if you plan to use
> the full 256K context window. On 16 GB it loads but every generation is
> slow (60-90s) and the rest of your machine is unusable. If you don't have
> 32 GB+, fall back to `qwen2.5-coder:7b` and pass `--model qwen2.5-coder:7b`
> on every gen call.

```bash
ollama pull qwen3-coder:30b
ollama list                                       # should show qwen3-coder:30b
ollama run qwen3-coder:30b "Print one Playwright assertion."   # /bye to exit
```

## Install

```bash
unzip qa-ai-prototype.zip
cd qa-ai-prototype
npm install
```

Quick smoke test:

```bash
npm test    # 8 passing
```

### Optional: install the example framework's own deps

The bundled `examples/looksy/` is a self-contained Playwright framework.
Install its deps so:

1. Your editor gets IntelliSense for files inside the example
2. The compile + dry-compile validators have a tsconfig + Playwright runner
   to point at after generation

```bash
cd examples/looksy
npm install
npx playwright install chromium      # one-off, ~150 MB
cd ../..
```

If you skip this, the AI generator still works — it just can't run the
post-generation validators (compile + dry-compile). The static validator
runs regardless.

## Quick start

Two terminals.

**Terminal 1 — start Looksy** (the test target):

```bash
cd /path/to/looksy-shop
npm install
npm run dev    # http://localhost:5173
```

**Terminal 2 — generate a test:**

```bash
cd /path/to/qa-ai-prototype
npm run gen -- \
  --repo ./examples/looksy \
  --app-url http://localhost:5173 \
  --request "guest user completes checkout with card payment" \
  --out ./examples/looksy/tests/generated.spec.ts \
  --verbose
```

What you should see, in order:

1. **Catalogue extraction** — "found 7 POMs, 3 fixtures, 6 utils, 5 enums,
   2 named consts, 7 existing tests"
2. **Crawl** — "discovered N routes via sitemap/bfs, found M unique testids"
3. **Generation** — model streams; first run is slowest (model load)
4. **Static validation** — passes or triggers retry with errors
5. **File written** to `--out`
6. **Compile validator** — runs `tsc --noEmit`
7. **Dry-compile validator** — runs `playwright test --list`

Three flags worth knowing:

- `--routes "/, /shop/knitwear, /checkout"` — explicit route list (skips
  auto-discovery)
- `--max-routes 12` — cap discovered routes (default 20)
- `--max-depth 2` — BFS depth limit (default 2)
- `--no-crawl` — skip the crawl entirely
- `--no-validate` — skip post-generation compile + dry-compile

## Writing a request

Three levels of detail, in increasing specificity:

### Minimal — let the model figure out the journey

```bash
--request "test the on-sale filter on the catalog page"
```

Useful for exploratory generation. Fewer constraints, more variability.

### Medium — specify the journey, not every assertion

```bash
--request "a guest user filters the catalog to on-sale only, picks the Selvedge Straight Jean in storm, adds size L to cart, and proceeds to checkout"
```

The sweet spot for 80% of generations.

### High-detail — explicit numbered steps

```bash
--request "
Test: Mobile club product checkout
Steps:
1. Register a new user account
2. Search for a Club product by name
3. Add an available size to the bag
4. Proceed to checkout
5. Enter London delivery address
6. Pay with credit card
Expected: order confirmation page shows 'Visa' as billing provider
"
```

### Generate Tests from notepads

```bash
npm run gen -- \
  --repo ./examples/looksy \
  --catalogue ./catalogue.json \
  --model qwen3-coder:30b \
  --no-crawl \
  --request ./two-tests.txt \
  --out ./examples/looksy/tests/generated/ \
  --verbose \
```

### Generate Catelogue

```bash
npm run gen -- --repo ./examples/looksy --save-catalogue ./catalogue.json --request dummy --print
```

This shape mirrors an Xray test definition. Most determinism, least model
freedom.

## Reading the validator results

After a run, three things to check in the generated test:

**Convention adherence (static validator).** No raw `page.locator(...)`,
no `waitForTimeout`, no `import { test } from '@playwright/test'`, all
test names tagged. Static catches these and triggers retries — by the time
the file is written these should all be resolved.

**Type correctness (compile validator).** `tsc --noEmit` against the
framework's tsconfig. Catches imports that don't resolve, methods called
with wrong argument types. Currently runs as a warning; set
`--max-attempts 5` if you want more retries.

**Test registration (dry-compile validator).** `playwright test --list`
loads the file inside Playwright's runner. Catches fixture name typos,
missing exports, top-level errors. Strongest signal that the test will
at least *try* to run.

**Actual execution.** Not run by the prototype. Once a test passes
dry-compile:

```bash
cd examples/looksy
npm test -- generated.spec.ts
```

That tells you whether the test passes against the live app — slow
(30+ seconds per run) and adds setup; best as a manual final step.

## Swap to your real framework when ready

When `core-automation-playwright-ts` access is available:

```bash
# Was (placeholder):
npm run gen -- --repo ./examples/looksy --app-url http://localhost:5173 ...

# Becomes:
npm run gen -- --repo /path/to/core-automation-playwright-ts \
               --app-url https://www-uk-staging.newlookstaging.com ...
```

If your real framework has different conventions:

- **Different fixture import path?** Update `src/prompts/test-generation.yaml`
- **Different tag scheme?** Same file
- **Different POM file location?** The catalogue extractor's globs are
  configurable in `src/catalogue/extractor.ts` (`pomGlob`, `fixtureGlob`, etc.)
- **Stricter selector rules?** Update `src/validators/static.ts`

For the first run on the real repo, save the catalogue:

```bash
npm run gen -- \
  --repo /path/to/core-automation-playwright-ts \
  --request "test add to cart" \
  --save-catalogue ./real-catalogue.json \
  --verbose
```

Then `cat real-catalogue.json | jq '.poms | length'` to see how many POMs
were picked up. If extraction misses things, the file location or shape
likely differs from the bundled example.

After the first extraction, reuse it across runs:

```bash
npm run gen -- \
  --repo /path/to/core-automation-playwright-ts \
  --catalogue ./real-catalogue.json \
  --request "..."
```

## Architecture mapping

The architecture maps directly to the rule enforcement stack designed
earlier:

| Layer | Code location | Status |
|---|---|---|
| 1. System prompt rules | `src/prompts/test-generation.yaml` | ✓ here, expanded with `test.step` and factory rules |
| 2. Curated context | `src/catalogue/` + `src/context/` | ✓ here, with enum/named-const/few-shot extraction |
| 3. Live DOM grounding | `src/crawler.ts` | ✓ here, multi-signal + iframe + shadow |
| 4. Static validation | `src/validators/static.ts` | ✓ here, raw-locator rule tightened |
| 5. Compile validation | `src/validators/compile.ts` | ✓ here, post-generation gate |
| 6. Dry-compile validation | `src/validators/dry-compile.ts` | ✓ here, post-generation gate |
| 7. Runtime execution | (manual `npx playwright test`) | Phase 1c: opt-in flag |
| 8. Multi-agent (Healer/Writer/...) | — | Phase 2 |

## Tests

```bash
npm test
```

Eight tests total: 7 validator rules + 1 catalogue extractor smoke. Run
before changing the prompt or rules to make sure you don't regress.

## Next concrete steps

1. **Run the generator end-to-end against Looksy.** Start the dev server,
   run `gen` with `--out` pointing at `examples/looksy/tests/`. Note:
   catalogue counts, crawl testid count, first-shot vs post-retry results.
2. **Generate 10-20 tests across domains.** Score them on (a) static passed
   first-shot, (b) compile passed, (c) dry-compile passed. That's your
   baseline scorecard for Nipam.
3. **When `core-automation-playwright-ts` access is available, swap
   `--repo`.** Tune globs and prompt rules to match real conventions.
4. **Bring the scorecard to Nipam.** Numbers from step 2 are the data point.
   Architecture diagram (top of this README) is the path forward.
