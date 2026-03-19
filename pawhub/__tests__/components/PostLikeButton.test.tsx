import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { togglePostLikeMock, refreshMock } = vi.hoisted(() => ({
  togglePostLikeMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
    refresh: refreshMock,
  }),
}));

vi.mock("@/app/api/actions/post-likes", () => ({
  togglePostLike: togglePostLikeMock,
}));

import PostLikeButton from "../../app/components/PostLikeButton";

describe("PostLikeButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders initial likes and unliked icon", () => {
    render(<PostLikeButton postId="post-1" initialLikes={5} isLikedInitially={false} />);

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("🤍");
    expect(button).toHaveTextContent("5");
  });

  it("optimistically toggles like, calls action, and refreshes router", async () => {
    togglePostLikeMock.mockResolvedValue(undefined);

    render(<PostLikeButton postId="post-1" initialLikes={5} isLikedInitially={false} />);

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("button")).toHaveTextContent("❤️");
    expect(screen.getByRole("button")).toHaveTextContent("6");

    await waitFor(() => {
      expect(togglePostLikeMock).toHaveBeenCalledWith("post-1");
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });
  });

  it("prevents double click while pending", async () => {
    let resolveLike: (() => void) | undefined;
    const pendingPromise = new Promise<void>((resolve) => {
      resolveLike = resolve;
    });
    togglePostLikeMock.mockReturnValue(pendingPromise);

    render(<PostLikeButton postId="post-1" initialLikes={0} isLikedInitially={false} />);

    const button = screen.getByRole("button");
    fireEvent.click(button);
    fireEvent.click(button);

    expect(togglePostLikeMock).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();

    resolveLike?.();
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it("rolls back optimistic state and alerts on failure", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    togglePostLikeMock.mockRejectedValue(new Error("network"));

    render(<PostLikeButton postId="post-1" initialLikes={5} isLikedInitially={false} />);

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveTextContent("🤍");
      expect(screen.getByRole("button")).toHaveTextContent("5");
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    consoleErrorSpy.mockRestore();
    alertSpy.mockRestore();
  });
});
