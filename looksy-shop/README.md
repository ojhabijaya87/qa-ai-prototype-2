# Looksy

A modernist e-commerce shop built as a **test target** for the QA AI platform. Every piece of the UI is instrumented with `data-testid` attributes following a `testid > role > label > placeholder` selector priority. The app is deliberately rich in conditional UI, multi-step flows, validation, and edge cases so generated tests have something real to bite on.

Stack: React 18, Vite, TypeScript, Zustand (with persistence), React Router. Apache 2.0 / MIT throughout. No backend — state lives in the browser.

---

## Run it locally

```bash
# 1. Install
npm install

# 2. Start the dev server (http://localhost:5173)
npm run dev

# 3. (Optional) Run the example Playwright suite
npm run test:install   # one-off — pulls the chromium binary
npm run test           # headless
npm run test:ui        # Playwright UI mode
```

Production build:

```bash
npm run build
npm run preview
```

Requires Node 20+.

---

## Why this app, specifically

The point isn't to ship a real store — it's to give the test-generation pipeline (`qa-ai-prototype`) a target where naive selectors break, where state matters, and where the same surface area needs to be tested from several angles. Concretely, the app exercises:

**Conditional UI states** — sold-out tags, low-stock warnings, sale badges, club-member discounts, logged-in vs guest, on-sale vs full-price, and out-of-stock size pills that strike through but stay visible.

**Multi-step flows with validation** — three-step checkout (contact → shipping → payment), each step gating progression on its own validation. Email format, UK postcode regex, card number length, expiry format. Forward navigation is blocked until validation passes; backward navigation preserves entered state.

**Stock-aware operations** — cart adds are clamped to available stock and surface different toast variants (`out-of-stock`, `exceeds-stock` with capped quantity, plain `success`). Quantity steppers in the drawer disable the increment when stock is hit.

**Promo codes with conditional logic** — `WELCOME10` (10% off, no conditions), `FREESHIP` (free shipping, requires £50+), `ATELIER25` (£25 off, requires £150+), `CLUB15` (15% off, members only). Each rejection reason produces a different inline error message.

**Filter combinations and sort** — six categories, eight color swatches, seven sizes, a price range slider, in-stock toggle, on-sale toggle, and five sort options. All combinations recompute results live with an `active-filter-count` badge.

**Persistence** — cart, user profile, and order history all use `zustand/persist`. Reloads keep state; signing out clears the user only.

**Modal and toast surfaces** — slide-out cart drawer with a backdrop click-to-close, accordion sections on the PDP, toast tray that auto-dismisses after 4 seconds.

---

## Project layout

```
src/
├── App.tsx                        # router + global surfaces (cart drawer, toasts)
├── main.tsx                       # entry
├── components/
│   ├── Header.tsx + .css          # sticky header, primary nav, cart badge
│   ├── Footer.tsx + .css
│   ├── ToastTray.tsx + .css       # auto-dismissing notifications
│   ├── CartDrawer.tsx + .css      # slide-out cart with qty controls
│   ├── ProductCard.tsx + .css     # grid card with tags & color dots
│   └── ProductImage.tsx + .css    # deterministic gradient placeholders
├── pages/
│   ├── HomePage.tsx               # hero, new arrivals, bestsellers, editorial
│   ├── CatalogPage.tsx            # filters + sort + grid
│   ├── ProductPage.tsx            # gallery, variant select, add-to-cart, related
│   ├── CheckoutPage.tsx           # 3-step stepper, promo, summary
│   ├── OrderConfirmationPage.tsx  # placed order detail
│   └── AccountPage.tsx            # sign-in form, club toggle, history
├── store/
│   ├── cart.ts                    # persisted, stock-aware add/update
│   ├── user.ts                    # persisted profile & club flag
│   ├── promo.ts                   # promo state + toast tray
│   ├── orders.ts                  # persisted order history
│   └── ui.ts                      # cart drawer open/close (not persisted)
├── data/products.ts               # 16 products, 4 promos, shipping/payment methods
├── types/index.ts
└── utils/index.ts                 # money fmt, totals, validators

tests/example.spec.ts              # reference Playwright tests
playwright.config.ts
```

---

## Test scenarios this app supports

A non-exhaustive list of scenarios you can ask the generator to produce. Each one has clean, deterministic data behind it.

**Stock edge cases**
- A user tries to add the `north-leather-boot` (every variant out of stock) — expect a soft block, no add.
- Adding 5 of `marlow-trench` `bone S` (only 1 in stock) — expect the cart to be capped at 1 and an "exceeds-stock" toast to appear.
- The `verity-shawl-cardigan` `oxblood` color has zero stock in every size — every size pill should be struck through and disabled.

**Promo code logic**
- `CLUB15` applied as a guest — expect an inline "Club members only" error.
- `CLUB15` applied after toggling Looksy Club on the account page — expect 15% off in totals.
- `ATELIER25` applied with a £50 cart — expect a min-spend error.
- `ATELIER25` applied with a £160+ cart — expect £25 deducted.
- Trying to apply a second code after one is already applied — expect "already applied" error.

**Multi-step checkout**
- Submitting the contact step with an empty email — error appears, step does not advance.
- Submitting the shipping step missing the postcode or with `123` as postcode — UK postcode validator fires.
- Selecting Klarna as payment — card form disappears, redirect note shows.
- Going backward from payment to shipping — entered values are preserved.

**Filter combinations**
- Filter by `outerwear` + `Ink` color + on-sale only — expect the `Ashford Overcoat` (which is on sale and has Ink stock).
- Set the price slider below £20 — most outerwear should disappear.
- Toggle every color swatch then clear — the active filter count returns to zero and the full grid returns.

**Persistence**
- Add three items, reload the page, the cart drawer still shows them.
- Place an order, reload, navigate to `/account` — the order is in history.

---

## Selector priority (matches the framework convention)

Every interactive element has a `data-testid`. Where it makes sense to layer hints, items also expose `data-product-id`, `data-stock`, and `data-toast-id` so generated tests can build resilient locators without falling back to CSS or XPath.

```tsx
// good
page.getByTestId('product-add-to-cart')
page.getByRole('button', { name: 'Add to bag' })

// avoid
page.locator('.product-add-to-cart')
page.locator('//button[contains(@class, "add")]')
```

---

## Notes for the generator

A few things to keep in mind when pointing the prototype at this app:

- All routes are static — no fetching, no auth round-trip, no flake from the network. If a test is flaky, it's a real flake.
- Stock data is in `src/data/products.ts`. If a test needs a deterministic "low stock" scenario, the seed values in that file are stable. The fully-out-of-stock product is `p-016 north-leather-boot`.
- Toasts auto-dismiss in 4s. Tests that assert on toast content should read it before the dismissal rather than racing it.
- The cart drawer is rendered at the App level and toggled via the `useUi` store. It's not lazy-mounted, so it's safe to assert on `cart-drawer` immediately after a click.

---

## Licence

MIT, for the demo. Use it however helps.
