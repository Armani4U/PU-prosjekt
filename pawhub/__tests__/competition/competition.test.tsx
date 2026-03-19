import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import CompetitionPage from "../../app/competition/page";

describe("Competition page", () => {
  it("renders without crashing", () => {
    const { container } = render(<CompetitionPage />);
    expect(container).toBeTruthy();
  });
});
