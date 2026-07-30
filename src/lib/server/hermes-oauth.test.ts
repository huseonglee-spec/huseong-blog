import { describe, expect, it } from "vitest";

import {
  generateWithHermesOAuth,
  hermesOAuthChatArgs,
  parseHermesOAuthOutput,
  sanitizedHermesEnvironment,
  type HermesOAuthExec,
} from "./hermes-oauth";

const invocation = {
  bin: "/usr/local/bin/hermes",
  profile: "linux-coder",
  model: "gpt-5.6-sol",
  timeoutMs: 240_000,
};

describe("Hermes OAuth 제한 실행", () => {
  it("프로젝트 규칙·memory·파일/네트워크 도구 없이 지정 profile/model을 실행한다", () => {
    const args = hermesOAuthChatArgs("linux-coder", "gpt-5.6-sol", "prompt");
    expect(args).toEqual(expect.arrayContaining([
      "--profile",
      "linux-coder",
      "--ignore-rules",
      "-t",
      "todo",
      "--source",
      "tool",
      "--pass-session-id",
      "-m",
      "gpt-5.6-sol",
    ]));
    expect(args).not.toContain("web");
    expect(args).not.toContain("browser");
    expect(args).not.toContain("terminal");
    expect(args).not.toContain("file");
  });

  it("OpenAI API key를 child 환경에서 제거하고 결과 session을 성공 뒤 정리한다", async () => {
    const calls: Array<{ args: readonly string[]; env: Record<string, string> }> = [];
    const run: HermesOAuthExec = async (_bin, args, options) => {
      calls.push({ args, env: options.env });
      return calls.length === 1
        ? { stdout: 'session_id:test-session\n{"ok":true}\n' }
        : { stdout: "deleted" };
    };

    await expect(generateWithHermesOAuth(
      "prompt",
      invocation,
      { HOME: "/home/huseong", OPENAI_API_KEY: "must-not-pass", SAFE: "yes" },
      run,
    )).resolves.toBe('{"ok":true}');
    expect(calls).toHaveLength(2);
    expect(calls[0]?.env).toEqual({ HOME: "/home/huseong", SAFE: "yes" });
    expect(calls[1]?.args).toEqual([
      "--profile",
      "linux-coder",
      "sessions",
      "delete",
      "test-session",
    ]);
  });

  it("timeout에서도 stdout credential을 노출하지 않고 session을 정리한다", async () => {
    const calls: readonly string[][] = [];
    const mutableCalls = calls as string[][];
    const run: HermesOAuthExec = async (_bin, args) => {
      mutableCalls.push([...args]);
      if (mutableCalls.length === 1) {
        throw {
          killed: true,
          stdout: "session_id:timed-out-session\npartial-private-output",
          stderr: "Authorization: secret",
        };
      }
      return { stdout: "deleted" };
    };

    await expect(generateWithHermesOAuth("prompt", invocation, {}, run))
      .rejects.toMatchObject({
        reason: "model_timeout",
        message: "model_timeout",
      });
    expect(mutableCalls[1]).toEqual([
      "--profile",
      "linux-coder",
      "sessions",
      "delete",
      "timed-out-session",
    ]);
  });

  it("strict programmatic output에서 session metadata만 분리한다", () => {
    expect(parseHermesOAuthOutput("session_id:abc\n{\"title\":\"ok\"}\n")).toEqual({
      sessionId: "abc",
      content: '{"title":"ok"}',
    });
    expect(() => parseHermesOAuthOutput("session_id:abc\n")).toThrow("empty");
    expect(sanitizedHermesEnvironment({ openai_api_key: "x", HOME: "/tmp" }))
      .toEqual({ HOME: "/tmp" });
  });
});
