import { describe, expect, it } from "vitest";

import {
  PERMISSIONS,
  getRoleBadgeColor,
  hasPermission,
  isAdmin,
  isAuthenticated,
} from "../../lib/auth/permissions";

describe("auth permissions helpers", () => {
  it("allows event management only for admin", () => {
    expect(PERMISSIONS.canCreateEvent("admin")).toBe(true);
    expect(PERMISSIONS.canEditEvent("admin")).toBe(true);
    expect(PERMISSIONS.canDeleteEvent("admin")).toBe(true);

    expect(PERMISSIONS.canCreateEvent("user")).toBe(false);
    expect(PERMISSIONS.canEditEvent("user")).toBe(false);
    expect(PERMISSIONS.canDeleteEvent("user")).toBe(false);

    expect(PERMISSIONS.canCreateEvent("guest")).toBe(false);
    expect(PERMISSIONS.canEditEvent("guest")).toBe(false);
    expect(PERMISSIONS.canDeleteEvent("guest")).toBe(false);
  });

  it("allows post creation/edit for user and admin, not guest", () => {
    expect(PERMISSIONS.canCreatePost("admin")).toBe(true);
    expect(PERMISSIONS.canEditOwnPost("admin")).toBe(true);

    expect(PERMISSIONS.canCreatePost("user")).toBe(true);
    expect(PERMISSIONS.canEditOwnPost("user")).toBe(true);

    expect(PERMISSIONS.canCreatePost("guest")).toBe(false);
    expect(PERMISSIONS.canEditOwnPost("guest")).toBe(false);
  });

  it("allows deleting any post and managing users only for admin", () => {
    expect(PERMISSIONS.canDeleteAnyPost("admin")).toBe(true);
    expect(PERMISSIONS.canManageUsers("admin")).toBe(true);

    expect(PERMISSIONS.canDeleteAnyPost("user")).toBe(false);
    expect(PERMISSIONS.canManageUsers("user")).toBe(false);

    expect(PERMISSIONS.canDeleteAnyPost("guest")).toBe(false);
    expect(PERMISSIONS.canManageUsers("guest")).toBe(false);
  });

  it("allows like for user and admin, not guest", () => {
    expect(PERMISSIONS.canLike("admin")).toBe(true);
    expect(PERMISSIONS.canLike("user")).toBe(true);
    expect(PERMISSIONS.canLike("guest")).toBe(false);
  });

  it("hasPermission delegates to PERMISSIONS map", () => {
    expect(hasPermission("admin", "canManageUsers")).toBe(true);
    expect(hasPermission("user", "canManageUsers")).toBe(false);
    expect(hasPermission("guest", "canLike")).toBe(false);
  });

  it("isAdmin and isAuthenticated return correct booleans", () => {
    expect(isAdmin("admin")).toBe(true);
    expect(isAdmin("user")).toBe(false);
    expect(isAdmin("guest")).toBe(false);

    expect(isAuthenticated("admin")).toBe(true);
    expect(isAuthenticated("user")).toBe(true);
    expect(isAuthenticated("guest")).toBe(false);
  });

  it("returns expected badge colors by role", () => {
    expect(getRoleBadgeColor("admin")).toBe("bg-purple-100 text-purple-700");
    expect(getRoleBadgeColor("user")).toBe("bg-blue-100 text-blue-700");
    expect(getRoleBadgeColor("guest")).toBe("bg-gray-100 text-gray-700");
  });
});
