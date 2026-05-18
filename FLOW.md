# End-to-end flow

A walk-through of what happens between `npm run gen` and a written test file.
Read this if you want to understand *why* the prototype works, not just
*how* to invoke it. For the high-level diagram see the README's
"Architecture at a glance".

## Stage 1 — Catalogue extraction (~500ms typical)

**Input:** `--repo /path/to/framework`
**Output:** an in-memory `Catalogue` JSON object

The extractor walks the framework with **ts-morph** and runs six passes:

| Pass | Looks at | Extracts |
|---|---|---|
| POMs | `**/pages/**/*.page.ts` | Class name, public locators (getters returning `Locator`), public methods with full signatures |
| Fixtures | `**/fixtures/**/*.fixture.ts` | Exported `test.extend` calls + names of injected POMs/fixtures |
| Utilities | `**/utils/**/*.ts` | Exported function signatures |
| **Enum-like types** | `**/{types,test-data}/**/*.ts` | `export type X = "a" \| "b"` — the union members |
| **Named constants** | same as above | `export const VARIANTS = { K1: ..., K2: ... }` — the keys |
| **Existing tests** | `**/tests/**/*.spec.ts` | Test names, tags, body excerpt (capped at 30 lines) |

The last three passes are what makes generation accurate. Without them
the model sees `category: ProductCategory` as just a type name and
fabricates `'jackets'`. With them it sees the actual valid values.

**Why ts-morph and not `tsc` directly?** ts-morph gives a higher-level
API for walking the AST. Slower than raw tsc but extraction only happens
once per `gen` call, and the extra ergonomics matter for maintainability.

## Stage 2 — Live-app crawl (~3-15 seconds, optional)

**Input:** `--app-url http://localhost:5173`
**Output:** a `CrawlResult` with multi-signal element inventories per route

The crawler runs in three phases:

### 2a. Route discovery

Three strategies, tried in order:

1. **Explicit:** `--routes "/, /shop/knitwear, /checkout"` — skip discovery
   entirely. Best when you know exactly what you want crawled.
2. **Sitemap:** fetch `<origin>/sitemap.xml`, parse `<loc>` tags, filter to
   same-origin only. Most production sites publish one. Free 80% coverage,
   one HTTP request.
3. **BFS:** if no sitemap, breadth-first link-crawl from the homepage. Visits
   every same-origin `<a href>` up to `--max-depth` (default 2) and
   `--max-routes` (default 20). Skips non-HTML resources (`.pdf`, `.jpg`, etc.).

The discovery strategy used is logged in `--verbose` mode.

### 2b. Multi-signal element extraction

For each route, the crawler walks the DOM and captures every interactable
element with **all available identifying signals**:

| Signal | Source | Priority |
|---|---|---|
| `testId` | `data-testid` attribute | Highest — always preferred |
| `role` + `accessibleName` | `role`, `aria-label`, `aria-labelledby` | High — semantic |
| `label` | `<label for="x">` or wrapped `<label>` | Medium — forms |
| `placeholder` | `<input placeholder="...">` | Medium — forms |
| `altText` | `<img alt="...">` | Low — images |
| `title` | `title` attribute | Low — tooltips |
| `text` | visible text content (capped 60 chars) | Last resort |
| `tag` | HTML element name (lowercased) | Pure fallback |

Why all of them? Because the model picks the strongest available per element
when generating a selector. If a button has a testid, it uses that. If it
doesn't, it falls back to role + accessible name. If neither, it goes to
text. The framework selector priority (`testid > role > label > placeholder`)
becomes a *generation rule* applied in the prompt, not a brittle hardcoded
preference.

**Interactability heuristic.** An element qualifies for the inventory if:
- It's an `<input>`, `<button>`, `<a>`, `<select>`, `<textarea>`, `<details>`, or `<summary>`, OR
- It has a `role` attribute with an interactive value (`button`, `link`,
  `checkbox`, `menuitem`, `option`, `radio`, `switch`, `textbox`,
  `combobox`, `searchbox`, `tab`, `slider`, `spinbutton`), OR
