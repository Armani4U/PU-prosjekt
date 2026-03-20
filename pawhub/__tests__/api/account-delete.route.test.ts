import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, getUserMock, deleteUserMock } = vi.hoisted(() => {
  const getUserMock = vi.fn();
  const deleteUserMock = vi.fn();
  const createClientMock = vi.fn(() => ({
    auth: {
      getUser: getUserMock,
      admin: {
        deleteUser: deleteUserMock,
      },
    },
  }));

  return { createClientMock, getUserMock, deleteUserMock };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

import { POST } from "../../app/api/account/delete/route";

describe("POST /api/account/delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no authenticated user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const response = await POST();

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it("returns 401 when getUser fails", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: "bad token" } });

    const response = await POST();

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it("returns 500 when deleteUser fails", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    deleteUserMock.mockResolvedValue({ error: { message: "delete failed" } });

    const response = await POST();

    expect(deleteUserMock).toHaveBeenCalledWith("user-1");
    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe("delete failed");
  });

  it("returns 200 when account deletion succeeds", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    deleteUserMock.mockResolvedValue({ error: null });

    const response = await POST();

    expect(deleteUserMock).toHaveBeenCalledWith("user-1");
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("OK");
  });
});
