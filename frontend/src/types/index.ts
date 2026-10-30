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

/** Result of interpreting a natural-language change request. */
export interface InterpretReplanResult {
  // "interpreted" => result is present; "needs_clarification" / "unavailable"
  // => only the message/understood fields are meaningful.
  status: "interpreted" | "needs_clarification" | "unavailable";
  // How the intent was produced: "gemini" when AI interpreted it, or
  // "unavailable" when the AI path could not run.
  source: "gemini" | "unavailable";
  replan_request: ReplanRequest | null;
  understood: string;
  message: string;
  reasons: string[];
  result: ReplanResult | null;
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
  venue_shortlist?: Venue[];
  selected_venue?: Venue | null;
}

// --- Catering ---
export type MenuCategory =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snacks"
  | "starters"
  | "main_course"
  | "rice_breads"
  | "desserts"
  | "beverages"
  | "custom";

export type DietaryClass =
  | "vegetarian"
  | "non_vegetarian"
  | "vegan"
  | "mixed";

export type PricingUnit = "per_serving" | "per_unit" | "per_package";
export type CostSource = "estimate" | "user_quote";
export type ItemStatus = "suggested" | "selected" | "rejected";

export interface MenuItem {
  id?: string;
  name: string;
  category: MenuCategory;
  description: string;
  dietary: DietaryClass;
  cuisine: string;
  allergen_notes: string;
  servings_per_guest: number;
  planned_quantity: number;
  unit: string;
  unit_cost_paise: number;
  pricing_unit: PricingUnit;
  cost_source: CostSource;
  caterer: string;
  status: ItemStatus;
  required: boolean;
  notes: string;
  computed_quantity?: number;
  total_cost_paise?: number;
}

export interface CateringPreferences {
  cuisines: string[];
  dietary_restrictions: string[];
  allergies: string[];
  serving_style: string;
  meal_times: MenuCategory[];
  required_dishes: string[];
  prohibited_ingredients: string[];
  budget_per_guest_inr: number | null;
  vegetarian_only: boolean;
}

export interface CateringHeadcount {
  planned_guests: number;
  confirmed_headcount: number;
  attending_headcount: number;
  pending_responses: number;
  plus_ones: number;
  catering_headcount: number;
  source: string;
  override_differs: boolean;
}

export interface CategoryTotal {
  category: string;
  total_paise: number;
  item_count: number;
}

export interface CateringSummary {
  headcount: CateringHeadcount;
  total_paise: number;
  cost_per_guest_paise: number;
  category_totals: CategoryTotal[];
  catering_budget_paise: number | null;
  remaining_paise: number | null;
  overrun_paise: number | null;
  within_budget: boolean | null;
}

export interface CateringPlan {
  items: MenuItem[];
  preferences: CateringPreferences;
  headcount_override: number | null;
}

export interface CateringState {
  plan: CateringPlan;
  summary: CateringSummary;
}

export interface GenerateMenuResult {
  generated_by: string;
  state: CateringState;
  allergy_notice: string | null;
}

// --- Venues ---
export type VenueType =
  | "wedding_hall"
  | "banquet_hall"
  | "hotel"
  | "outdoor_garden"
  | "beach"
  | "community_hall"
  | "conference_hall"
  | "other";

export interface Venue {
  id: string;
  name: string;
  venue_type: VenueType;
  location: string;
  city: string;
  est_price_paise: number | null;
  capacity: number;
  indoor: boolean;
  outdoor: boolean;
  amenities: string[];
  lat: number | null;
  lng: number | null;
  image_url: string;
  contact: string;
  source: "demo" | "user" | "osm" | "provider";
  notes: string;
}

export type BudgetMatch = "fits_or_unknown" | "fits" | "within";

export interface VenueQuery {
  keyword?: string;
  venue_type?: VenueType | null;
  city?: string;
  min_capacity?: number | null;
  max_capacity?: number | null;
  min_price_inr?: number | null;
  max_price_inr?: number | null;
  budget_match?: BudgetMatch;
  indoor?: boolean | null;
  outdoor?: boolean | null;
  amenities?: string[];
  /** relevance | price | price_desc | capacity | fit */
  sort?: string;
  page?: number;
  page_size?: number;
}

export type PriceKind = "quoted" | "listed" | "estimated" | "unavailable";
export type PriceScope = "rental_only" | "package";
export type VenueBudgetStatus = "within" | "possibly_within" | "outside" | "unknown";

/** The price that applies to a venue (quote > listed > draft estimate). */
export interface VenuePrice {
  kind: PriceKind;
  label: string;
  min_paise: number | null;
  max_paise: number | null;
  scope: PriceScope | null;
  scope_label: string;
  package_includes: string[];
  verified: boolean;
  budget_paise: number | null;
  budget_status: VenueBudgetStatus;
  note: string;
}

export interface VenueQuoteInput {
  amount_inr: number;
  scope: PriceScope;
  package_includes: string[];
  notes: string;
  venue_name?: string;
  venue_type?: VenueType | null;
}

export interface VenueQuote {
  venue_id: string;
  amount_paise: number;
  scope: PriceScope;
  package_includes: string[];
  notes: string;
  venue_name: string;
  venue_type: VenueType | null;
  updated_at: string;
}

export interface PriceBandsInfo {
  status: string;
  note: string;
  estimate_label: string;
  bands: {
    venue_type: VenueType;
    min_inr: number | null;
    max_inr: number | null;
    scope: PriceScope | null;
    covers: string | null;
  }[];
}

