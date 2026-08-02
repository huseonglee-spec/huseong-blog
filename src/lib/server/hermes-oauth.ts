import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

export const HERMES_OAUTH_MAX_PROMPT_BYTES = 3 * 1024 * 1024;

export interface HermesOAuthExecOptions {
  timeout: number;
  maxBuffer: number;
  env: Record<string, string>;
  stdin?: string;
}

export type HermesOAuthExec = (
  bin: string,
  args: readonly string[],
  options: HermesOAuthExecOptions,
) => Promise<{ stdout: unknown }>;

const defaultExec: HermesOAuthExec = (bin, args, options) => new Promise((resolve, reject) => {
  const input = options.stdin === undefined ? undefined : Buffer.from(options.stdin, "utf8");
  if (input && input.byteLength > HERMES_OAUTH_MAX_PROMPT_BYTES) {
    reject(Object.assign(new Error("stdin exceeds bridge limit"), { code: "E2BIG" }));
    return;
  }

  const child = spawn(bin, [...args], {
    env: options.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdout: Buffer[] = [];
  let stdoutBytes = 0;
  let timedOut = false;
  let overflowed = false;
  let settled = false;
  let forceKillTimer: NodeJS.Timeout | undefined;

  const collectedStdout = () => Buffer.concat(stdout).toString("utf8");
  const terminate = () => {
    child.kill("SIGTERM");
    forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 1_000);
    forceKillTimer.unref();
  };
  const timeout = setTimeout(() => {
    timedOut = true;
    terminate();
  }, options.timeout);
  timeout.unref();

  child.stdout.on("data", (chunk: Buffer) => {
    if (overflowed) return;
    const remaining = options.maxBuffer - stdoutBytes;
    if (remaining > 0) {
      const kept = chunk.subarray(0, remaining);
      stdout.push(kept);
      stdoutBytes += kept.byteLength;
    }
    if (chunk.byteLength > remaining) {
      overflowed = true;
      terminate();
    }
  });
  child.stderr.resume();
  child.on("error", (error: NodeJS.ErrnoException) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    if (forceKillTimer) clearTimeout(forceKillTimer);
    reject(Object.assign(new Error("Hermes child could not start"), {
      code: error.code,
      stdout: collectedStdout(),
    }));
  });
  child.on("close", (code) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    if (forceKillTimer) clearTimeout(forceKillTimer);
    if (timedOut) {
      reject(Object.assign(new Error("Hermes child timed out"), {
        code: "ETIMEDOUT",
        killed: true,
        stdout: collectedStdout(),
      }));
    } else if (overflowed) {
      reject(Object.assign(new Error("Hermes child output exceeded limit"), {
        code: "ENOBUFS",
        stdout: collectedStdout(),
      }));
    } else if (code !== 0) {
      reject(Object.assign(new Error("Hermes child failed"), {
        code,
        stdout: collectedStdout(),
      }));
    } else {
      resolve({ stdout: collectedStdout() });
    }
  });
  child.stdin.on("error", () => {
    // Process exit carries the bounded, redacted failure state.
  });
  child.stdin.end(input);
});

export interface HermesOAuthInvocation {
  bridgePythonBin: string;
  bridgeScriptPath: string;
  hermesBin: string;
  profile: string;
  provider: "openai-codex";
  model: string;
  timeoutMs: number;
}

export class HermesOAuthInvocationError extends Error {
  readonly reason: "model_timeout" | "model_unavailable";

  constructor(reason: "model_timeout" | "model_unavailable") {
    super(reason);
    this.name = "HermesOAuthInvocationError";
    this.reason = reason;
  }
}

const HERMES_OAUTH_ENVIRONMENT_ALLOWLIST = new Set([
  "HOME",
  "PATH",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "TMPDIR",
  "PYTHONPATH",
  "PYTHONUTF8",
  "PYTHONIOENCODING",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "REQUESTS_CA_BUNDLE",
  "CURL_CA_BUNDLE",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
  "XDG_DATA_HOME",
  "XDG_STATE_HOME",
]);

export function sanitizedHermesEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(environment)
      .filter(([key, value]) => HERMES_OAUTH_ENVIRONMENT_ALLOWLIST.has(key) && value !== undefined)
      .map(([key, value]) => [key, value!]),
  );
}

