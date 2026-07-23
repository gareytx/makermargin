# MakerMargin Version 0.6 Specification Review

## Review status

This document audits `docs/VERSION-0.6-SPEC.md` against `main` at commit
`9ebc5c8665e6283df7799960e66b148e5adf9180`.

The original audit evidence and findings below are preserved. The product
decisions were approved on July 23, 2026, and the authoritative specification
was amended on `docs/version-0.6-portfolio-planning`. Each finding now records
its approved disposition so the original concern remains traceable.

## Executive assessment

The proposed runtime-only, whole-batch portfolio engine is compatible with the
current architecture. The stored pricing result, Version 0.4 production and cash
profiles, Version 0.5 comparison projection, and version-aware snapshot parsers
already provide most of the required trust boundary.

The original audit identified four blocking decisions:

1. how a stored profile proves that a product is explicitly machine-free;
2. whether Version 0.5 data-quality warnings make the whole product ineligible
   or only suppress affected metrics;
3. how machine keys shared by products, and conflicting labels for one key, are
   interpreted;
4. the exact output and failure contract for readiness, validation, and
   structured unavailable values.

Those decisions, plus the other implementation decisions identified by the
audit, are now resolved in the specification. Phase 1 is unblocked within its
approved pure-engine scope. The remaining risks in section 8 are non-blocking
implementation and regression risks.

## 1. Conflicts with existing code semantics

### 1.1 Explicit machine-free state is not stored

The specification requires either occupied time for a represented primary
machine or an **explicit no-machine requirement**. In
`production-profile-v1`, `primaryMachine` is optional. Its absence currently
means only that no primary-machine object is stored; it does not prove that the
user explicitly confirmed the product is machine-free.

The profile assistant can ask `usesMachine: false`, but applying that answer
removes the three machine fields. It does not persist an explicit machine-free
marker. The snapshot parser therefore cannot distinguish:

- a user-confirmed machine-free product;
- a product whose machine details were never supplied; and
- a product whose machine details were removed.

Treating every absent `primaryMachine` as explicit machine-free would conflict
with the specification's missing-versus-zero rule. Requiring proof of an
explicit answer would make all currently machine-free-looking snapshots
ineligible because no such proof exists.

**Blocking decision:** either amend Version 0.6 to accept absence of
`primaryMachine` in a valid `production-profile-v1` as the legacy machine-free
representation, or approve a future versioned profile change. The latter is
outside the current no-migration/no-snapshot-change scope.

**Approved disposition — resolved:** For `production-profile-v1`, absence of
`primaryMachine` is the historical machine-free representation for Version 0.6.
It is explicitly documented as a compatibility inference, not proof of a prior
user confirmation. Provenance must record the legacy absent-machine source. No
snapshot version, migration, or persisted field is introduced.

### 1.2 Version 0.5 warnings are metric-specific, not product-wide exclusions

The specification says Version 0.6 must not bypass labor conflicts or impossible
elapsed-time warnings and appears to make all required fields a product-level
eligibility gate. Current Version 0.5 comparison behavior is narrower:

- A labor-profile mismatch beyond `LABOR_PROFILE_TOLERANCE_MINUTES` suppresses
  `ownerEconomicBenefitPerLaborHour`, but hands-on labor, business profit per
  labor hour, and per-product bottleneck calculations remain available.
- Impossible elapsed time suppresses only the elapsed-time metric. It does not
  suppress labor, machine occupancy, cash, or stored economics.

The portfolio calculations do not use elapsed time, and owner economic benefit
per sellable product does not use production-profile labor. Consequently,
declaring the entire product ineligible is stricter than existing Version 0.5
semantics; allowing it without qualification would conflict with the
specification's stated exclusion.

**Blocking decision:** define an explicit readiness matrix identifying which
warning codes block the whole portfolio line and which block only dependent
metrics. The recommended conservative Version 0.6 rule is to make a labor
mismatch line-blocking because labor capacity is a core portfolio metric, while
treating impossible elapsed time as a surfaced non-blocking warning because
elapsed time is not used by Version 0.6.

**Approved disposition — resolved:** Unsupported or malformed versions are
line-blocking. Missing required production or cash values and labor-profile
mismatches are line-blocking only for positive-batch lines. Impossible elapsed
time is a visible non-blocking warning. Unready products may remain selected
with zero batches, and missing values never become zero.

### 1.3 Limiting-resource semantics differ from Version 0.5

