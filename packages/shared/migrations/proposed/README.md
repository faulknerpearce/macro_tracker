# Proposed migrations (not applied)

Drafted 2026-11-15 from a review of the live Supabase project (Input/Output). See the
"Body IO — Database review & optimization plan" doc for the reasoning.

| File | What | Risk |
| --- | --- | --- |
| 0019_fix_drift_security_rls.sql | Applies missing 0017, rewrites RLS for performance, adds FK indexes, locks down SECURITY DEFINER functions | Low; policies are behavior-equivalent |
| 0020_food_catalog.sql | `foods`, `food_servings`, entry links to foods, `logged_at`, recipe totals view | Low; additive, nothing dropped |
| 0021_personalization.sql | `nutrients`, `user_nutrient_goals`, net target, objectives, `body_measurements`, `daily_metrics` | Low; additive + backfills |
| 0022_data_quality.sql | Decimal macros, nullable optional nutrients, updated_at triggers | Medium; type change needs client check |
| 0023_unified_shares.sql | One `shares` table, backfilled | Low; old tables kept |
| 0024_integrations_estimates_weight.sql | Tracker connections, activity source/external_id, entry log method + confidence, weight history + check-in cadence | Low; additive. Required by the Google Health sync and new MCP tools |

Before applying anywhere:
1. `supabase db pull` to capture production's real schema as a baseline (prod has drifted from 0001–0018).
2. Create a Supabase branch, apply in order, run the web + MCP test suites against it.
3. Regenerate types (`packages/shared/src/database.ts`).
