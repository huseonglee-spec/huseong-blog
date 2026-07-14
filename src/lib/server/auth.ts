import { randomBytes } from "node:crypto";

import {
  hashToken,
  loginRetryAfter,
  SESSION_MAX_AGE_SECONDS,
  tokensMatch,
} from "./auth-core";
import { database } from "./db";
import { hashPassword, verifyPassword } from "./password";

export interface AdminSession {
  csrfToken: string;
  expiresAt: Date;
}

interface CredentialRow {
  password_hash: string;
  credential_version: number;
}

interface SessionRow {
  csrf_token: string;
  expires_at: string | Date;
}

interface LimitRow {
  attempt_count: number;
}

export type LoginResult =
  | { status: "ok"; token: string }
  | { status: "invalid" }
  | { status: "limited"; retryAfter: number };

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function consumeLoginAttempt(clientAddress: string): Promise<number | null> {
  const sql = database();
  const ipBucket = `ip:${hashToken(clientAddress)}`;
  const ipRows = await sql`
    WITH cleanup AS (
      DELETE FROM admin_login_limits
       WHERE updated_at < now() - interval '1 day'
         AND bucket <> ${ipBucket}
         AND bucket <> 'global'
    )
    INSERT INTO admin_login_limits (bucket, window_started_at, attempt_count, updated_at)
    VALUES (${ipBucket}, now(), 1, now())
    ON CONFLICT (bucket) DO UPDATE SET
      window_started_at = CASE
        WHEN admin_login_limits.window_started_at <= now() - interval '15 minutes'
          THEN now()
        ELSE admin_login_limits.window_started_at
      END,
      attempt_count = CASE
        WHEN admin_login_limits.window_started_at <= now() - interval '15 minutes'
          THEN 1
        ELSE admin_login_limits.attempt_count + 1
      END,
      updated_at = now()
    RETURNING attempt_count
  `;
  const ipAttemptCount = Number((ipRows as LimitRow[])[0]?.attempt_count ?? 0);
  const ipRetryAfter = loginRetryAfter(ipAttemptCount, 0);
  if (ipRetryAfter !== null) return ipRetryAfter;

  const globalRows = await sql`
    INSERT INTO admin_login_limits (bucket, window_started_at, attempt_count, updated_at)
    VALUES ('global', now(), 1, now())
    ON CONFLICT (bucket) DO UPDATE SET
      window_started_at = CASE
        WHEN admin_login_limits.window_started_at <= now() - interval '1 minute'
          THEN now()
        ELSE admin_login_limits.window_started_at
      END,
      attempt_count = CASE
        WHEN admin_login_limits.window_started_at <= now() - interval '1 minute'
          THEN 1
        ELSE admin_login_limits.attempt_count + 1
      END,
      updated_at = now()
    RETURNING attempt_count
  `;
  const globalAttemptCount = Number((globalRows as LimitRow[])[0]?.attempt_count ?? 0);
  return loginRetryAfter(ipAttemptCount, globalAttemptCount);
}

async function clearIpLimit(clientAddress: string): Promise<void> {
  const sql = database();
  const ipBucket = `ip:${hashToken(clientAddress)}`;
  await sql`DELETE FROM admin_login_limits WHERE bucket = ${ipBucket}`;
}

export async function loginWithPassword(
  password: string,
  clientAddress: string,
  previousToken?: string,
): Promise<LoginResult> {
  const retryAfter = await consumeLoginAttempt(clientAddress);
  if (retryAfter !== null) {
    return { status: "limited", retryAfter };
  }

  const sql = database();
  const credentialRows = await sql`
    SELECT password_hash, credential_version
      FROM admin_credentials
     WHERE singleton = true
  `;
  const credential = (credentialRows as CredentialRow[])[0];

  let passwordMatches = false;
  if (credential) {
    passwordMatches = await verifyPassword(password, credential.password_hash);
  } else {
    // 설정 여부를 로그인 응답 시간으로 구별하기 어렵게 실제 scrypt 작업을 수행한다.
    await hashPassword(password || "invalid administrator password");
  }

  if (!credential || !passwordMatches) return { status: "invalid" };

  const token = randomToken();
  const csrfToken = randomToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1_000);

  if (previousToken) {
    await sql`DELETE FROM admin_sessions WHERE token_hash = ${hashToken(previousToken)}`;
  }

  const inserted = await sql`
    WITH cleanup AS (
      DELETE FROM admin_sessions WHERE expires_at <= now()
    )
    INSERT INTO admin_sessions (
      token_hash, credential_version, csrf_token, expires_at
    )
    SELECT
      ${tokenHash}, credential_version, ${csrfToken}, ${expiresAt.toISOString()}
      FROM admin_credentials
     WHERE singleton = true
       AND credential_version = ${credential.credential_version}
    RETURNING token_hash
  `;
  if ((inserted as Record<string, unknown>[]).length === 0) {
    return { status: "invalid" };
  }

  await clearIpLimit(clientAddress);
  return { status: "ok", token };
}

export async function getAdminSession(token: string): Promise<AdminSession | null> {
  if (!token || token.length > 256) return null;
  const sql = database();
  const rows = await sql`
    WITH cleanup AS (
      DELETE FROM admin_sessions WHERE expires_at <= now()
    )
    SELECT session.csrf_token, session.expires_at
      FROM admin_sessions AS session
      JOIN admin_credentials AS credential
        ON credential.singleton = true
       AND credential.credential_version = session.credential_version
     WHERE session.token_hash = ${hashToken(token)}
       AND session.expires_at > now()
  `;
  const row = (rows as SessionRow[])[0];
  if (!row) return null;
  return {
    csrfToken: row.csrf_token,
    expiresAt: new Date(row.expires_at),
  };
}

export async function deleteAdminSession(token: string): Promise<void> {
  if (!token || token.length > 256) return;
  const sql = database();
  await sql`DELETE FROM admin_sessions WHERE token_hash = ${hashToken(token)}`;
}

export function validCsrfToken(session: AdminSession, submitted: unknown): boolean {
  return typeof submitted === "string" && tokensMatch(session.csrfToken, submitted);
}