Version 0.6 defines the primary limiting resource as the supplied resource with
the highest utilization. Version 0.5 comparison identifies primary resources by
the lowest number of complete representative batches that a resource can
support. It separately reports near-tied resources by relative utilization
within 5% of the highest utilization.

These methods can name different primary resources because flooring complete
batches loses information. Version 0.6's highest-utilization definition is
appropriate for an already specified portfolio, but it is not the current
Version 0.5 primary-bottleneck definition.

The specification should label this as an intentional portfolio semantic and
reuse only the Version 0.5 relative near-tie tolerance.

**Approved disposition — resolved:** Version 0.6 intentionally uses highest
portfolio utilization. It reuses `BOTTLENECK_NEAR_TIE_TOLERANCE` and
`RANKING_TOLERANCE` but does not reuse Version 0.5's `bottleneckFor`.

### 1.4 Explicit zero working capital is new behavior

Version 0.6 accepts zero working capital and specifies finite results for zero
capacity. Version 0.5 `compareSavedProducts` rejects any supplied labor, machine,
or working-capital capacity that is not greater than zero.

The Version 0.5 bottleneck helper therefore cannot be reused for portfolio
capital utilization. Version 0.6 needs its own documented zero-capacity branch.
This is an intentional difference, not a formula change.

**Approved disposition — resolved:** Explicit zero is valid consistently for
owner labor, every represented machine, and working capital. Zero required
against zero available produces 0% and non-limiting. Positive required against
zero available produces an over-capacity result with no finite ratio. Missing
capacity returns structured unavailable analysis and is excluded from limiting
resources.

### 1.5 Missing primary machine currently means unavailable machine metrics

`deriveOccupiedMachineMinutesPerUnit` and Version 0.5 comparison return
`missing_machine_time` when `primaryMachine` is absent. The Version 0.6
specification instead says machine-free products create no machine record and
consume no capacity.

That behavior is safe only after the explicit machine-free decision in section
1.1 is resolved. It should not be implemented by converting an unavailable
Version 0.5 metric to zero.

**Approved disposition — resolved:** The portfolio projection recognizes absent
`primaryMachine` only through the documented legacy compatibility inference and
records that provenance. It does not reinterpret the Version 0.5 unavailable
machine metric as numeric zero.

### 1.6 Zero-time machine profiles are valid today

`validateProductionProfile` permits a primary machine with zero occupied
minutes, and Version 0.5 treats a zero-demand resource as non-limiting. The
Version 0.6 eligibility wording does not say whether this is a represented
machine consuming zero capacity, malformed data, or equivalent to machine-free.

**Decision needed:** retain current semantics and represent the machine with
zero required minutes, or reject it for portfolio readiness. Retaining current
semantics is least disruptive and preserves explicit zero.

**Approved disposition — resolved:** A valid machine profile with zero occupied
minutes remains a represented machine with zero demand. It is non-limiting and
is neither missing nor machine-free.

### 1.7 Route configuration failure precedes authentication today

The current `/products` and `/compare` server routes first check public Supabase
configuration, then verify claims, then load products through the server-only
service. When cloud configuration is absent, they render a cloud-unavailable
state instead of redirecting to sign-in.

The Version 0.6 phrase “open `/plan` while authenticated” is compatible with the
claims check but does not state whether `/plan` must follow this
configuration-first convention. It should.

**Approved disposition — resolved:** The future route follows `/compare`:
configuration first, verified server claims, encoded `/login?next=%2Fplan`
redirect, server-only owned-product loading, Row Level Security, safe unavailable
and service-error states, and no trust in client-provided ownership.

### 1.8 Version identifiers are ambiguous

The input contract uses `portfolio-plan-v1`, while the engine architecture
suggests `portfolio-v1`. Both can coexist, but the output contract is not
defined and the names are easy to confuse.

**Blocking decision:** define separate constants and locations, for example
`PORTFOLIO_PLAN_INPUT_VERSION = "portfolio-plan-v1"` and
`PORTFOLIO_ENGINE_VERSION = "portfolio-v1"`, and include both in the result.

**Approved disposition — resolved:** The specification defines those two
constants with separate request-contract and engine/result meanings. Every
successful result includes both.

## 2. Calculations that would duplicate trusted helpers

Phase 1 should not reimplement these calculations:

