/**
 * Tests: admin moderation controls
 *
 * Covers: removing a participant and cleaning up their linked dog entries
 * from the event. Admin-only UI is asserted via role="admin" in the scenario.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  EVENT_ID,
  buildFromTableImpl,
  type ScenarioConfig,
} from "./helpers/scenario";

// ---------------------------------------------------------------------------
// Hoisted mocks – only the admin-remove delete chains need asserting here.
// ---------------------------------------------------------------------------
const {
  getQueryParamMock,
  getCurrentUserMock,
  fromTableMock,
  deleteEntriesWhereEventMock,
  deleteEntriesWhereDogIdsMock,
  deleteSignupWhereEventMock,
  deleteSignupWhereUserMock,
} = vi.hoisted(() => {
  const getQueryParamMock = vi.fn((key: string) =>
    key === "id" ? "event-1" : null
  );
  const getCurrentUserMock = vi.fn();
  const fromTableMock = vi.fn();

  const deleteEntriesWhereDogIdsMock = vi.fn(async () => ({ error: null }));
  const deleteEntriesSecondEqMock = vi.fn(async () => ({ error: null }));
  const deleteEntriesWhereEventMock = vi.fn(() => ({
    in: deleteEntriesWhereDogIdsMock,
    eq: deleteEntriesSecondEqMock,
  }));

  const deleteSignupWhereUserMock = vi.fn(async () => ({ error: null }));
  const deleteSignupWhereEventMock = vi.fn(() => ({
    eq: deleteSignupWhereUserMock,
  }));

  return {
    getQueryParamMock,
    getCurrentUserMock,
    fromTableMock,
    deleteEntriesWhereEventMock,
    deleteEntriesWhereDogIdsMock,
    deleteSignupWhereEventMock,
    deleteSignupWhereUserMock,
  };
});

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
    rpc: vi.fn(async () => ({ error: null })),
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
  fromTableMock.mockImplementation(
    buildFromTableImpl(config, {
      deleteEntriesWhereEventMock,
      deleteSignupWhereEventMock,
      deleteSignupWhereUserMock,
    })
  );
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

describe("Competition page – admin moderation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getQueryParamMock.mockImplementation((key: string) =>
      key === "id" ? EVENT_ID : null
    );
  });

  it("removes a participant and deletes their linked dog entries", async () => {
    setup({
      userId: "user-1",
      role: "admin",
      signups: [
        { user_id: "user-1", public_profiles: null },
        { user_id: "user-2", public_profiles: null },
      ],
    });

    await renderPage();

    // Admin sees one Remove button per other participant (not for themselves).
    await waitFor(() => {
      expect(screen.getAllByLabelText("Remove user").length).toBe(1);
    });

    fireEvent.click(screen.getByLabelText("Remove user"));

    await waitFor(() => {
      expect(deleteEntriesWhereEventMock).toHaveBeenCalledWith(
        "event_id",
        EVENT_ID
      );
      expect(deleteEntriesWhereDogIdsMock).toHaveBeenCalledWith("dog_id", [
        "dog-1",
      ]);
      expect(deleteSignupWhereEventMock).toHaveBeenCalledWith(
        "event_id",
        EVENT_ID
      );
      expect(deleteSignupWhereUserMock).toHaveBeenCalledWith(
        "user_id",
        "user-2"
      );
    });
  });
});
