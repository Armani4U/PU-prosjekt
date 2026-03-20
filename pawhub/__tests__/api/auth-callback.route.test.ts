import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  cookiesMock,
  getAllMock,
  setMock,
  createServerClientMock,
  exchangeCodeForSessionMock,
} = vi.hoisted(() => {
  const getAllMock = vi.fn(() => []);
  const setMock = vi.fn();
  const cookiesMock = vi.fn(async () => ({
    getAll: getAllMock,
    set: setMock,
  }));

  const exchangeCodeForSessionMock = vi.fn(async () => ({ error: null }));

  const createServerClientMock = vi.fn(() => ({
    auth: {
      exchangeCodeForSession: exchangeCodeForSessionMock,
    },
  }));

  return {
    cookiesMock,
    getAllMock,
    setMock,
    createServerClientMock,
    exchangeCodeForSessionMock,
  };
});

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

import { GET } from "../../app/api/auth/callback/route";

describe("GET /api/auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllMock.mockReturnValue([]);
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });
  });

  it("redirects to /login when code is missing", async () => {
    const request = new Request("https://example.com/api/auth/callback");

    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/login");
    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  it("exchanges code and redirects to next path", async () => {
    const request = new Request(
      "https://example.com/api/auth/callback?code=test-code&next=/profile"
    );

    const response = await GET(request);

    expect(cookiesMock).toHaveBeenCalledTimes(1);
    expect(createServerClientMock).toHaveBeenCalledTimes(1);
    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("test-code");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/profile");
  });

  it("redirects to origin root when next is not provided", async () => {
    const request = new Request(
      "https://example.com/api/auth/callback?code=test-code"
    );

    const response = await GET(request);

    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("test-code");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/");
  });
});
