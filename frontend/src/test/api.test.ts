import { afterEach, describe, expect, it, vi } from "vitest";
import { api, setTokenProvider, ApiError } from "../services/api";

describe("api token provider", () => {
  afterEach(() => {
    setTokenProvider(async () => null);
    vi.restoreAllMocks();
  });

  it("attaches a bearer token when provided", async () => {
    setTokenProvider(async () => "tok-123");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify([]), { status: 200 }) as Response
      );

    await api.listEvents();

    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer tok-123");
  });

  it("omits Authorization header when no token", async () => {
    setTokenProvider(async () => null);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify([]), { status: 200 }) as Response
      );

    await api.listEvents();

    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("surfaces API error detail and status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "nope" }), {
        status: 403,
      }) as Response
    );
    await expect(api.listEvents()).rejects.toMatchObject({
      status: 403,
      message: "nope",
    } satisfies Partial<ApiError>);
  });
});
