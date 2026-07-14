import { describe, expect, it } from "vitest";

import {
  hashPassword,
  validateNewPassword,
  verifyPassword,
} from "./password";

describe("administrator password hashing", () => {
  it("accepts eight characters and rejects shorter passwords", () => {
    expect(() => validateNewPassword("12345678")).not.toThrow();
    expect(() => validateNewPassword("1234567")).toThrow(/8자/);
  });

  it("hashes and verifies a password without storing the plaintext", async () => {
    const encoded = await hashPassword("correct horse battery staple");

    expect(encoded).toMatch(/^scrypt\$N=131072,r=8,p=1\$/);
    expect(encoded).not.toContain("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", encoded)).resolves.toBe(true);
    await expect(verifyPassword("wrong password entirely", encoded)).resolves.toBe(false);
  });

  it("uses a fresh salt for every password hash", async () => {
    const first = await hashPassword("correct horse battery staple");
    const second = await hashPassword("correct horse battery staple");

    expect(first).not.toBe(second);
  });

  it("rejects malformed or unsafe stored parameters", async () => {
    await expect(verifyPassword("anything", "not-a-password-hash")).resolves.toBe(false);
    await expect(
      verifyPassword(
        "anything",
        "scrypt$N=1073741824,r=8,p=1$c2FsdA$aGFzaA",
      ),
    ).resolves.toBe(false);
  });
});
