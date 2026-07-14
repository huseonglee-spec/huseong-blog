import { loadEnvFile, stdin, stdout } from "node:process";
import { StringDecoder } from "node:string_decoder";

import { neon } from "@neondatabase/serverless";

import {
  hashPassword,
  validateNewPassword,
} from "../src/lib/server/password";

try {
  loadEnvFile(".env.local");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");
if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== "function") {
  throw new Error("이 명령은 대화형 터미널에서 실행해야 합니다.");
}

function readHidden(label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let value = "";
    const wasRaw = stdin.isRaw;
    const decoder = new StringDecoder("utf8");

    const finish = (error?: Error) => {
      stdin.off("data", onData);
      stdin.setRawMode(Boolean(wasRaw));
      stdin.pause();
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };

    const onData = (chunk: Buffer) => {
      for (const character of decoder.write(chunk)) {
        if (character === "\u0003") {
          finish(new Error("비밀번호 설정을 취소했습니다."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = Array.from(value).slice(0, -1).join("");
        } else if (character >= " ") {
          value += character;
        }
      }
    };

    stdout.write(label);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

const password = await readHidden("새 관리자 비밀번호: ");
validateNewPassword(password);
const confirmation = await readHidden("비밀번호 확인: ");
if (password !== confirmation) throw new Error("입력한 비밀번호가 서로 다릅니다.");

stdout.write("비밀번호 해시 생성 중…\n");
const passwordHash = await hashPassword(password);
const sql = neon(databaseUrl);

await sql.transaction((transaction) => [
  transaction`
    INSERT INTO admin_credentials (
      singleton, password_hash, credential_version, updated_at
    ) VALUES (
      true, ${passwordHash}, 1, now()
    )
    ON CONFLICT (singleton) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      credential_version = admin_credentials.credential_version + 1,
      updated_at = now()
  `,
  transaction`DELETE FROM admin_sessions`,
]);

console.log("관리자 비밀번호를 설정했고 기존 세션을 모두 만료시켰습니다.");
