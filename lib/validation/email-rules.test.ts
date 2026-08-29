import { describe, expect, it } from "vitest";

import { normalizeEmail, validateEmail } from "@/lib/validation/email-rules";

describe("normalizeEmail", () => {
  it("trims and lowercases the address", () => {
    expect(normalizeEmail("  User@Example.com  ")).toBe("user@example.com");
  });
});

describe("validateEmail", () => {
  it("returns no errors for a valid address", () => {
    expect(validateEmail("user@example.com")).toEqual([]);
  });

  it("returns no errors for an address needing normalization", () => {
    expect(validateEmail("  User@Example.com  ")).toEqual([]);
  });

  it("rejects an empty address", () => {
    expect(validateEmail("")).toEqual(["メールアドレスを入力してください。"]);
  });

  it("rejects a whitespace-only address", () => {
    expect(validateEmail("   ")).toEqual(["メールアドレスを入力してください。"]);
  });

  it("rejects a malformed address", () => {
    expect(validateEmail("not-an-email")).toEqual([
      "メールアドレスの形式が正しくありません。",
    ]);
  });
});
