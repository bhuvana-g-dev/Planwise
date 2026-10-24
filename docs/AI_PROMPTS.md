# Gemini usage & prompt iterations

## The role of Gemini (and what it never does)

PlanWise AI treats Gemini as a **contextual writing assistant**, not a
calculator or a decision authority.

Gemini **does**:
- Write the plan `overview` narrative.
- Suggest qualitative `recommendations`.
- Surface `risks` and `vendor_questions`.

Gemini **never**:
- Produces any monetary figure. All amounts are computed in Python (integer
  paise) by `budget_service` and re-validated before anything is saved.
- Decides feasibility. Feasibility is proven arithmetically.
- Picks what to cut during replanning. Cuts are ranked deterministically by the
  user's declared preference priorities (`rank_savings_candidates`).

This separation is what makes the replanning **reliable and explainable**: the
numbers are always correct and reproducible, and the LLM can be swapped,
disabled, or rate-limited without affecting correctness.

## Fallback behaviour

If `GEMINI_API_KEY` is unset, or Gemini times out / errors / returns malformed
JSON, the backend uses a deterministic generator and marks the plan
`generated_by = "deterministic"`. The response is always schema-valid.
See `plan_generator.generate_plan` and `gemini_client.generate_json`.

## Prompt iterations

### v1 — "plan the whole event" (rejected)
Asked Gemini for the entire plan including costs and a budget breakdown.
**Problems:** inconsistent arithmetic, totals that didn't sum, occasional budget
overruns presented as "within budget", invented vendor prices. Not trustworthy
for a budget tool.

### v2 — structured JSON, numbers included (rejected)
Forced `response_mime_type=application/json` with an explicit schema. JSON was
now parseable, but the model still fabricated specific prices and sometimes
claimed vendor availability. Numbers still couldn't be trusted.

### v3 — narrative-only, numbers removed (current)
Final system instruction (paraphrased):
> You are an expert event planner. Return STRICT JSON only. Never invent real
> vendor names, prices, or availability. You only give qualitative guidance.

Final user prompt requests exactly four keys — `overview`,
`recommendations[]`, `risks[{description,severity}]`, `vendor_questions[]` — and
explicitly forbids monetary figures. The backend then:
1. Parses JSON defensively (`_extract_json` strips code fences, finds the
   outermost object).
2. Validates each field's type before use; anything malformed is dropped and the
   deterministic content is kept.
3. Keeps all computed numbers from the budget service untouched.

Result: Gemini improves the *words* without ever threatening the *math*.

## Where the code lives

- `backend/app/services/gemini_client.py` — SDK wrapper, JSON extraction, error types.
- `backend/app/services/plan_generator.py` — deterministic plan + Gemini enrichment merge.
- `backend/tests/test_gemini.py` — malformed/timeout/extraction tests.
