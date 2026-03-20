import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import ProfilePage from "../../app/profile/page";

describe("Profile page", () => {
  it("renders without crashing", async () => {
    render(<ProfilePage />);

    await waitFor(() => {
      expect(
        screen.getByText("You need to be logged in to view your profile.")
      ).toBeInTheDocument();
    });
  });
});
