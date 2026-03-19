import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import ForgotPasswordPage from "../../app/forgot-password/page";

describe("Forgot Password page", () => {
  it("renders without crashing", () => {
    const { container } = render(<ForgotPasswordPage />);
    expect(container).toBeTruthy();
  });
});
