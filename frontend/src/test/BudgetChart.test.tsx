import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import BudgetChart from "../components/BudgetChart";
import type { BudgetSummary } from "../types";

const budget: BudgetSummary = {
  budget_paise: 3000000,
  allocated_paise: 3000000,
  committed_paise: 0,
  remaining_paise: 0,
  overrun_paise: 0,
  within_budget: true,
  utilization_pct: 100,
  category_totals: { catering: 1200000, venue: 600000, decorations: 1200000 },
};

describe("BudgetChart", () => {
  it("renders a bar per category from real data", () => {
    render(<BudgetChart budget={budget} />);
    expect(screen.getByText("Catering")).toBeInTheDocument();
    expect(screen.getByText("Venue")).toBeInTheDocument();
    expect(screen.getByText("Decorations")).toBeInTheDocument();
  });

  it("shows empty state with no expenses", () => {
    render(<BudgetChart budget={{ ...budget, category_totals: {} }} />);
    expect(screen.getByText(/no expenses/i)).toBeInTheDocument();
  });
});
