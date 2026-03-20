/**
 * Tests: likes and comments on competition entries
 *
 * Covers: like when registered/unregistered, post comment
 * when registered/unregistered, edit own comment, delete own comment.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  EVENT_ID,
  buildFromTableImpl,
  type ScenarioConfig,
} from "./helpers/scenario";

// ---------------------------------------------------------------------------
// Hoisted mocks – operation-level spies for likes and comments.
// ---------------------------------------------------------------------------
const {
  getQueryParamMock,
  getCurrentUserMock,
  fromTableMock,
  insertEntryLikeMock,
  insertEntryCommentMock,
  updateCommentWhereUserMock,
  updateCommentWhereIdMock,
  updateCommentMock,
  deleteCommentWhereIdMock,
  deleteCommentWhereDogMock,
  deleteCommentWhereEventMock,
} = vi.hoisted(() => {
  const getQueryParamMock = vi.fn((key: string) =>
    key === "id" ? "event-1" : null
  );
  const getCurrentUserMock = vi.fn();
  const fromTableMock = vi.fn();
  const insertEntryLikeMock = vi.fn();
  const insertEntryCommentMock = vi.fn();

  const updateCommentWhereUserMock = vi.fn(async () => ({ error: null }));
  const updateCommentWhereIdMock = vi.fn(() => ({
    eq: updateCommentWhereUserMock,
  }));
  const updateCommentMock = vi.fn(() => ({ eq: updateCommentWhereIdMock }));

  const deleteCommentWhereIdMock = vi.fn(async () => ({ error: null }));
  const deleteCommentWhereDogMock = vi.fn(() => ({
    eq: deleteCommentWhereIdMock,
  }));
  const deleteCommentWhereEventMock = vi.fn(() => ({
    eq: deleteCommentWhereDogMock,
  }));

  return {
    getQueryParamMock,
    getCurrentUserMock,
    fromTableMock,
    insertEntryLikeMock,
    insertEntryCommentMock,
    updateCommentWhereUserMock,
    updateCommentWhereIdMock,
    updateCommentMock,
    deleteCommentWhereIdMock,
    deleteCommentWhereDogMock,
    deleteCommentWhereEventMock,
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
      insertEntryLikeMock,
      insertEntryCommentMock,
      updateCommentMock,
      deleteCommentWhereEventMock,
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

describe("Competition page – likes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getQueryParamMock.mockImplementation((key: string) =>
      key === "id" ? EVENT_ID : null
    );
    insertEntryLikeMock.mockResolvedValue({ error: null });
    insertEntryCommentMock.mockResolvedValue({ error: null });
  });

  it("inserts the correct payload when a registered user likes an entry", async () => {
    setup({
      userId: "user-1",
      signups: [{ user_id: "user-1", public_profiles: null }],
    });

    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Like" }));

    await waitFor(() => {
      expect(insertEntryLikeMock).toHaveBeenCalledWith({
        event_id: EVENT_ID,
        dog_id: "dog-1",
        user_id: "user-1",
      });
    });
  });

  it("shows a registration error when an unregistered user tries to like", async () => {
    setup({ userId: "user-1", signups: [] });

    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Like" }));

    await waitFor(() => {
      expect(
        screen.getByText("Join the event to like dogs.")
      ).toBeInTheDocument();
    });
    expect(insertEntryLikeMock).not.toHaveBeenCalled();
  });
});

describe("Competition page – comments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getQueryParamMock.mockImplementation((key: string) =>
      key === "id" ? EVENT_ID : null
    );
    insertEntryLikeMock.mockResolvedValue({ error: null });
    insertEntryCommentMock.mockResolvedValue({ error: null });
  });

  it("inserts the correct payload when a registered user posts a comment", async () => {
    setup({
      userId: "user-1",
      signups: [{ user_id: "user-1", public_profiles: null }],
    });

    await renderPage();

    fireEvent.change(screen.getByPlaceholderText("Write a comment…"), {
      target: { value: "Great dog!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    await waitFor(() => {
      expect(insertEntryCommentMock).toHaveBeenCalledWith({
        event_id: EVENT_ID,
        dog_id: "dog-1",
        user_id: "user-1",
        content: "Great dog!",
      });
    });
  });

  it("shows a registration error when an unregistered user tries to comment", async () => {
    setup({ userId: "user-1", signups: [] });

    await renderPage();

    fireEvent.change(screen.getByPlaceholderText("Write a comment…"), {
      target: { value: "Great dog!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    await waitFor(() => {
      expect(
        screen.getByText("Join the event to comment.")
      ).toBeInTheDocument();
    });
    expect(insertEntryCommentMock).not.toHaveBeenCalled();
  });

  it("sends the correct update payload when a user edits their own comment", async () => {
    setup({
      userId: "user-1",
      signups: [{ user_id: "user-1", public_profiles: null }],
      comments: [
        {
          id: "comment-1",
          dog_id: "dog-1",
          user_id: "user-1",
          content: "Nice dog",
          created_at: new Date().toISOString(),
        },
      ],
      publicProfiles: [
        { id: "owner-1", display_name: "Owner One", avatar_url: null },
        { id: "user-1", display_name: "Tester", avatar_url: null },
      ],
    });

    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Edit comment" }));
    fireEvent.change(screen.getByDisplayValue("Nice dog"), {
      target: { value: "Great dog" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateCommentMock).toHaveBeenCalledWith({ content: "Great dog" });
      expect(updateCommentWhereIdMock).toHaveBeenCalledWith("id", "comment-1");
      expect(updateCommentWhereUserMock).toHaveBeenCalledWith(
        "user_id",
        "user-1"
      );
    });
  });

  it("calls the correct delete chain when a user confirms comment deletion", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    setup({
      userId: "user-1",
      signups: [{ user_id: "user-1", public_profiles: null }],
      comments: [
        {
          id: "comment-1",
          dog_id: "dog-1",
          user_id: "user-1",
          content: "Nice dog",
          created_at: new Date().toISOString(),
        },
      ],
      publicProfiles: [
        { id: "owner-1", display_name: "Owner One", avatar_url: null },
        { id: "user-1", display_name: "Tester", avatar_url: null },
      ],
    });

    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Delete comment" }));

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(deleteCommentWhereEventMock).toHaveBeenCalledWith(
        "event_id",
        EVENT_ID
      );
      expect(deleteCommentWhereDogMock).toHaveBeenCalledWith("dog_id", "dog-1");
      expect(deleteCommentWhereIdMock).toHaveBeenCalledWith("id", "comment-1");
    });

    confirmSpy.mockRestore();
  });
});
