#!/usr/bin/env python3
"""Read a private translation prompt from stdin and invoke Hermes in-process."""

from __future__ import annotations

import argparse
import contextlib
import io
import re
import sys

MAX_PROMPT_BYTES = 3 * 1024 * 1024
PROFILE_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
SESSION_ID_PATTERN = re.compile(r"^session_id:\s*([A-Za-z0-9_-]{1,128})$")


class SessionStderr(io.TextIOBase):
    """Discard Hermes stderr while retaining only bounded session-id lines."""

    def __init__(self) -> None:
        self.pending = ""
        self.session_ids: list[str] = []

    def write(self, text: str) -> int:
        self.pending = (self.pending + text)[-4096:]
        while "\n" in self.pending:
            line, self.pending = self.pending.split("\n", 1)
            self._record(line)
        return len(text)

    def flush(self) -> None:
        if self.pending:
            self._record(self.pending)
            self.pending = ""

    def _record(self, line: str) -> None:
        match = SESSION_ID_PATTERN.fullmatch(line.strip())
        if match and match.group(1) not in self.session_ids:
            self.session_ids.append(match.group(1))


def parse_bridge_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--profile", required=True)
    parser.add_argument("--provider", required=True, choices=("openai-codex",))
    parser.add_argument("--model", required=True)
    args = parser.parse_args()
    if not PROFILE_PATTERN.fullmatch(args.profile):
        parser.error("invalid profile")
    return args


def read_prompt() -> str:
    prompt_bytes = sys.stdin.buffer.read(MAX_PROMPT_BYTES + 1)
    if len(prompt_bytes) > MAX_PROMPT_BYTES:
        raise SystemExit("prompt exceeds bridge limit")
    if not prompt_bytes:
        raise SystemExit("prompt is empty")
    try:
        return prompt_bytes.decode("utf-8")
    except UnicodeDecodeError as error:
        raise SystemExit("prompt is not valid UTF-8") from error


def main() -> None:
    args = parse_bridge_args()
    prompt = read_prompt()
    sys.argv = [
        "hermes",
        "--profile",
        args.profile,
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
        "--provider",
        args.provider,
        "-m",
        args.model,
        "-q",
        prompt,
    ]
    from hermes_cli.main import main as hermes_main  # pyright: ignore[reportMissingImports]

    stderr = SessionStderr()
    try:
        with contextlib.redirect_stderr(stderr):
            hermes_main()
    finally:
        stderr.flush()
        for session_id in stderr.session_ids:
            print(f"session_id:{session_id}")


if __name__ == "__main__":
    main()
