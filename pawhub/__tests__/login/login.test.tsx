import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  replaceMock,
  searchGetMock,
  signInWithPasswordMock,
  signUpMock,
  signOutMock,
  fromMock,
  selectMock,
  eqMock,
  singleMock,
} = vi.hoisted(() => {
  const replaceMock = vi.fn();
  const searchGetMock = vi.fn((key: string) => null as string | null);

  const signInWithPasswordMock = vi.fn();
  const signUpMock = vi.fn();
  const signOutMock = vi.fn();

  const singleMock = vi.fn();
  const eqMock = vi.fn(() => ({ single: singleMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));

  return {
    replaceMock,
    searchGetMock,
    signInWithPasswordMock,
    signUpMock,
    signOutMock,
    fromMock,
    selectMock,
    eqMock,
    singleMock,
  };
});

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => ({
    get: searchGetMock,
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: signInWithPasswordMock,
      signUp: signUpMock,
      signOut: signOutMock,
    },
    from: fromMock,
  },
}));

import LoginPage from "../../app/login/page";

describe("Login page interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchGetMock.mockReturnValue(null);
    singleMock.mockResolvedValue({ data: { deleted_at: null }, error: null });
  });

  it("submits sign in with trimmed email and redirects", async () => {
    searchGetMock.mockImplementation((key: string) => (key === "next" ? "/profile" : null));
    signInWithPasswordMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" } },
      error: null,
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "  test@example.com  " },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(signInWithPasswordMock).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "secret123",
      });
      expect(fromMock).toHaveBeenCalledWith("profiles");
      expect(eqMock).toHaveBeenCalledWith("id", "user-1");
      expect(replaceMock).toHaveBeenCalledWith("/profile");
    });
  });

  it("shows auth error on failed sign in", async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid login credentials" },
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "bad-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByText("Invalid login credentials")).toBeInTheDocument();
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  it("signs out and shows deleted account message", async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" } },
      error: null,
    });
    singleMock.mockResolvedValue({ data: { deleted_at: "2026-01-01" }, error: null });

    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText("This account has been deleted.")).toBeInTheDocument();
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  it("shows validation error if sign up fields are empty", async () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

    expect(screen.getByText("Please enter email and password.")).toBeInTheDocument();
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("shows confirmation message when sign up succeeds without session", async () => {
    signUpMock.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => {
      expect(signUpMock).toHaveBeenCalledWith({
        email: "new@example.com",
        password: "secret123",
      });
      expect(
        screen.getByText("Account created. Check your email to confirm before signing in.")
      ).toBeInTheDocument();
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  it("continues as guest and redirects to safe next path", () => {
    searchGetMock.mockImplementation((key: string) =>
      key === "next" ? "https://malicious.example.com" : null
    );

    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: "Continue as guest" }));

    expect(replaceMock).toHaveBeenCalledWith("/");
  });
});