/**
 * Tests: event registration flow
 *
 * Covers: join, leave, guest auth guard, RPC failure, and
 * disabled interactions when the event window has passed.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  EVENT_ID,
  buildFromTableImpl,
  type ScenarioConfig,
} from "./helpers/scenario";

// ---------------------------------------------------------------------------
// Hoisted mocks – only the knobs this file needs to assert on.
// ---------------------------------------------------------------------------
const { getQueryParamMock, getCurrentUserMock, fromTableMock, runRpcMock } =
  vi.hoisted(() => ({
    getQueryParamMock: vi.fn((key: string) => (key === "id" ? "event-1" : null)),
    getCurrentUserMock: vi.fn(),
    fromTableMock: vi.fn(),
    runRpcMock: vi.fn(),
  }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => ({ get: getQueryParamMock }),
  useParams: () => ({ id: "test-user-id" }),
  usePathname: () => "/competition",
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: { getUser: getCurrentUserMock },
    from: fromTableMock,
    rpc: runRpcMock,
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(),
        getPublicUrl: vi.fn(() => ({
          data: { publicUrl: "https://example.com/test.jpg" },
        })),
      })),
    },
  },
}));

import CompetitionPage from "../../app/competition/page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup(config: ScenarioConfig) {
  getCurrentUserMock.mockResolvedValue({
    data: { user: config.userId ? { id: config.userId } : null },
  });
  runRpcMock.mockResolvedValue(
    config.rpcError
      ? { error: { message: config.rpcError } }
      : { error: null }
  );
  fromTableMock.mockImplementation(buildFromTableImpl(config));
}

async function renderPage() {
  render(<CompetitionPage />);
  await waitFor(() =>
    expect(screen.getByText("Spring Dog Show")).toBeInTheDocument()
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Competition page – join & leave", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getQueryParamMock.mockImplementation((key: string) =>
      key === "id" ? EVENT_ID : null
    );
  });

  it("joins event for a logged-in user", async () => {
    setup({ userId: "user-1", signups: [] });

    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Join event" }));

    await waitFor(() => {
      expect(runRpcMock).toHaveBeenCalledWith("join_event", {
        p_event_id: EVENT_ID,
      });
    });
  });

  it("leaves event when already registered", async () => {
    setup({
      userId: "user-1",
      signups: [{ user_id: "user-1", public_profiles: null }],
    });

    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Leave event" }));

    await waitFor(() => {
      expect(runRpcMock).toHaveBeenCalledWith("leave_event", {
        p_event_id: EVENT_ID,
      });
    });
  });

  it("shows an auth error when a guest tries to join", async () => {
    setup({ userId: null, signups: [] });

    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Join event" }));

    await waitFor(() => {
      expect(
        screen.getByText("You must be logged in to join.")
      ).toBeInTheDocument();
    });
    expect(runRpcMock).not.toHaveBeenCalled();
  });

  it("shows the RPC error message when join_event fails", async () => {
    setup({ userId: "user-1", signups: [], rpcError: "Join failed from RPC" });

    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Join event" }));

    await waitFor(() => {
      expect(
        screen.getByText("Join failed from RPC")
      ).toBeInTheDocument();
    });
  });

  it("disables like, comment, and post controls when the event has ended", async () => {
    setup({
      userId: "user-1",
      signups: [{ user_id: "user-1", public_profiles: null }],
      eventPhase: "ended",
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("This event has ended.")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Leave event" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Like" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
    expect(
      screen.getByPlaceholderText("Write a comment…") as HTMLInputElement
    ).toBeDisabled();
  });
});
