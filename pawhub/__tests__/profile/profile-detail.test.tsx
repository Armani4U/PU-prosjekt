import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import ProfileDetailPage from "../../app/profile/[id]/page";

describe("Profile Detail page", () => {
  it("renders without crashing", async () => {
    render(<ProfileDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Profile not found")).toBeInTheDocument();
    });
  });
});
