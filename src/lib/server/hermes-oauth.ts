import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface HermesOAuthExecOptions {
  timeout: number;
  maxBuffer: number;
  env: Record<string, string>;
}

export type HermesOAuthExec = (
  bin: string,
  args: readonly string[],
  options: HermesOAuthExecOptions,
) => Promise<{ stdout: unknown }>;

const defaultExec: HermesOAuthExec = async (bin, args, options) => {
  const result = await execFileAsync(bin, [...args], options);
  return { stdout: result.stdout };
};

export interface HermesOAuthInvocation {
  bin: string;
  profile: string;
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

export function sanitizedHermesEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(environment)
      .filter(([key, value]) => key.toUpperCase() !== "OPENAI_API_KEY" && value !== undefined)
      .map(([key, value]) => [key, value!]),
  );
}

export function hermesOAuthChatArgs(
  profile: string,
  model: string,
  prompt: string,
): string[] {
  return [
    "--profile",
    profile,
    "chat",
    "-Q",
    "--ignore-rules",
    "-t",
    "todo",
    "--source",
    "tool",
    "--max-turns",
    "2",
    "--pass-session-id",
    "-m",
    model,
    "-q",
    prompt,
  ];
}

export function hermesSessionId(stdout: string): string | undefined {
  const line = stdout.split(/\r?\n/u)
    .find((candidate) => candidate.startsWith("session_id:"));
  return line?.slice("session_id:".length).trim() || undefined;
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

function errorStdout(error: unknown): string {
  return typeof error === "object" && error !== null && "stdout" in error
    ? String(error.stdout ?? "")
    : "";
}

function invocationFailure(error: unknown): HermesOAuthInvocationError {
  const timeout = typeof error === "object" && error !== null &&
    (("killed" in error && error.killed === true) ||
      ("code" in error && error.code === "ETIMEDOUT"));
  return new HermesOAuthInvocationError(timeout ? "model_timeout" : "model_unavailable");
}

async function deleteHermesSession(
  invocation: HermesOAuthInvocation,
  sessionId: string | undefined,
  environment: Record<string, string>,
  run: HermesOAuthExec,
): Promise<void> {
  if (!sessionId) return;
  try {
    await run(
      invocation.bin,
      ["--profile", invocation.profile, "sessions", "delete", sessionId],
      {
        timeout: 30_000,
        maxBuffer: 256 * 1024,
        env: environment,
      },
    );
  } catch {
    // Tool-tagged sessions remain hidden if bounded cleanup is temporarily unavailable.
  }
}

export async function generateWithHermesOAuth(
  prompt: string,
  invocation: HermesOAuthInvocation,
  processEnvironment: Readonly<Record<string, string | undefined>> = process.env,
  run: HermesOAuthExec = defaultExec,
): Promise<string> {
  const environment = sanitizedHermesEnvironment(processEnvironment);
  let sessionId: string | undefined;
  try {
    let stdout: string;
    try {
      const result = await run(
        invocation.bin,
        hermesOAuthChatArgs(invocation.profile, invocation.model, prompt),
        {
          timeout: invocation.timeoutMs,
          maxBuffer: 4 * 1024 * 1024,
          env: environment,
        },
      );
      stdout = String(result.stdout);
    } catch (error) {
      sessionId = hermesSessionId(errorStdout(error));
      throw invocationFailure(error);
    }
    const parsed = parseHermesOAuthOutput(stdout);
    sessionId = parsed.sessionId;
    return parsed.content;
  } finally {
    await deleteHermesSession(invocation, sessionId, environment, run);
  }
}
