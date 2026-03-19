import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import ResetPasswordPage from "../../app/reset-password/page";

describe("Reset Password page", () => {
  it("renders without crashing", async () => {
    render(<ResetPasswordPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Invalid or expired reset link. Please request a new one.")
      ).toBeInTheDocument();
    });
  });
});
