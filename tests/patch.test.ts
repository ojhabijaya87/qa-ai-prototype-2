import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  parsePatchPayload,
  validatePatch,
  applyPatch,
  rollbackPatches,
} from "../src/validators/patch.js";

describe("patch validator", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = path.join(tmpdir(), `patch-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(path.join(tmpRoot, "pages"), { recursive: true });
    writeFileSync(
      path.join(tmpRoot, "pages", "order.page.ts"),
      [
        `import { Page, Locator } from "@playwright/test";`,
        ``,
        `export class OrderConfirmationPage {`,
        `  constructor(private page: Page) {}`,
        ``,
        `  get heading(): Locator {`,
        `    return this.page.getByTestId("order-confirmation-heading");`,
        `  }`,
        `}`,
        ``,
      ].join("\n")
    );
  });

  afterEach(() => {
    if (existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe("parsePatchPayload", () => {
    it("parses a valid JSON payload", () => {
      const result = parsePatchPayload(
        "pages/order.page.ts",
        '{"className":"OrderConfirmationPage","member":"get x(): Locator { return this.page.getByTestId(\\"x\\"); }","rationale":"needed"}'
      );
      expect(result.error).toBeUndefined();
      expect(result.patch?.className).toBe("OrderConfirmationPage");
    });

    it("rejects non-JSON payloads", () => {
      const result = parsePatchPayload("pages/order.page.ts", "not json at all");
      expect(result.patch).toBeUndefined();
      expect(result.error).toMatch(/not valid JSON/i);
    });

    it("rejects payloads missing required fields", () => {
      const result = parsePatchPayload("pages/order.page.ts", '{"className":"X"}');
      expect(result.patch).toBeUndefined();
      expect(result.error).toMatch(/member/);
    });
  });

  describe("validatePatch", () => {
    it("accepts a valid Locator getter on an existing class", () => {
      const r = validatePatch(
        {
          filePath: "pages/order.page.ts",
          className: "OrderConfirmationPage",
          rationale: "test asserts on payment-method element",
          member: 'get paymentMethod(): Locator { return this.page.getByTestId("order-confirmation-payment-method"); }',
        },
        tmpRoot
      );
      expect(r.ok).toBe(true);
    });

    it("rejects when the class does not exist", () => {
      const r = validatePatch(
        {
          filePath: "pages/order.page.ts",
          className: "NoSuchClass",
          rationale: "x",
          member: "get x(): Locator { return this.page.getByTestId('x'); }",
        },
        tmpRoot
      );
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/class.*not found/i);
    });

    it("rejects when the file does not exist", () => {
      const r = validatePatch(
        {
          filePath: "pages/missing.page.ts",
          className: "X",
          rationale: "x",
          member: "get x(): Locator { return this.page.getByTestId('x'); }",
        },
        tmpRoot
      );
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/does not exist/i);
    });

    it("rejects path traversal outside the repo root", () => {
      const r = validatePatch(
        {
          filePath: "../etc/passwd",
          className: "X",
          rationale: "x",
          member: "get x(): Locator { return this.page.getByTestId('x'); }",
        },
        tmpRoot
      );
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/outside the repo root/i);
    });

    it("rejects a member containing expect()", () => {
      const r = validatePatch(
        {
          filePath: "pages/order.page.ts",
          className: "OrderConfirmationPage",
          rationale: "x",
          member: 'async expectVisa(): Promise<void> { await expect(this.heading).toBeVisible(); }',
        },
        tmpRoot
      );
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/expect/i);
    });

    it("rejects a member that conflicts with an existing one", () => {
      const r = validatePatch(
        {
          filePath: "pages/order.page.ts",
          className: "OrderConfirmationPage",
          rationale: "x",
          member: 'get heading(): Locator { return this.page.getByTestId("different"); }',
        },
        tmpRoot
      );
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/already has a member named/i);
    });

    it("rejects a member with too many statements", () => {
      const longMember = `async doManyThings(): Promise<void> {
        await this.page.click('a');
        await this.page.click('b');
        await this.page.click('c');
        await this.page.click('d');
        await this.page.click('e');
        await this.page.click('f');
      }`;
      const r = validatePatch(
        {
          filePath: "pages/order.page.ts",
          className: "OrderConfirmationPage",
          rationale: "x",
          member: longMember,
        },
        tmpRoot
      );
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/statements/);
    });

    it("rejects malformed TypeScript", () => {
      const r = validatePatch(
        {
          filePath: "pages/order.page.ts",
          className: "OrderConfirmationPage",
          rationale: "x",
          member: "this is not valid ts at all <<<",
        },
        tmpRoot
      );
      expect(r.ok).toBe(false);
    });
  });

  describe("applyPatch + rollbackPatches", () => {
    it("appends the member and rollback restores the original", () => {
      const original = readFileSync(path.join(tmpRoot, "pages", "order.page.ts"), "utf8");

      const patched = applyPatch(
        {
          filePath: "pages/order.page.ts",
          className: "OrderConfirmationPage",
          rationale: "x",
          member: 'get paymentMethod(): Locator { return this.page.getByTestId("payment"); }',
        },
        tmpRoot
      );

      const after = readFileSync(path.join(tmpRoot, "pages", "order.page.ts"), "utf8");
      expect(after).toContain("paymentMethod");
      expect(after).not.toBe(original);

      rollbackPatches([patched]);
      const restored = readFileSync(path.join(tmpRoot, "pages", "order.page.ts"), "utf8");
      expect(restored).toBe(original);
    });
  });
});
