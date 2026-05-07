# Looksy test framework conventions

This document describes the conventions used by this Playwright framework.
Generated tests MUST follow these rules. The static validators in the AI
test generator enforce them as hard gates — violations fail generation
and trigger a retry with the error fed back to the model.

## Selector priority

1. **`data-testid`** — preferred for any interactive element. Stable, semantic, immune to copy changes.
2. **ARIA role** — when no testid is available and the element has a clear accessible role.
3. **Label / placeholder** — last resort, fragile to translation and copy changes.

### Forbidden

- ❌ CSS class selectors: `page.locator(".cart-icon")`
- ❌ XPath: `page.locator("//button[@class='add']")`
- ❌ Tag-based: `page.locator("button")` (without filter)

### Always use the POM

POM methods exist for every interaction. Don't reach past them with
raw `page.getByTestId()` calls — if a method doesn't exist, add it to
the POM, don't inline the locator into the test.

```ts
// ❌ wrong — reaches past the POM
await page.getByTestId("cart-icon").click();

// ✓ right — use the POM method
await cartDrawer.open();
```

## Wait strategy

Playwright's locators auto-wait. Hard waits are forbidden.

### Forbidden

- ❌ `await page.waitForTimeout(2000)`
- ❌ `await new Promise(r => setTimeout(r, 1000))`
- ❌ Any sleep, delay, or fixed-time wait

### Allowed

- ✓ `await expect(locator).toBeVisible()` — auto-waits until visible
- ✓ `await locator.waitFor()` — for explicit waits with timeout
- ✓ `await page.waitForURL(/pattern/)` — for navigation

## Fixture imports

Tests import `test` and `expect` from the framework fixture, NEVER from
`@playwright/test` directly. The fixture is what gives tests their POMs.

```ts
// ❌ wrong — bypasses the framework
import { test, expect } from "@playwright/test";

// ✓ right — uses the framework fixture
import { test, expect } from "../fixtures/looksy.fixture";
```

For tests that need a pre-authenticated user:

```ts
import { authenticatedTest } from "../fixtures/authenticated.fixture";  // signed-in user
import { clubMemberTest } from "../fixtures/authenticated.fixture";     // club member
```

## Test naming and tags

Every test name ends with three tags:

```
@web                       — channel (always @web for this framework)
@<domain>                  — one of: home, catalog, product, cart, checkout, account, promo
@priority-<level>          — one of: priority-high, priority-medium, priority-low
```

Tags are space-separated. Examples:

```ts
test("adds a club discount @web @promo @priority-high", ...);
test("filters by knitwear @web @catalog @priority-medium", ...);
test("home page hero loads @web @home @priority-low", ...);
```

The tags allow filtering at runtime: `npx playwright test --grep @priority-high`.

## Test data

Use the factories in `test-data/factories.ts`. Don't hardcode emails,
addresses, or card numbers in tests.

```ts
// ❌ wrong — hardcoded email, brittle if the format changes
await checkoutPage.fillContactAndContinue("test@example.com");

// ✓ right — uses the factory
await checkoutPage.fillContactAndContinue(buildTestUser().email);
```

Variants are pre-defined in `VARIANTS`:

```ts
import { VARIANTS } from "../test-data/factories";
await productPage.goto(VARIANTS.KNIT_BONE_M.productSlug);
```

This means if a product slug changes, the fix is in one place rather
than across every test.

## POM pattern: lazy proxy

Every POM exposes locators as **getters**, not properties. This means
locators resolve at access time, not construction time, and stale
locators can never live longer than a single await.

```ts
// ✓ right — getter
get addToCartButton(): Locator {
  return this.page.getByTestId("product-add-to-cart");
}

// ❌ wrong — eager assignment in constructor
constructor(page: Page) {
  this.addToCartButton = page.getByTestId("product-add-to-cart");
}
```

POM methods that span multiple steps return `Promise<void>` (or whatever
they extract). They never return locators — locators are accessed via
the getter.

## Composite flows

When a sequence is repeated in 3+ tests, promote it to `utils/flows.ts`.
Examples already there:

- `addVariantToCart()` — add a specific variant from PDP
- `startCheckoutWithVariant()` — add a variant and proceed to checkout

Generated tests should USE these flows where applicable rather than
inlining the steps. The catalogue extractor surfaces them as available
utilities.

## Assertions

Prefer expressive assertion methods on POMs:

```ts
// ✓ best — expressive
await checkoutPage.expectOnPaymentStep();

// ✓ ok — direct expect
await expect(page.getByTestId("checkout-step-payment")).toBeVisible();

// ❌ wrong — manual visibility checks with conditional logic
const isVisible = await page.getByTestId("checkout-step-payment").isVisible();
if (!isVisible) throw new Error("not on payment step");
```

POM-level assertions (`expectXyz` methods) encapsulate the "what does
correct look like" knowledge. Tests stay readable, and assertion details
are reusable.

## File locations

- POMs: `pages/<page-name>.page.ts`
- Fixtures: `fixtures/<fixture-name>.fixture.ts`
- Utilities: `utils/<concern>.ts`
- Test data: `test-data/<topic>.ts`
- Types: `types/index.ts`
- Tests: `tests/<feature>.spec.ts`

Generated tests should land in `tests/` with a name describing the
feature under test (e.g. `tests/promo-codes.spec.ts`).
