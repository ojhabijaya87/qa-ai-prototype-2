import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractCatalogue } from "../src/catalogue/extractor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const examplesRoot = path.join(__dirname, "..", "examples", "checkout");

describe("extractCatalogue", () => {
  it("finds POMs, fixtures, and utils in the example repo", async () => {
    const cat = await extractCatalogue({ rootPath: examplesRoot });

    expect(cat.poms.length).toBeGreaterThanOrEqual(2);
    const cartPage = cat.poms.find((p) => p.className === "CartPage");
    expect(cartPage).toBeDefined();
    expect(cartPage?.publicLocators.map((l) => l.name)).toContain("checkoutButton");
    expect(cartPage?.domain).toBe("checkout");

    const fixtures = cat.fixtures.find((f) => f.name === "test");
    expect(fixtures).toBeDefined();
    expect(fixtures?.injects).toEqual(expect.arrayContaining(["cartPage", "checkoutPage"]));

    const loginUtil = cat.utils.find((u) => u.name === "loginAsGuest");
    expect(loginUtil).toBeDefined();
  });
});
