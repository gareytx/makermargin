# MakerMargin Version 0.6 — Product Portfolio Planning

## Status
Planning

## Release theme
Help a maker evaluate a proposed mix of saved products against available labor, machine capacity, working capital, and optional demand limits without inventing sales forecasts or selecting a universal winner.

## Product goal
MakerMargin currently prices individual products, preserves audited saved-product snapshots, records production and cash profiles, and compares products across transparent categories. Version 0.6 extends that foundation from individual-product comparison to user-directed portfolio planning.

The central question is:

> Given the products I may make and the resources I actually have, what would this proposed production plan require and produce?

Version 0.6 evaluates plans created by the user. It does not automatically optimize a product mix or forecast demand.

## Goals
- Let an authenticated user create a temporary planning scenario from two or more eligible saved products.
- Let the user assign planned quantities by complete representative batch.
- Calculate portfolio-level revenue, cash requirements, owner labor, machine occupancy, owner compensation, business profit, and owner economic benefit.
- Compare total resource demand with user-supplied labor, machine, and working-capital constraints.
- Identify over-capacity resources and limiting resources transparently.
- Preserve product-level provenance so every portfolio result can be traced to stored pricing, production, and cash snapshots.
- Preserve the distinction between missing information and explicit zero.
- Fail closed when a product lacks data required for a requested portfolio metric.
- Keep all Version 0.6 scenarios runtime-only until the planning model has been validated through real use.

## Non-goals
- Saving or sharing scenarios.
- Automatic product-mix optimization.
- Demand forecasting or sales prediction.
- Marketplace, Etsy, Shopify, inventory, or order synchronization.
- Multi-user collaboration.
- Multi-stage production scheduling or calendar scheduling.
- Raw-material inventory depletion.
- Purchase-order generation.
- Changes to pricing formulas, viability formulas, saved calculation snapshots, or existing comparison semantics.
- A hidden weighted score or universal best-product recommendation.
- Subscription plans or Stripe integration.

## Core decisions

### Scenario persistence
Version 0.6 scenarios are runtime-only. Refreshing or leaving the page discards the scenario after appropriate unsaved-work protection.

Reason: validate planning semantics before introducing a scenario database schema, migrations, ownership policies, duplication, history, and version migration.

### Planning unit
Planned production is entered in complete representative batches.

- `plannedBatches` must be a nonnegative whole number.
- `plannedSellableProducts = plannedBatches × unitsPerBatch`.
- Products without a valid positive whole-number `unitsPerBatch` are not portfolio-eligible.
- The interface may display resulting sellable-product quantities, but users do not enter fractional batches or arbitrary unit counts in Version 0.6.

Reason: setup labor, fixed batch cash, machine occupancy, and batch economics cannot be modeled reliably when a plan silently splits a representative batch.

### Data source
Each scenario line references one immutable runtime projection of a saved product as loaded when the scenario begins.

- Stored selling price and calculation results remain authoritative.
- Production and cash profiles are read through existing version-aware parsers.
- Version 0.6 never recalculates or rewrites saved products.
- A saved product changed in another tab does not silently mutate the active scenario; the user must reload or restart the scenario.

### Demand limits
Expected sales demand is optional and user-supplied.

- Demand is expressed as a nonnegative whole number of sellable products for the selected planning period.
- Missing means no demand ceiling was supplied, not unlimited demonstrated demand.
- When supplied, planned sellable products above the demand ceiling produce a warning and an excess-production quantity.
- Demand limits do not change financial calculations; they add a market-risk constraint.

### Planning period
The user labels one planning period using a predefined period type:

- Week
- Month
- Craft show or event
- Custom period

The label provides context only. Version 0.6 does not infer dates, working days, demand, or available resources from the period type.

## Primary user flow
1. Open `/plan` while authenticated.
2. Select at least two saved products.
3. Review portfolio-readiness for each product.
4. Enter complete planned batches for selected products.
5. Optionally enter expected demand ceilings per product.
6. Enter available owner labor hours, working capital, and available hours for each represented primary machine.
7. Review portfolio totals, per-product contributions, utilization, overages, bottlenecks, and warnings.
8. Adjust quantities or constraints and recalculate immediately.
9. Leave or reset the scenario; no scenario is persisted.

## Eligibility
A product is portfolio-eligible when the application can safely derive:

- Stored selling price.
- Units per representative batch.
- Total hands-on owner labor per representative batch.
- Total occupied time per represented primary machine per batch, or an explicit no-machine requirement.
- Total cash cost per standard sale.
- Upfront cash per sellable product.
- Fixed upfront cash per batch.
- Owner labor compensation per sellable product.
- Net business profit per sellable product.
- Owner economic benefit per sellable product.

