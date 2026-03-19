import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { toggleDogLikeMock } = vi.hoisted(() => ({
  toggleDogLikeMock: vi.fn(),
}));

vi.mock("@/app/api/actions/likes", () => ({
  toggleDogLike: toggleDogLikeMock,
}));

import LikeButton from "../../app/components/LikeButton";

describe("LikeButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders initial likes and unliked icon", () => {
    render(<LikeButton dogId="dog-1" initialLikes={3} isLikedInitially={false} />);

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("🤍");
    expect(button).toHaveTextContent("3");
  });

  it("optimistically toggles like and calls action", async () => {
    toggleDogLikeMock.mockResolvedValue(undefined);

    render(<LikeButton dogId="dog-1" initialLikes={3} isLikedInitially={false} />);

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("button")).toHaveTextContent("❤️");
    expect(screen.getByRole("button")).toHaveTextContent("4");
    await waitFor(() => expect(toggleDogLikeMock).toHaveBeenCalledWith("dog-1"));
  });

  it("prevents double click while pending", async () => {
    let resolveLike: (() => void) | undefined;
    const pendingPromise = new Promise<void>((resolve) => {
      resolveLike = resolve;
    });
    toggleDogLikeMock.mockReturnValue(pendingPromise);

    render(<LikeButton dogId="dog-1" initialLikes={1} isLikedInitially={false} />);

    const button = screen.getByRole("button");
    fireEvent.click(button);
    fireEvent.click(button);

    expect(toggleDogLikeMock).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();

    resolveLike?.();
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it("rolls back optimistic state when action fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    toggleDogLikeMock.mockRejectedValue(new Error("network"));

    render(<LikeButton dogId="dog-1" initialLikes={2} isLikedInitially={false} />);

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveTextContent("🤍");
      expect(screen.getByRole("button")).toHaveTextContent("2");
    });

    consoleErrorSpy.mockRestore();
  });
});