- It has a `data-testid` attribute (the team likely added it because tests
  need it).

We deliberately don't check `el.onclick !== null` — that only catches inline
`onclick=""` attributes, never the `addEventListener`-based handlers used
by every modern framework. It's a false signal.

### 2c. Frames + shadow DOM

Playwright's locator API pierces shadow boundaries for *interaction* but
not for *enumeration*. To get a complete inventory we walk explicitly:

- **Iframes:** `page.frames()` returns every frame. Each non-main frame is
  walked separately and its elements are tagged with `inIframe: <frame URL>`.
  Cross-origin frames throw on access; we catch and skip — that's the right
  behaviour. The model sees that there's an iframe and knows it can't reach
  inside.
- **Shadow DOM:** the recursive walker checks `el.shadowRoot` at every node.
  If present (open shadow), it recurses in. If absent (closed shadow), there's
  nothing it can do — closed shadow roots are designed to be inaccessible.
  Elements found inside shadow roots are tagged with `inShadowRoot: true`.

### 2d. Aria snapshot

In addition to the element inventory, each route gets a Playwright aria
snapshot via `locator('body').ariaSnapshot()`. This emits a YAML-ish
representation of the page's semantic role tree, capped at 80 lines. Useful
when a POM method isn't quite enough and the model needs to understand the
overall page structure.

### 2e. Deduplication

Pages often render the same element repeatedly (e.g. a product-card button
in a 12-item grid). The crawler dedupes by signal-fingerprint so the inventory
sent to the model contains each *kind* of element once, not each instance.
Saves ~30% of crawl-related prompt tokens.

## Stage 3 — Context builder (~10ms)

**Input:** `Catalogue` + `GenRequest` (which holds the request text and crawl)
**Output:** `BuiltContext` with the slice relevant to the request

Three things happen:

1. **Domain inference.** Tokenise the request, count which domain words
   appear, pick the highest-scoring one. Filters POMs/fixtures/utils to
   that domain plus `common`.
2. **Similar-test ranking.** Take the request tokens, score every existing
   test by keyword overlap with its name + tags + a domain bonus. Pick top 3.
3. **Cap sizes.** Max 5 POMs, 3 fixtures, 8 utils. Enums and named constants
   always included in full.

`renderContextForPrompt(ctx)` then turns this into a markdown string with
sections for each piece. The crawl is rendered as a per-route table of
elements, format:

```
| Signal (Best Available) | Role | Text/Name | Context |
| :--- | :--- | :--- | :--- |
| testid="checkout-email-input" | textbox | Email | main |
| placeholder="Email" | textbox | - | main |
| role="button" | button | Continue to shipping | main |
```

The model picks the best available signal per row when writing selectors.

## Stage 4 — Prompt assembly (~1ms)

Two-message structure:

- **System message:** loaded from `src/prompts/test-generation.yaml`.
  Versioned, source-controlled. Contains hard rules, conventions,
  wrong/right examples.
- **User message:** the rendered context from Stage 3, followed by the
  user's `--request` text.

This split matters because Ollama caches the system prompt across calls
in some configurations — keeping framework rules out of the user message
means they don't have to be re-tokenised every retry.

## Stage 5 — Ollama call (~20-90s, depends on model + hardware)

The harness sends the assembled prompt to Ollama and waits for the complete
response. Streaming isn't used in Phase 0 — full output before validating,
and the latency saving doesn't matter when the next step is validation.

**Cold-start vs warm:** the first call after Ollama boots takes 60-90s
because the model has to load into memory. Subsequent calls are 5-10x
faster. If you're scoring generations, throw away the first run.

If Ollama returns "model not found," the harness throws a friendly
`ModelNotFoundError` with the right `ollama pull` command.

## Stage 6 — Static validation (~5ms)

**Input:** the raw model output as a string
**Output:** `{ ok, errors }`

Five regex-based rules:

