import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  generateWithHermesOAuth,
  hermesOAuthBridgeArgs,
  parseHermesOAuthOutput,
  sanitizedHermesEnvironment,
  type HermesOAuthExec,
} from "./hermes-oauth";

const invocation = {
  bridgePythonBin: "/opt/hermes/venv/bin/python3",
  bridgeScriptPath: "/app/scripts/hermes-oauth-stdin-bridge.py",
  hermesBin: "/usr/local/bin/hermes",
  profile: "linux-coder",
  provider: "openai-codex" as const,
  model: "gpt-5.6-sol",
  timeoutMs: 240_000,
};
const bridgeUrl = new URL("../../../scripts/hermes-oauth-stdin-bridge.py", import.meta.url);

describe("Hermes OAuth 제한 실행", () => {
  it("private prompt 없이 고정 stdin bridge와 OAuth provider/profile/model만 argv로 전달한다", () => {
    const args = hermesOAuthBridgeArgs(invocation, "huseong-blog-oauth-test");
    expect(args).toEqual([
      "/app/scripts/hermes-oauth-stdin-bridge.py",
      "--profile",
      "linux-coder",
      "--provider",
      "openai-codex",
      "--model",
      "gpt-5.6-sol",
      "--source",
      "huseong-blog-oauth-test",
    ]);
    expect(args).not.toContain("-q");
    expect(args).not.toContain("prompt");
  });

  it("OAuth child에는 최소 allowlist 환경만 전달하고 source session을 모두 정리한다", async () => {
    const calls: Array<{
      bin: string;
      args: readonly string[];
      env: Record<string, string>;
      stdin?: string;
    }> = [];
    let deleted = false;
    const run: HermesOAuthExec = async (_bin, args, options) => {
      calls.push({ bin: _bin, args, env: options.env, stdin: options.stdin });
      if (args.includes("--list-source-sessions")) {
        return { stdout: deleted ? "" : "session_id:test-session" };
      }
      if (args.includes("delete")) {
        deleted = true;
        return { stdout: "deleted" };
      }
      return { stdout: 'session_id:test-session\n{"ok":true}\n' };
    };

    await expect(generateWithHermesOAuth(
      "prompt",
      invocation,
      {
        HOME: "/home/huseong",
        PATH: "/usr/bin",
        LANG: "ko_KR.UTF-8",
        OPENAI_API_KEY: "must-not-pass",
        DATABASE_URL: "must-not-pass",
        SAFE: "must-not-pass",
      },
      run,
    )).resolves.toBe('{"ok":true}');
    expect(calls).toHaveLength(4);
    expect(calls[0]?.bin).toBe(invocation.bridgePythonBin);
    expect(calls[0]?.env).toEqual({
      HOME: "/home/huseong",
      PATH: "/usr/bin",
      LANG: "ko_KR.UTF-8",
    });
    expect(calls[0]?.stdin).toBe("prompt");
    expect(calls[0]?.args).not.toContain("prompt");
    const source = calls[0]?.args[(calls[0]?.args.indexOf("--source") ?? -2) + 1];
    expect(source).toMatch(/^huseong-blog-oauth-[0-9a-f-]{36}$/u);
    expect(calls[1]?.args).toEqual([
      invocation.bridgeScriptPath,
      "--profile",
      "linux-coder",
      "--source",
      source,
      "--list-source-sessions",
    ]);
    expect(calls[2]?.args).toEqual([
      "--profile",
      "linux-coder",
      "sessions",
      "delete",
      "--yes",
      "test-session",
    ]);
  });

  it(">128 KiB private prompt를 argv·environment가 아닌 stdin으로 exact 전달한다", async () => {
    const prompt = `private-large-prompt:${"가".repeat(140_000)}`;
    const calls: Array<{
      args: readonly string[];
      env: Record<string, string>;
      stdin?: string;
    }> = [];
    const run: HermesOAuthExec = async (_bin, args, options) => {
      calls.push({ args, env: options.env, stdin: options.stdin });
      return { stdout: args.includes("--list-source-sessions") ? "" : '{"ok":true}' };
    };

    await expect(generateWithHermesOAuth(
      prompt,
      invocation,
      { PRIVATE_MARKER: "unrelated", OPENAI_API_KEY: "must-not-pass" },
      run,
    )).resolves.toBe('{"ok":true}');
    expect(Buffer.byteLength(prompt, "utf8")).toBeGreaterThan(128 * 1024);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.stdin).toBe(prompt);
    expect(calls[0]?.args.join("\u0000")).not.toContain("private-large-prompt");
    expect(Object.values(calls[0]?.env ?? {}).join("\u0000")).not.toContain(prompt);
    expect(calls[0]?.args).toEqual(expect.arrayContaining([
      "--provider",
      "openai-codex",
    ]));
  });

  it("tracked Python bridge가 큰 stdin을 official entrypoint의 in-memory argv로만 전달한다", async () => {
    const root = await mkdtemp(join(tmpdir(), "hermes-oauth-bridge-"));
    const packageDir = join(root, "hermes_cli");
    const prompt = `bridge-private:${"문장".repeat(70_000)}`;
    try {
      await mkdir(packageDir);
      await writeFile(join(packageDir, "__init__.py"), "", "utf8");
      await writeFile(join(packageDir, "main.py"), [
        "import hashlib",
        "import json",
        "import sys",
        "def main():",
        "    prompt = sys.argv[-1]",
        "    print(json.dumps({",
        "        'argv_without_prompt': sys.argv[1:-1],",
        "        'prompt_bytes': len(prompt.encode('utf-8')),",
        "        'prompt_sha256': hashlib.sha256(prompt.encode('utf-8')).hexdigest(),",
        "    }))",
        "    print('session_id:bridge-session', file=sys.stderr)",
      ].join("\n"), "utf8");
      const testInvocation = {
        ...invocation,
        bridgePythonBin: "python3",
        bridgeScriptPath: fileURLToPath(bridgeUrl),
        hermesBin: "/bin/true",
      };
      const osArgs = hermesOAuthBridgeArgs(testInvocation, "huseong-blog-oauth-test");
      const content = await generateWithHermesOAuth(prompt, testInvocation, {
        PATH: process.env.PATH,
        PYTHONPATH: root,
      });

      expect(Buffer.byteLength(prompt, "utf8")).toBeGreaterThan(128 * 1024);
      expect(osArgs.join("\u0000")).not.toContain("bridge-private");
      const output = JSON.parse(content) as {
        argv_without_prompt: string[];
        prompt_bytes: number;
        prompt_sha256: string;
      };
      expect(output.prompt_bytes).toBe(Buffer.byteLength(prompt, "utf8"));
      expect(output.prompt_sha256).toBe(createHash("sha256").update(prompt).digest("hex"));
      expect(output.argv_without_prompt).toEqual(expect.arrayContaining([
        "--ignore-rules",
        "--pass-session-id",
        "--provider",
        "openai-codex",
        "-m",
        "gpt-5.6-sol",
        "-q",
      ]));
      expect(output.argv_without_prompt).not.toContain("file");

      const rejected = spawnSync("python3", [
        fileURLToPath(bridgeUrl),
        "--profile",
        "linux-coder",
        "--provider",
        "openrouter",
        "--model",
        "gpt-5.6-sol",
      ], {
        input: "prompt",
        encoding: "utf8",
        env: { ...process.env, PYTHONPATH: root },
      });
      expect(rejected.status).not.toBe(0);
      expect(rejected.stdout).toBe("");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("bridge cleanup mode는 exact source의 active session ID만 읽는다", async () => {
    const root = await mkdtemp(join(tmpdir(), "hermes-oauth-cleanup-"));
    const profileDir = join(root, ".hermes", "profiles", "linux-coder");
    const databasePath = join(profileDir, "state.db");
    const source = "huseong-blog-oauth-00000000-0000-4000-8000-000000000001";
    try {
      await mkdir(profileDir, { recursive: true });
      const seeded = spawnSync("python3", [
        "-c",
        [
          "import sqlite3, sys",
          "db = sqlite3.connect(sys.argv[1])",
          "db.execute('create table sessions (id text primary key, source text not null)')",
          "db.executemany('insert into sessions (id, source) values (?, ?)', [('session-match', sys.argv[2]), ('session-other', 'other-source')])",
          "db.commit()",
        ].join("; "),
        databasePath,
        source,
      ], { encoding: "utf8" });
      expect(seeded.status).toBe(0);

      const listed = spawnSync("python3", [
        fileURLToPath(bridgeUrl),
        "--profile",
        "linux-coder",
        "--source",
        source,
        "--list-source-sessions",
      ], {
        encoding: "utf8",
        env: { ...process.env, HOME: root },
      });
      expect(listed.status).toBe(0);
      expect(listed.stdout.trim()).toBe("session_id:session-match");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("session id 없는 timeout도 invocation source로 정리한다", async () => {
    const calls: readonly string[][] = [];
    const mutableCalls = calls as string[][];
    let listed = false;
    const run: HermesOAuthExec = async (_bin, args) => {
      mutableCalls.push([...args]);
      if (args.includes("--list-source-sessions")) {
        if (listed) return { stdout: "" };
        listed = true;
        return { stdout: "session_id:timed-out-session" };
      }
      if (args.includes("delete")) return { stdout: "deleted" };
      if (mutableCalls.length === 1) {
        throw {
          killed: true,
          stdout: "partial-private-output",
          stderr: "Authorization: ***",
        };
      }
      return { stdout: "deleted" };
    };

    await expect(generateWithHermesOAuth("prompt", invocation, {}, run))
      .rejects.toMatchObject({
        reason: "model_timeout",
        message: "model_timeout",
      });
    expect(mutableCalls[1]).toContain("--list-source-sessions");
    expect(mutableCalls[2]).toEqual([
      "--profile",
      "linux-coder",
      "sessions",
      "delete",
      "--yes",
      "timed-out-session",
    ]);
  });

  it("empty output도 source를 정리하고 cleanup 실패는 성공으로 반환하지 않는다", async () => {
    const emptyCalls: string[][] = [];
    const emptyRun: HermesOAuthExec = async (_bin, args) => {
      emptyCalls.push([...args]);
      return { stdout: "" };
    };
    await expect(generateWithHermesOAuth("prompt", invocation, {}, emptyRun))
      .rejects.toThrow("empty");
    expect(emptyCalls[1]).toContain("--list-source-sessions");

    let attempts = 0;
    const cleanupFailure: HermesOAuthExec = async () => {
      attempts += 1;
      if (attempts === 1) return { stdout: '{"ok":true}' };
      throw new Error("cleanup unavailable");
    };
    await expect(generateWithHermesOAuth("prompt", invocation, {}, cleanupFailure))
      .rejects.toMatchObject({ reason: "model_unavailable" });
    expect(attempts).toBe(4);
  });

  it("strict programmatic output에서 session metadata만 분리한다", () => {
    expect(parseHermesOAuthOutput("session_id:abc\n{\"title\":\"ok\"}\n")).toEqual({
      sessionId: "abc",
      content: '{"title":"ok"}',
    });
    expect(() => parseHermesOAuthOutput("session_id:abc\n")).toThrow("empty");
    expect(sanitizedHermesEnvironment({
      openai_api_key: "x",
      DATABASE_URL: "private",
      HOME: "/tmp",
      PYTHONPATH: "/tmp/python",
      PRIVATE_MARKER: "private",
    })).toEqual({ HOME: "/tmp", PYTHONPATH: "/tmp/python" });
  });
});