| Version 0.6 need | Existing authority | Required use |
| --- | --- | --- |
| Stored selling price | Parsed `calculation-snapshot-v1.data.result.recommendedPrice`, currently exposed by Version 0.5 as `sellingPrice` | Consume the stored value; never call pricing calculations |
| Owner labor compensation per product | Stored `result.laborCost`, exposed as `ownerLaborCompensation` | Consume the stored value |
| Net business profit per product | Stored `result.netProfit`, exposed as `netBusinessProfit` | Consume the stored value |
| Owner economic benefit per product | Version 0.5 definition `laborCost + netProfit`, exposed as `ownerEconomicBenefit` | Reuse the Version 0.5 metric; do not recreate a competing definition |
| Hands-on owner labor per batch | `deriveActiveLaborMinutesPerBatch` | Call directly and propagate its structured missing result |
| Hands-on owner labor per product | `deriveActiveLaborMinutesPerUnit` | Keep authoritative where a per-product projection is needed |
| Machine time per product | `deriveOccupiedMachineMinutesPerUnit` | Keep authoritative for comparison-compatible projections; do not reinterpret absence as zero |
| Upfront cash per complete batch | `deriveUpfrontCashRequiredPerBatch` | Reuse for each product and multiply its result by planned batches |
| Total cash cost per sale | Validated `cash-profile-v1.cashCostPerSale`, exposed as `totalCashCostPerSale` | Consume, preserving missing versus zero |
| Upfront cash per product | Validated `cash-profile-v1.upfrontCashCostPerUnit`, exposed as `upfrontCashRequiredPerUnit` | Consume, preserving missing versus zero |
| Near-tie threshold | `BOTTLENECK_NEAR_TIE_TOLERANCE` | Import the constant rather than declaring another 5% value |
| Labor mismatch threshold | `LABOR_PROFILE_TOLERANCE_MINUTES` | Import the constant and preserve the Version 0.5 comparison |
| Numeric tie tolerance | `RANKING_TOLERANCE` | Use for floating-point equality before relative near-tie classification |
| Snapshot compatibility | `parsePricingInputSnapshot`, `parseCalculationSnapshot`, current version constants, and `COMPARISON_COMPATIBILITY_MATRIX` | Accept only parsed supported records; never inspect raw JSON as a fallback |

The cleanest Phase 1 trust boundary is to extract or export a public
single-product comparison projection from `lib/product-comparison.ts`, with the
existing `compareSavedProducts` behavior built on the same projection. The
portfolio engine can then consume the authoritative metrics and add only
quantity multiplication, portfolio aggregation, portfolio constraints, and
demand analysis.

Calling `compareSavedProducts` directly is also possible, but it computes
leaders and per-product bottlenecks that Phase 1 does not need and requires a
`generatedAt` value unrelated to a pure plan calculation. A shared exported
projection is more explicit and easier to test without duplicating arithmetic.

## 3. Decision disposition and Phase 1 readiness

All Phase 1 blocking decisions identified by the original audit are resolved:

1. **Machine-free compatibility — resolved.** Absent `primaryMachine` in
   `production-profile-v1` is the legacy representation, with inference
   provenance.
2. **Readiness matrix — resolved.** The specification defines line-blocking,
   positive-batch-only blocking, and visible non-blocking conditions.
3. **Machine identity — resolved.** Equal keys share one pool; different keys
   never merge; normalized-label conflicts for one key block positive batches;
   source labels remain in provenance.
4. **Projection contract — resolved.** The engine accepts immutable, parsed,
   plan-ready projections and never falls back to raw JSON. Phase 1 exports or
   extracts the shared Version 0.5 single-product projection.
5. **Failure contract — resolved.** Request-validation failure,
   product-readiness result, and unavailable optional analysis are separate
   result classes. Non-finite derived arithmetic uses `non_finite_result` and
   never returns partial totals.
6. **Version constants — resolved.** `portfolio-plan-v1` identifies the input
   contract and `portfolio-v1` identifies the engine/result contract.
7. **Zero-time machines — resolved.** They remain represented and non-limiting.
8. **Unknown machine capacity keys — resolved.** They are structured
   request-validation errors.
9. **Missing represented-machine capacity — resolved.** Economics remain
   available; capacity analysis is unavailable with guidance and excluded from
   limiting resources.
10. **Machine labels — resolved.** All historical source labels are preserved;
    normalization is limited to conflict detection and display resolution.
11. **Period labels — resolved.** Labels are trimmed, must contain 1–80
    characters, and are preserved in validated form.