| Rule | Severity | Catches |
|---|---|---|
| `no-raw-locator` | error | `page.locator('.foo')`, `locator('article')`, `'#x'`, XPath |
| `no-hard-waits` | error | `page.waitForTimeout(...)` |
| `fixture-import` | error | `import { test } from '@playwright/test'` |
| `missing-tags` | warn | test name lacks `@web` |
| `missing-describe` | warn | no `test.describe(...)` block |

Hard errors fail validation; the harness retries with the error list
appended to the user prompt. Warnings are surfaced but don't fail.

## Stage 7 — Retry loop (up to 3 attempts)

If static validation fails, the harness assembles a new prompt:

```
[original prompt]

---

Your previous attempt failed validation:
ERROR [no-raw-locator] (line 12): Forbidden raw selector "article" — use getByTestId/getByRole/getByLabel instead

Fix the issues and produce the corrected file.
```

This goes back to Ollama. Repeats up to `--max-attempts` times (default 3).

The retry-with-errors-fed-back pattern is critical — it's what makes a
small model succeed on conventions a fine-tuned model would otherwise
need 100K examples to learn.

## Stage 8 — Write file (~5ms)

The accepted output is written to `--out` (or printed to stdout if `--print`).
Complete Playwright `.spec.ts`, ready to run.

## Stage 9 — Compile validation (~3-10s)

**Input:** the file path + framework root
**Output:** `ValidationResult` with errors trimmed to mentions of the file

Spawns `npx tsc --noEmit --project <framework>/tsconfig.json` as a child
process. The framework's tsconfig is what gives the validator the right
import paths and types.

If `tsc` finds errors:
- Filter to lines mentioning the generated file's name
- Take the first 20
- Return them as the error message

This isn't fed back into the inline retry loop — the harness has already
written the file. It's a post-generation gate. Phase 1 plan: feed compile
errors back into retries, currently held back to keep the prototype's
loop simple.

## Stage 10 — Dry-compile validation (~2-5s)

**Input:** the file path + framework's playwright.config.ts
**Output:** `ValidationResult`

Spawns `npx playwright test <file> --list`. The `--list` flag tells
Playwright to load the file and register the tests *without running them*.
Catches:

- Import paths that resolve at compile time but fail at runtime (e.g.
  `.ts` extension issues with ESM)
- Fixture name typos (the test fails to register)
- Top-level errors in the spec file
- Wrong number of arguments to `test()` etc.

Cheapest way to get end-to-end "this test would at least try to execute"
confirmation. Full execution is opt-out by default — otherwise every
retry would launch chromium.

## Total time budget

Realistic numbers for a single `gen` call against Looksy:

| Stage | Time |
|---|---|
| Catalogue extraction | 0.5s |
| Live-app crawl (sitemap, ~10 routes) | 8-15s |
| Live-app crawl (BFS, depth 2) | 15-30s |
| Context build | <0.1s |
| Prompt assembly | <0.1s |
| Ollama call (first call) | 60-90s |
| Ollama call (warm) | 10-30s |
| Static validation | <0.1s |
| Retry (if triggered) | adds 1× Ollama call |
| Compile validation | 3-10s |
| Dry-compile validation | 2-5s |

**Cold start: 80-130 seconds. Warm: 30-60 seconds.** Most of the budget
is in the model call. Everything else is fast enough not to matter.

## What this is not yet

- **Production agent.** No multi-step planning, no self-healing, no
  cross-test reasoning. One request → one test → one shot (with retries).
- **Bifrost-mediated.** The harness talks to Ollama directly. Production
  goes through Bifrost as the gateway.
- **Fine-tuned.** Deliberately not. Context engineering does the work.
- **Vector-augmented.** Phase 1b adds pgvector for cross-team test
  retrieval. Not needed at this scale.

Phase 1 unlocks the gateway and Continue.dev integration. Phase 2 adds
the Healer/Writer/Explorer/Analyser/Orchestrator topology. This is
Phase 0 — the harness loop, validated end-to-end, ready to replace
each piece behind the same interface.