export function hermesOAuthBridgeArgs(
  invocation: HermesOAuthInvocation,
  source: string,
): string[] {
  return [
    invocation.bridgeScriptPath,
    "--profile",
    invocation.profile,
    "--provider",
    invocation.provider,
    "--model",
    invocation.model,
    "--source",
    source,
  ];
}

export function hermesSessionId(stdout: string): string | undefined {
  const line = stdout.split(/\r?\n/u)
    .find((candidate) => candidate.startsWith("session_id:"));
  return line?.slice("session_id:".length).trim() || undefined;
}

function hermesSessionIds(stdout: string): string[] {
  return [...new Set(stdout.split(/\r?\n/u)
    .filter((line) => line.startsWith("session_id:"))
    .map((line) => line.slice("session_id:".length).trim())
    .filter((sessionId) => /^[A-Za-z0-9_-]{1,128}$/u.test(sessionId)))];
}

export function parseHermesOAuthOutput(stdout: string): {
  sessionId?: string;
  content: string;
} {
  const content = stdout
    .split(/\r?\n/u)
    .filter((line) => !line.startsWith("session_id:"))
    .join("\n")
    .trim();
  if (!content) throw new TypeError("hermes_empty_output");
  const sessionId = hermesSessionId(stdout);
  return { ...(sessionId ? { sessionId } : {}), content };
}

function invocationFailure(error: unknown): HermesOAuthInvocationError {
  const timeout = typeof error === "object" && error !== null &&
    (("killed" in error && error.killed === true) ||
      ("code" in error && error.code === "ETIMEDOUT"));
  return new HermesOAuthInvocationError(timeout ? "model_timeout" : "model_unavailable");
}

async function listHermesSourceSessions(
  invocation: HermesOAuthInvocation,
  source: string,
  environment: Record<string, string>,
  run: HermesOAuthExec,
): Promise<string[]> {
  const result = await run(
    invocation.bridgePythonBin,
    [
      invocation.bridgeScriptPath,
      "--profile",
      invocation.profile,
      "--source",
      source,
      "--list-source-sessions",
    ],
    {
      timeout: 30_000,
      maxBuffer: 256 * 1024,
      env: environment,
    },
  );
  return hermesSessionIds(String(result.stdout));
}

async function deleteHermesSourceSessions(
  invocation: HermesOAuthInvocation,
  source: string,
  environment: Record<string, string>,
  run: HermesOAuthExec,
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const sessionIds = await listHermesSourceSessions(invocation, source, environment, run);
      if (sessionIds.length === 0) return;
      for (const sessionId of sessionIds) {
        await run(
          invocation.hermesBin,
          ["--profile", invocation.profile, "sessions", "delete", "--yes", sessionId],
          {
            timeout: 30_000,
            maxBuffer: 256 * 1024,
            env: environment,
          },
        );
      }
      const remaining = await listHermesSourceSessions(invocation, source, environment, run);
      if (remaining.length === 0) return;
    } catch {
      // Retry the same unique source without logging draft-bearing process output.
    }
  }
  throw new HermesOAuthInvocationError("model_unavailable");
}

export async function generateWithHermesOAuth(
  prompt: string,
  invocation: HermesOAuthInvocation,
  processEnvironment: Readonly<Record<string, string | undefined>> = process.env,
  run: HermesOAuthExec = defaultExec,
): Promise<string> {
  if (!prompt || Buffer.byteLength(prompt, "utf8") > HERMES_OAUTH_MAX_PROMPT_BYTES) {
    throw new HermesOAuthInvocationError("model_unavailable");
  }
  const environment = sanitizedHermesEnvironment(processEnvironment);
  const source = `huseong-blog-oauth-${randomUUID()}`;
  try {
    let stdout: string;
    try {
      const result = await run(
        invocation.bridgePythonBin,
        hermesOAuthBridgeArgs(invocation, source),
        {
          timeout: invocation.timeoutMs,
          maxBuffer: 4 * 1024 * 1024,
          env: environment,
          stdin: prompt,
        },
      );
      stdout = String(result.stdout);
    } catch (error) {
      throw invocationFailure(error);
    }
    const parsed = parseHermesOAuthOutput(stdout);
    return parsed.content;
  } finally {
    await deleteHermesSourceSessions(invocation, source, environment, run);
  }
}