A product may still appear in selection with structured readiness guidance, but it cannot receive planned batches until all required portfolio fields are available and internally consistent.

Existing Version 0.5 data-quality exclusions remain authoritative. Version 0.6 must not bypass labor conflicts, impossible elapsed-time warnings, unsupported snapshot versions, or malformed profiles.

## Scenario input model

```ts
export type PortfolioPlanVersion = "portfolio-plan-v1";
export type PlanningPeriodType = "week" | "month" | "event" | "custom";

export type PortfolioPlanInput = {
  version: PortfolioPlanVersion;
  period: {
    type: PlanningPeriodType;
    label: string;
  };
  products: Array<{
    savedProductId: string;
    plannedBatches: number;
    demandCeilingUnits?: number;
  }>;
  constraints: {
    ownerLaborMinutes?: number;
    workingCapital?: number;
    machineMinutesByKey: Record<string, number | undefined>;
  };
};
```

Validation rules:

- At least two distinct saved products must be selected.
- `plannedBatches` is an integer greater than or equal to zero.
- At least one selected product must have `plannedBatches > 0` before results are presented.
- Demand ceilings are optional nonnegative integers.
- Labor and machine capacities are optional finite values greater than zero when supplied.
- Working capital is optional, finite, and nonnegative when supplied; explicit zero is valid and distinct from missing.
- Machine constraints use stable machine keys and display historical machine labels.
- Unknown product IDs, duplicate product IDs, incompatible products, and non-finite numbers fail validation.

## Per-product plan calculations

```text
planned sellable products
  = planned batches × units per batch

planned revenue
  = planned sellable products × stored selling price

planned owner labor minutes
  = planned batches × total hands-on owner labor per batch

planned occupied machine minutes
  = planned batches × occupied machine minutes per batch

planned total cash cost
  = planned sellable products × total cash cost per standard sale

planned upfront variable cash
  = planned sellable products × upfront cash per sellable product

planned fixed batch cash
  = planned batches × fixed upfront cash per batch

planned working capital requirement
  = planned upfront variable cash + planned fixed batch cash

planned owner labor compensation
  = planned sellable products × owner labor compensation per sellable product

planned business profit
  = planned sellable products × net business profit per sellable product

planned owner economic benefit
  = planned owner labor compensation + planned business profit
```

Product-launch cost is not multiplied by the plan and is not automatically included in working capital. Version 0.6 assumes selected products already exist.

## Portfolio totals
The engine aggregates available product results into:

- Planned batches.
- Planned sellable products.
- Planned revenue.
- Total cash cost.
- Upfront working-capital requirement.
- Total owner labor hours.
- Occupied hours by stable machine key.
- Owner labor compensation.
- Net business profit.
- Owner economic benefit.
- Revenue, profit, labor, machine, and cash contribution by product.

Missing or invalid product data never becomes zero. Because eligibility requires all core portfolio fields, a product with incomplete required data cannot contribute planned batches.

## Constraint analysis

### Owner labor
```text
labor utilization
  = required owner labor minutes ÷ available owner labor minutes
```

The interface reports required hours, available hours, remaining hours or overage, and utilization percentage.

### Machine capacity
For each stable machine key:

```text
machine utilization
  = required occupied machine minutes ÷ available machine minutes
```

Machine-free products create no machine record and consume no machine capacity.

### Working capital
```text
capital utilization
  = required upfront working capital ÷ available working capital
```

When available working capital is explicit zero:

- Zero required cash produces 0% utilization.
- Positive required cash produces an over-capacity result without Infinity or NaN.

### Limiting resources
Among supplied constraints, the primary limiting resource is the valid resource with the highest utilization.

- Exact ties are preserved.
- Near ties use the existing relative 5% policy established by Version 0.5.
- Utilization is not clamped and may exceed 100%.
- A limiting resource is not declared from missing constraints.
- Demand ceilings are reported separately as market-risk limits rather than mixed into production-resource utilization.

## Demand analysis
For each product with a supplied demand ceiling:

```text
excess production units
  = max(0, planned sellable products - demand ceiling units)

unfilled demand units
  = max(0, demand ceiling units - planned sellable products)
```

The interface must not describe a demand ceiling as a forecast, guarantee, or recommendation. It is a user-entered planning assumption.

No revenue or profit haircut is automatically applied to excess units. Results distinguish planned economics from demand-risk warnings.

## Decision presentation
The results should answer four questions in order:

1. What does this plan produce economically?
2. What resources does it require?
3. Where does it exceed supplied capacity or demand assumptions?
4. Which products contribute most to revenue, profit, labor use, machine use, and upfront cash?

