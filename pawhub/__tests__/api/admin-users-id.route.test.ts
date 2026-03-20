import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createClientMock,
  getUserByTokenMock,
  deleteAuthUserMock,
  fromMock,
  selectMock,
  selectEqMock,
  selectSingleMock,
  cleanupDeleteMock,
  cleanupDeleteEqMock,
} = vi.hoisted(() => {
  const getUserByTokenMock = vi.fn();
  const deleteAuthUserMock = vi.fn();

  const selectSingleMock = vi.fn();
  const selectEqMock = vi.fn(() => ({ single: selectSingleMock }));
  const selectMock = vi.fn(() => ({ eq: selectEqMock }));

  const cleanupDeleteEqMock = vi.fn();
  const cleanupDeleteMock = vi.fn(() => ({ eq: cleanupDeleteEqMock }));

  const fromMock = vi.fn(() => ({
    select: selectMock,
    delete: cleanupDeleteMock,
  }));

  const createClientMock = vi.fn(() => ({
    auth: {
      getUser: getUserByTokenMock,
      admin: {
        deleteUser: deleteAuthUserMock,
      },
    },
    from: fromMock,
  }));

  return {
    createClientMock,
    getUserByTokenMock,
    deleteAuthUserMock,
    fromMock,
    selectMock,
    selectEqMock,
    selectSingleMock,
    cleanupDeleteMock,
    cleanupDeleteEqMock,
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

import { DELETE } from "../../app/api/admin/users/[id]/route";

describe("DELETE /api/admin/users/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getUserByTokenMock.mockResolvedValue({ data: { user: { id: "admin-1" } }, error: null });
    selectSingleMock.mockResolvedValue({ data: { role: "admin" }, error: null });
    deleteAuthUserMock.mockResolvedValue({ error: null });
    cleanupDeleteEqMock.mockResolvedValue({ error: null });
  });

  it("returns 401 when authorization header is missing", async () => {
    const request = new Request("https://example.com/api/admin/users/target-1", { method: "DELETE" });

    const response = await DELETE(request, { params: { id: "target-1" } });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Missing auth token" });
    expect(getUserByTokenMock).not.toHaveBeenCalled();
  });

  it("returns 401 when token is invalid", async () => {
    getUserByTokenMock.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });

    const request = new Request("https://example.com/api/admin/users/target-1", {
      method: "DELETE",
      headers: { authorization: "Bearer bad-token" },
    });

    const response = await DELETE(request, { params: { id: "target-1" } });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Invalid token" });
  });

  it("returns 403 when caller is not admin", async () => {
    selectSingleMock.mockResolvedValue({ data: { role: "user" }, error: null });

    const request = new Request("https://example.com/api/admin/users/target-1", {
      method: "DELETE",
      headers: { authorization: "Bearer token" },
    });

    const response = await DELETE(request, { params: { id: "target-1" } });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "Not authorized" });
  });

  it("returns 400 when admin tries to delete self", async () => {
    const request = new Request("https://example.com/api/admin/users/admin-1", {
      method: "DELETE",
      headers: { authorization: "Bearer token" },
    });

    const response = await DELETE(request, { params: { id: "admin-1" } });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "You cannot delete yourself" });
    expect(deleteAuthUserMock).not.toHaveBeenCalled();
  });

  it("returns 500 when auth delete fails", async () => {
    deleteAuthUserMock.mockResolvedValue({ error: { message: "delete failed" } });

    const request = new Request("https://example.com/api/admin/users/target-1", {
      method: "DELETE",
      headers: { authorization: "Bearer token" },
    });

    const response = await DELETE(request, { params: { id: "target-1" } });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "delete failed" });
  });

  it("returns ok true when delete succeeds", async () => {
    const request = new Request("https://example.com/api/admin/users/target-1", {
      method: "DELETE",
      headers: { authorization: "Bearer token" },
    });

    const response = await DELETE(request, { params: { id: "target-1" } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(getUserByTokenMock).toHaveBeenCalledWith("token");
    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(deleteAuthUserMock).toHaveBeenCalledWith("target-1");
    expect(cleanupDeleteEqMock).toHaveBeenCalledWith("id", "target-1");
  });
});