12. **Ordering — resolved.** Product input order, stable-key machine ordering,
    code-priority readiness/warning ordering, resource tie ordering, and
    deterministic explanation templates are specified.
13. **Arithmetic and rounding — resolved.** No intermediate monetary rounding;
    display formatting remains separate.
14. **Overflow — resolved.** Non-finite multiplication or aggregation rejects
    the entire request with `non_finite_result`.
15. **Zero-batch selection — resolved.** Unready products may remain selected
    only at zero batches; at least one ready positive-batch line is required for
    results.
16. **Minimum selection — resolved.** The engine requires at least two distinct
    selected products.

The original item concerning unsaved-work protection remains a Phase 2
interface decision and does not block the approved Phase 1 pure-engine scope.

## 4. Approved amendments to the specification

The original recommendations below were approved and incorporated into
`VERSION-0.6-SPEC.md`:

1. Add a **Version 0.5 readiness matrix**:
   - unsupported input, calculation, or formula versions: line-blocking;
   - missing required production or cash values: line-blocking for positive
     batches;
   - labor-profile mismatch: line-blocking for positive batches in Version 0.6;
   - impossible elapsed time: visible non-blocking warning because elapsed time
     is not a Version 0.6 input;
   - never convert an unavailable metric to zero.
2. State that, for `production-profile-v1` compatibility only, absence of
   `primaryMachine` is treated as the historical machine-free representation.
   Also acknowledge that the current snapshot cannot prove the prior assistant
   answer, and preserve inference provenance without introducing a snapshot
   change.
3. State that equal machine keys identify one shared capacity pool. Reject a
   shared key with conflicting normalized meaning unless a deterministic,
   user-visible resolution rule is approved. Preserve every source label in
   provenance.
4. Retain zero occupied machine minutes as explicit zero and mark the resource
   non-limiting; do not treat it as a missing machine or divide by it.
5. Identify highest utilization as a Version 0.6 portfolio rule distinct from
   Version 0.5 complete-batch capacity. Reuse
   `BOTTLENECK_NEAR_TIE_TOLERANCE` and `RANKING_TOLERANCE`.
6. Define the zero-capacity result for every resource, not only working capital:
   allow explicit zero for all capacities and apply the same
   `0 required => 0%`, `positive required => over-capacity without a ratio`
   result shape.
7. Replace “No duplicated pricing or comparison arithmetic” with an explicit
   requirement to consume a shared Version 0.5 product-metric projection and
   the exported Version 0.4 profile helpers listed in section 2.
8. Define immutable projection and result contracts, including readiness reason
   codes, provenance (`savedProductId`, stored snapshot versions, formula
   version, machine key and source label), deterministic ordering, and
   structured validation errors.
9. Define separate input and engine constants and require both in the output.
10. State that `/plan` follows the `/compare` route convention: public cloud
    configuration check, verified server claims, encoded
    `/login?next=%2Fplan` redirect, server-only owned-product loading, safe
    service errors, and no client-side authority for ownership.
11. State that all arithmetic uses validated finite stored numbers, performs no
    intermediate currency rounding, fails closed on non-finite results, and
    delegates display rounding to the existing formatting layer.
12. Define zero-batch readiness, reject unknown machine constraint keys,
    validate trimmed 1–80 character period labels, and require deterministic
    output ordering.

## 5. Proposed Phase 1 file and test plan

### Files

| File | Planned responsibility |
| --- | --- |
| `lib/product-comparison.ts` | Export the existing single-product trusted metric projection, plan-ready compatibility provenance, and Version 0.5 compatibility/data-quality evaluation without changing formulas or comparison results |
| `lib/product-comparison.test.ts` | Prove the exported projection is the same projection used by `compareSavedProducts`; retain all Version 0.5 regression behavior |
| `lib/product-portfolio.ts` | Accept immutable parsed plan-ready projections; define `portfolio-plan-v1` and `portfolio-v1` contracts; validate requests; evaluate readiness; aggregate planned quantities; analyze capacities and demand; produce deterministic provenance and explanations |
| `lib/product-portfolio.test.ts` | Exhaustive Phase 1 unit and compatibility tests |

No route, component, server action, persistence service, migration, database
type, calculation formula, or dependency belongs in Phase 1.

### Test groups

1. **Projection and eligibility**
   - two eligible `pricing-input-v2`/`pricing-v1` products;
   - each missing required production and cash field;
   - unsupported input, calculation, formula, production-profile, and
     cash-profile versions;
   - labor mismatch and impossible elapsed-time policy;
   - historical `pricing-input-v1`;
   - machine-free representation;
   - missing supervision;
   - zero labor, zero cash, and zero machine time;
   - provenance versions and historical labels.