The interface may identify category contributors and limiting resources, but it must not declare a universally optimal mix.

## Route and interface
Add authenticated route:

`/plan`

Navigation label:

`Plan production`

Major interface regions:

- Planning-period context.
- Product selection and readiness.
- Planned-batch and optional demand inputs.
- Resource constraints.
- Portfolio summary.
- Capacity and demand warnings.
- Product contribution table.
- Reset scenario action.

The interface must support mobile, tablet, and desktop. Wide contribution tables may scroll horizontally with semantic headers.

## Engine architecture
Create a pure engine such as:

`lib/product-portfolio.ts`

Requirements:

- No database access.
- No authentication access.
- No environment-variable reads.
- No network calls.
- No writes or mutation of saved products.
- Immutable input and output.
- Structured available and unavailable values.
- Deterministic explanations.
- Version-aware compatibility checks.
- No duplicated pricing or comparison arithmetic when an existing trusted helper already supplies the needed value.

Suggested version identifier:

`portfolio-v1`

## Trust and safety rules
Version 0.6 must never:

- Treat missing information as zero.
- Infer demand.
- Infer available labor, machine time, or working capital.
- Convert true base cost into demonstrated cash expenditure.
- Count owner labor compensation as business profit.
- Count allocated machine cost as cash expenditure.
- Double-count supervised machine time as separate elapsed or labor demand.
- Split representative batches silently.
- Recalculate or upgrade saved products silently.
- Persist scenario inputs or results.
- Claim the highest-profit plan is automatically the best business decision.
- Hide products or metrics merely because they are unfavorable.

## Compatibility
Version 0.6 should support only saved products already accepted by the current Version 0.5 comparison and profile parsers.

Historical pricing-only records remain readable elsewhere but are not portfolio-eligible until the user supplies valid production and cash profiles.

Unsupported future schema versions fail closed with structured guidance.

## Testing requirements

### Engine tests
- Valid two-product portfolio totals.
- Multiple products sharing one machine.
- Products using different machines.
- Machine-free products.
- Whole-batch enforcement.
- Zero planned batches.
- Explicit zero cash capacity.
- Missing constraints.
- Over-capacity labor, machine, and cash.
- Exact and relative near-tied bottlenecks.
- Demand ceiling overage and shortfall.
- Missing versus zero values.
- Unsupported and malformed saved products.
- No Infinity, NaN, or mutation.
- Stable deterministic explanations.

### Interface tests
- Authentication requirement.
- Product readiness states.
- Minimum product selection.
- Integer batch validation.
- Optional demand inputs.
- Constraint validation.
- Responsive contribution table.
- Accessible labels, fieldsets, errors, status messages, and keyboard operation.
- Unsaved-work protection.
- Scenario reset.
- No persistence or saved-product writes.

### Regression requirements
- Existing pricing tests pass.
- Existing preset tests pass.
- Existing authentication and saved-product integration tests pass.
- Existing comparison and profile-assistant tests pass.
- Pricing and viability results remain unchanged.
- Snapshot and formula version identifiers remain unchanged.
- Database migrations and generated database types remain unchanged.
- Credential-free anonymous calculator build continues to pass.

## Implementation phases

### Phase 1 — Pure portfolio engine
- Define `portfolio-v1` contracts.
- Convert eligible saved products into plan-ready projections.
- Calculate product and portfolio totals.
- Calculate capacity and demand warnings.
- Add exhaustive unit tests.

### Phase 2 — Planning interface
- Add `/plan` route and navigation.
- Add product selection, batch inputs, demand assumptions, and constraints.
- Present results and structured unavailable guidance.
- Add accessibility and responsive tests.

### Phase 3 — Hands-on validation and hardening
- Test with real MakerMargin products and realistic shop constraints.
- Correct terminology, data-quality gaps, and confusing presentation.
- Preserve formulas and compatibility contracts unless a separately approved migration is required.

## Deferred follow-on work
After Version 0.6 is validated, consider:

- Saved and named scenarios.
- Scenario duplication and history.
- Side-by-side scenario comparison.
- Event inventory planning.
- Explicit new-product launch scenarios.
- User-directed optimization goals.
- Demand ranges and uncertainty analysis.
- Inventory and raw-material requirements.
- Calendar-aware scheduling.

These are not part of Version 0.6.

## Acceptance criteria
Version 0.6 is complete when an authenticated maker can construct a temporary multi-product plan using whole representative batches, inspect transparent economic totals and resource requirements, see supplied-capacity and demand conflicts, trace every result to eligible saved-product data, and leave without any scenario or product being silently persisted or modified.
