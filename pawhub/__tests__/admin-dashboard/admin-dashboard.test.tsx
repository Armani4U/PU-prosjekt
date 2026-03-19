import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import AdminDashboardPage from "../../app/admin-dashboard/page";

describe("Admin Dashboard page", () => {
  it("renders without crashing", () => {
    const { container } = render(<AdminDashboardPage />);
    expect(container).toBeTruthy();
  });
});