2. **Input validation**
   - fewer than two distinct IDs, duplicates, unknown IDs;
   - negative, fractional, non-finite, and excessive batch quantities;
   - all-zero plan and allowed zero-batch selections;
   - demand ceiling missing, zero, fractional, negative, and non-finite;
   - missing, zero, negative, and non-finite capacities according to the
     approved policy;
   - unknown machine keys and conflicting labels;
   - period types and label boundaries.
3. **Product calculations**
   - sellable products, stored revenue, stored cash cost, reused batch upfront
     cash, reused owner labor, stored owner compensation, stored business
     profit, and reused owner economic benefit;
   - fixed batch cash applied once per planned batch;
   - launch cost excluded;
   - no allocated machine cost treated as cash;
   - no supervised time double count.
4. **Portfolio aggregation**
   - shared and distinct machines;
   - machine-free and zero-time machine products;
   - zero-batch lines;
   - contribution totals reconcile exactly with portfolio totals;
   - deterministic product and machine ordering;
   - finite overflow failure and no `NaN`/`Infinity`.
5. **Constraints and demand**
   - missing constraints remain unavailable;
   - under, exactly at, and over labor/machine/capital capacity;
   - consistent explicit-zero behavior for labor, every machine, and capital;
   - missing represented-machine capacity preserves economics and returns
     unavailable optional analysis;
   - unknown machine constraint keys reject the request;
   - exact ties using numeric tolerance and relative near ties using the
     authoritative 5% constant;
   - utilization above 100% is not clamped;
   - demand overage, shortfall, exact match, and no ceiling;
   - demand warnings do not alter economics.
6. **Purity and determinism**
   - no mutation of products, projections, plan input, or constraints;
   - detached output;
   - repeated equivalent requests produce equal results and explanations;
   - no database, authentication, environment, clock, or network dependency.
7. **Regression**
   - all existing calculation, preset, profile, snapshot, comparison,
     profile-assistant, authentication, and saved-product tests pass;
   - formula and snapshot version constants remain unchanged.

## 6. Historical saved-product compatibility risks

1. **`pricing-input-v1` has no profiles.** It remains parseable and usable
   elsewhere, but cannot satisfy portfolio labor, machine, and cash readiness.
   It must receive structured guidance and must never be upgraded automatically.
2. **Unsupported raw snapshots parse to `null`.** `SavedProduct` retains raw JSON
   for duplication, but Version 0.6 must not inspect raw JSON to recover partial
   values. Doing so would bypass version-aware fail-closed behavior.
3. **Calculation/database formula disagreement parses to `null`.** Portfolio
   readiness must use the parsed calculation snapshot and database
   `formulaVersion`, not one independently.
4. **Optional profile values preserve missing versus zero.** Empty cash profiles
   are not serialized, while explicit zero fields are preserved. Portfolio code
   must test property availability and must not use truthiness.
5. **Profile edits write `pricing-input-v2` without recalculating pricing.**
   Production and cash provenance may therefore have a different edit time from
   the stored calculation. Version 0.6 should identify snapshot versions, not
   imply one atomic calculation time for every profile field.
6. **Machine keys are stable only within current editing behavior.** The service
   preserves an existing key when a machine label is edited, while a newly
   supplied machine key is normalized from a label. Equal keys across products
   are not backed by a separate machine entity, so accidental cross-product key
   collisions are possible.
7. **Absent machine provenance remains inferential.** Existing snapshots have no
   explicit marker separating confirmed machine-free products from incomplete
   profiles. The approved compatibility rule accepts absence as the historical
   machine-free representation, but output must disclose that inference.
8. **Malformed nested profiles invalidate the entire input snapshot.** A
   malformed production or cash profile causes `parsePricingInputSnapshot` to
   return `null`, making otherwise readable pricing inputs unavailable through
   the supported parser. Version 0.6 must surface an unsupported/malformed
   readiness result rather than salvage fields.
9. **Stored calculation results are authoritative historical values.** The
   portfolio engine must not call `calculatePricing`, `calculateViability`, or
   `createCurrentSnapshots`, even if current inputs would produce different
   results.
10. **Runtime projection staleness is intentional.** A scenario must clone or
    otherwise detach its initial plan-ready projection. A later saved-product
    edit must not mutate or refresh the active result silently.

