import {
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";

const SCRYPT_N = 131_072;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_MAXMEM = 256 * 1024 * 1024;
const MAX_PASSWORD_BYTES = 1_024;

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        maxmem: SCRYPT_MAXMEM,
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

function validPasswordSize(password: string): boolean {
  const bytes = Buffer.byteLength(password, "utf8");
  return bytes > 0 && bytes <= MAX_PASSWORD_BYTES;
}

export function validateNewPassword(password: string): void {
  if (password.length < 8) {
    throw new TypeError("관리자 비밀번호는 8자 이상이어야 합니다.");
  }
  if (!validPasswordSize(password)) {
    throw new TypeError("관리자 비밀번호가 너무 깁니다.");
  }
}

export async function hashPassword(password: string): Promise<string> {
  if (!validPasswordSize(password)) {
    throw new TypeError("비밀번호가 비어 있거나 너무 깁니다.");
  }

  const salt = randomBytes(16);
  const hash = await scrypt(password, salt);
  return [
    "scrypt",
    `N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}`,
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  if (!validPasswordSize(password)) return false;

  const parts = encoded.split("$");
  if (
    parts.length !== 4 ||
    parts[0] !== "scrypt" ||
    parts[1] !== `N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}`
  ) {
    return false;
  }

  try {
    const salt = Buffer.from(parts[2], "base64url");
    const expected = Buffer.from(parts[3], "base64url");
    if (salt.length !== 16 || expected.length !== SCRYPT_KEY_LENGTH) return false;

    const actual = await scrypt(password, salt);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
