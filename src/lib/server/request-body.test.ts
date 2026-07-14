import { describe, expect, it } from "vitest";

import {
  RequestBodyTooLargeError,
  readBoundedFormData,
} from "./request-body";

describe("bounded form request parsing", () => {
  it("parses a request within the byte limit", async () => {
    const request = new Request("https://huseong.com/api/admin/login/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "password=small-value",
    });

    const form = await readBoundedFormData(request, 100);
    expect(form.get("password")).toBe("small-value");
  });

  it("rejects a streaming request without Content-Length once it exceeds the limit", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("password="));
        controller.enqueue(encoder.encode("x".repeat(200)));
        controller.close();
      },
    });
    const request = new Request("https://huseong.com/api/admin/login/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    await expect(readBoundedFormData(request, 100)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });

  it("rejects an oversized declared Content-Length without reading the body", async () => {
    const request = new Request("https://huseong.com/api/admin/login/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": "1000",
      },
      body: "password=x",
    });

    await expect(readBoundedFormData(request, 100)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });
});
