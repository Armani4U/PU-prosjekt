import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import HomePage from "../../app/page";

describe("Home page", () => {
  it("renders without crashing", async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByText("Feed")).toBeInTheDocument();
    });
  });
});
