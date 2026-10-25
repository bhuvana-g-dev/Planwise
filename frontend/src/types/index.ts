// Typed contracts mirrored from the backend Pydantic models.

export type EventType = "birthday" | "wedding" | "community";

export interface Preference {
  label: string;
  rank: number;
}

export interface EventCreate {
  name: string;
  event_type: EventType;
  event_date: string; // ISO date
  location: string;
  guest_count: number;
  budget_inr: number;
  theme?: string;
  style?: string;
  dietary_requirements?: string[];
  accessibility_requirements?: string[];
  preferences?: Preference[];
  hard_constraints?: string[];
  flexible_choices?: string[];
}

export interface EventRecord extends EventCreate {
  id: string;
  owner_id?: string | null;
  budget_paise: number;
  created_at: string;
  updated_at: string;
}

export type ExpenseSource = "estimate" | "user_quote";

export interface Expense {
  id: string;
  category: string;
  label: string;
  amount_paise: number;
  source: ExpenseSource;
  assumptions: string;
  per_guest: boolean;
  negotiable: boolean;
  satisfies_constraint?: string | null;
  committed: boolean;
}

export type TaskPriority = "low" | "medium" | "high" | "critical";
export type TaskStatus =
  | "not_started"
  | "blocked"
  | "ready"
  | "in_progress"
  | "done";

export interface Task {
  id: string;
  name: string;
  description: string;
  priority: TaskPriority;
  due_date: string | null;
  status: TaskStatus;
  depends_on: string[];
  related_category?: string | null;
}

export interface BudgetSummary {
  budget_paise: number;
  allocated_paise: number;
  committed_paise: number;
  remaining_paise: number;
  overrun_paise: number;
  within_budget: boolean;
  utilization_pct: number;
  category_totals: Record<string, number>;
}

export interface Risk {
  description: string;
  severity: string;
}

export interface Plan {
  id: string;
  event_id: string;
  version: number;
  overview: string;
  expenses: Expense[];
  allocations: { category: string; allocated_paise: number }[];
  tasks: Task[];
  recommendations: string[];
  vendor_questions: string[];
  risks: Risk[];
  open_decisions: string[];
  budget: BudgetSummary;
  generated_by: string;
  change_summary: string;
  created_at: string;
  is_active: boolean;
}

export type ChangeType =
  | "budget"
  | "guest_count"
  | "event_date"
  | "preferences"
  | "hard_constraints";

export interface ReplanRequest {
  change_type: ChangeType;
  new_budget_inr?: number;
  new_guest_count?: number;
  new_event_date?: string;
  new_preferences?: { label: string; rank: number }[];
  new_hard_constraints?: string[];
}

export interface ExpenseDelta {
  kind: "added" | "modified" | "removed" | "unchanged";
  category: string;
  label: string;
  previous_paise?: number | null;
  new_paise?: number | null;
  reason: string;
}

export interface TaskDelta {
  kind: string;
  task_id: string;
  name: string;
  previous_due?: string | null;
  new_due?: string | null;
  reason: string;
}

export interface ChangeReport {
  change_type: ChangeType;
  previous_value: unknown;
  new_value: unknown;
  feasible: boolean;
  affected_categories: string[];
  expense_deltas: ExpenseDelta[];
  task_deltas: TaskDelta[];
  preserved_constraints: string[];
  constraint_violations: string[];
  trade_offs: string[];
  unresolved_questions: string[];
  reasons: string[];
  previous_budget_paise: number;
  proposed_allocated_paise: number;
  proposed_remaining_paise: number;
}

export interface ReplanResult {
  report: ChangeReport;
  proposed_plan: Plan | null;
}

export interface VendorQuote {
  id?: string;
  vendor_name: string;
  category: string;
  amount_inr: number;
  inclusions: string[];
  exclusions: string[];
  contact: string;
  quote_date?: string | null;
  availability_verified: boolean;
  notes: string;
}

export interface VendorComparison {
  quotes: VendorQuote[];
  cheapest_vendor: string | null;
  best_value_vendor: string | null;
  missing_info: Record<string, string[]>;
  questions: string[];
  notes: string[];
}

export type RsvpStatus = "invited" | "confirmed" | "declined" | "tentative";

export interface Guest {
  id?: string;
  name: string;
  group: string;
  rsvp: RsvpStatus;
  plus_ones: number;
  dietary: string[];
  accessibility: string[];
  contact: string;
  notes: string;
}

export interface GuestSummary {
  total_guests: number;
  total_headcount: number;
  confirmed_headcount: number;
  by_status: Record<string, number>;
  by_group: Record<string, number>;
  dietary_counts: Record<string, number>;
  accessibility_counts: Record<string, number>;
}

export interface EventDetail {
  event: EventRecord;
  active_plan: Plan | null;
  plans: Plan[];
  vendors: VendorQuote[];
  guests: Guest[];
  guest_summary: GuestSummary;
}