## 7. Existing helpers that should remain authoritative

### Version 0.4 profile and snapshot authority

- `validateProductionProfile`
- `validateCashProfile`
- `hasCashProfileValues`
- `deriveActiveLaborMinutesPerBatch`
- `deriveActiveLaborMinutesPerUnit`
- `deriveOccupiedMachineMinutesPerUnit`
- `deriveUpfrontCashRequiredPerBatch`
- `normalizeMachineKey` for creating keys, but not for silently rewriting
  historical keys
- `parsePricingInputSnapshot`
- `parseCalculationSnapshot`
- `CURRENT_PRICING_INPUT_SNAPSHOT_VERSION`
- `CURRENT_CALCULATION_SNAPSHOT_VERSION`
- `CURRENT_FORMULA_VERSION`
- the `SavedProduct` parsed-versus-raw snapshot boundary

### Version 0.5 comparison and data-quality authority

- the stored metric meanings exposed by the Version 0.5 product projection:
  selling price, owner labor compensation, net business profit, owner economic
  benefit, total cash cost, and upfront cash;
- `COMPARISON_COMPATIBILITY_MATRIX`;
- `LABOR_PROFILE_TOLERANCE_MINUTES`;
- `BOTTLENECK_NEAR_TIE_TOLERANCE`;
- `RANKING_TOLERANCE`;
- structured available/unavailable metric semantics and reason codes;
- the prohibition on treating allocated machine cost as cash, owner labor
  compensation as business profit, or missing data as zero;
- deterministic, factual explanations without a universal winner.

Version 0.5's per-product `bottleneckFor` implementation should **not** be
authoritative for portfolio constraint analysis. It uses single-batch demand,
rejects zero working capital, and chooses primary resources by floored
complete-batch capacity. Version 0.6 should own portfolio-level utilization
while importing the shared tolerances and preserving the trust rules above.

## 8. Remaining non-blocking implementation risks

1. **Legacy machine-free inference can overstate readiness.** A historically
   incomplete absent-machine profile is indistinguishable from a confirmed
   machine-free profile. Required provenance and visible guidance mitigate but
   cannot remove this limitation without a future versioned data decision.
2. **Machine-key collisions are possible.** Keys are strings rather than
   references to persisted machine entities. The approved normalized-label
   conflict rule catches conflicting labels for one key, but identical labels
   can still conceal an accidental collision.
3. **Display resolution needs one deterministic template choice.** The
   specification fixes ordering and provenance requirements but leaves the exact
   canonical display-label template to implementation, provided all source
   labels remain available and conflicts block positive batches.
4. **Structured code taxonomy must remain stable.** Phase 1 must define the
   concrete error, readiness, warning, and unavailable-analysis code unions in a
   way that preserves the approved categories without conflating them.
5. **Floating-point accumulation needs boundary tests.** The no-intermediate-
   rounding policy is approved, but large finite values and long product lists
   still require explicit overflow and reconciliation tests.
6. **Shared projection extraction carries regression risk.** Refactoring
   Version 0.5's internal projection must leave all comparison output, warning,
   ranking, and bottleneck behavior unchanged.
7. **Zero-capacity results need a ratio-free representation.** Positive demand
   against zero capacity cannot use the normal finite utilization field, so the
   result contract and presentation must clearly express over-capacity without
   manufacturing a percentage.
8. **Unsaved-work protection remains Phase 2 work.** Its dirty-state and
   navigation semantics are intentionally outside Phase 1 and must be decided
   before the interface is complete.

## Validation performed for this review

- Confirmed the audit base: local `main` and `origin/main` both resolve to
  `9ebc5c8665e6283df7799960e66b148e5adf9180`.
- Read the authoritative Version 0.6 specification and the current comparison,
  profile, profile-assistant, snapshot, saved-product service, authentication,
  proxy, navigation, `/products`, and `/compare` implementations.
- Reviewed the associated profile, snapshot, comparison data-quality,
  authentication-navigation, and route tests.
- Confirmed this review proposes documentation changes only and does not alter
  application code, formulas, migrations, generated database types, or
  dependencies.
- Confirmed every original blocking finding has an approved disposition and is
  retained with its audit evidence.
- Confirmed Phase 1 is unblocked only for the pure-engine, shared-projection,
  contract, readiness, aggregation, capacity, demand, provenance, warning, and
  unit-test scope defined by the amended specification.