export interface VenuePage {
  results: Venue[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  source_mode: string;
  disclaimer: string;
  prices?: Record<string, VenuePrice>;
}

export interface SelectedVenue {
  venue: Venue;
  est_price_paise: number | null;
  venue_budget_paise: number | null;
  remaining_paise: number | null;
  overrun_paise: number | null;
  within_budget: boolean | null;
  price?: VenuePrice | null;
}

export interface VenueRecommendation {
  generated_by: string;
  recommendations: Venue[];
  prices?: Record<string, VenuePrice>;
  reasoning: string;
  disclaimer: string;
}

export interface CateringOptimizeResult {
  goal: string;
  feasible: boolean;
  before: CateringSummary;
  after: CateringSummary;
  proposed_plan: CateringPlan;
  trade_offs: string[];
  reasons: string[];
  constraint_violations: string[];
}

// --------------------------------------------------------------------------
// Caterers: discovery, comparison, manual arrangements, booking, budget
// --------------------------------------------------------------------------
export type FoodType = "veg" | "nonveg" | "both";
export type CatererMenuType =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snacks"
  | "custom";
export type BookingStatus = "not_booked" | "requested" | "confirmed" | "cancelled";
export type PaymentStatus = "unpaid" | "partially_paid" | "paid" | "refunded";
export type PriceSource = "published" | "estimated" | "quoted" | "quote_needed";
export type BudgetSync = "not_applied" | "in_sync" | "out_of_date" | "replaced";

export interface MenuCourses {
  starters: string;
  mains: string;
  desserts: string;
  beverages: string;
}

/** Create/update payload (rupees). */
export interface CatererInput {
  name: string;
  source?: "manual" | "osm";
  provider_id?: string | null;
  kind?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  lat?: number | null;
  lng?: number | null;
  distance_km?: number | null;
  menu_types?: CatererMenuType[];
  food_type?: FoodType;
  cuisines?: string[];
  menu?: MenuCourses;
  inclusions?: string[];
  guest_count?: number | null;
  price_per_guest_inr?: number;
  extras_inr?: number;
  fixed_total_inr?: number | null;
  fixed_total_reason?: string;
  advance_paid_inr?: number;
  price_source?: PriceSource;
  min_guests?: number | null;
  max_guests?: number | null;
  booking_status?: BookingStatus;
  refunded?: boolean;
  notes?: string;
}

export interface RequirementCheck {
  key: string;
  label: string;
  ok: boolean;
}

/** Stored record + backend-computed totals (paise). */
export interface CatererView {
  id: string;
  name: string;
  source: "manual" | "osm";
  provider_id: string | null;
  kind: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  lat: number | null;
  lng: number | null;
  distance_km: number | null;
  menu_types: CatererMenuType[];
  food_type: FoodType;
  cuisines: string[];
  menu: MenuCourses;
  inclusions: string[];
  guest_count: number | null;
  price_per_guest_paise: number;
  extras_paise: number;
  fixed_total_paise: number | null;
  fixed_total_reason: string;
  advance_paid_paise: number;
  price_source: PriceSource;
  min_guests: number | null;
  max_guests: number | null;
  booking_status: BookingStatus;
  refunded: boolean;
  notes: string;
  selected: boolean;
  applied_total_paise: number | null;
  applied_plan_version: number | null;
  created_at: string;
  updated_at: string;
  // computed
  guests_used: number;
  guests_follow_event: boolean;
  base_paise: number;
  computed_total_paise: number;
  total_paise: number;
  is_fixed_price: boolean;
  has_price: boolean;
  balance_paise: number;
  overpaid_paise: number;
  payment_status: PaymentStatus;
  checks: RequirementCheck[];
  meets_requirements: boolean;
  budget_sync: BudgetSync;
}

export interface CatererOverview {
  food_preference: FoodType;
  headcount: { count: number; source: string; planned: number; confirmed: number };
  event: { name: string; date: string; location: string; event_type: string };
  records: CatererView[];
  best_fit_id: string | null;
  selected_id: string | null;
  budget: {
    has_plan: boolean;
    plan_version: number | null;
    budget_paise: number | null;
    allocated_paise: number | null;
    remaining_paise: number | null;
    catering_paise: number | null;
  };
}

export interface CatererSearchResult {
  provider_id: string;
  name: string;
  kind: "caterer" | "restaurant" | string;
  address: string;
  lat: number | null;
  lng: number | null;
  distance_km: number | null;
  phone: string;
  email: string;
  website: string;
  cuisines: string[];
  diet: "pure_veg" | "veg_options" | "non_veg" | "unknown" | string;
  opening_hours: string;
  source: string;
  osm_url: string;
}

export interface CatererSearchResponse {
  status: "ok" | "unavailable" | "invalid";
  results: CatererSearchResult[];
  message: string;
  attribution: string;
  center: { lat: number; lng: number; label: string } | null;
  radius_km?: number;
}

export interface CatererBudgetPreview {
  caterer_id: string;
  caterer_name: string;
  total_paise: number;
  base_version: number;
  before: {
    budget_paise: number;
    catering_paise: number;
    allocated_paise: number;
    remaining_paise: number;
  };
  after: {
    budget_paise: number;
    catering_paise: number;
    allocated_paise: number;
    remaining_paise: number;
    within_budget: boolean;
  };
  warnings: string[];
}
