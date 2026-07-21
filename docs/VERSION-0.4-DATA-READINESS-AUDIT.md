# MakerMargin Version 0.4 Data-Readiness Audit

Status: Planning audit

Baseline: `main` at `0b11563`

Related specifications: `VERSION-0.3-SPEC.md` and `PRODUCT-INTELLIGENCE-ROADMAP.md`

## Executive Finding

The current system reliably prices one sellable product in one standard sale at a time. One four-piece coaster set, one journal, and one digital download each count as one sellable product; components inside a set do not. It stores enough data for historical selling price, allocated owner labor and machine costs, net profit, and profit margin. It does not store enough information to make honest claims about cash required, batch throughput, elapsed time, or production bottlenecks.

The existing `saved_products` table can remain unchanged. Its versioned JSONB columns are the appropriate extension point. Before Version 0.3 Save ships, however, the application-level snapshot contract should add an independent input/snapshot schema version and an explicit pricing basis. This prevents today's aggregate fields from becoming permanently ambiguous. Detailed production and batch fields can remain optional and be introduced during Version 0.4.

## Current Model

`PricingInput` contains material, packaging, other, waste, machine-rate/time, labor-rate/time, fees, shipping, and desired-margin inputs. `calculatePricing` is the only pricing engine. Its current formulas must not be redefined by this audit.

The UI describes one product and the presets populate one `PricingInput`. The approved basis is **one sellable product in one standard sale**, encoded as `per_sellable_product`. The slate set is one sellable product, not four comparison units. Batch size means the number of sellable products produced in one production run and is not an order quantity.

`CalculationSnapshot` stores `PricingResult`, calculation time, and warnings. `saved_products` separately stores the complete input JSON, result snapshot JSON, and formula version. The migration verifies that both JSON values are objects but deliberately does not constrain their internal shape.

## Comparison Metric Audit

In this table, “new persisted field” means a new field in a versioned JSON snapshot unless explicitly stated otherwise. It does not imply a new database column.

| Metric | Exact proposed definition | Required source inputs | Current / derivable | Present ambiguity | New calculator input | New persisted field | Versioning implications | Action before Version 0.3 Save |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Selling price | Price charged for one sellable product in one standard sale, excluding separately charged shipping | Historical `recommendedPrice`; `per_sellable_product` basis | Calculated and snapshot-ready | None after approved basis is encoded | No | Pricing-basis metadata | Use stored result and formula version; never silently recompute | Require the approved basis in input and calculation snapshot v1 |
| Total cash cost | Actual cash expenses associated with producing and completing one standard sale | Classified materials, packaging, consumables, fulfillment, and other actual cash expenses | Not reliable | `otherCost` is unclassified; payment timing is not represented | Yes, cost classification/basis | Yes | Definition belongs to comparison/input schema version | Do not label `trueBaseCost` as cash cost; record explicit basis/version |
| Owner labor compensation | `active owner labor hours * owner target hourly rate` for one sellable product | Active owner labor minutes and labor hourly rate | `laborCost` is calculated under current aggregate-time semantics | Labor activity categories and batch allocation remain ambiguous | Eventually split labor fields | Yes | Historical `laborCost` remains owner compensation under v1; paid-employee labor is separate | Label v1 value “owner labor compensation”; do not infer active labor when unknown |
| Machine cost | Allocated economic machine cost for one sale: machine minutes times hourly allocation rate | Machine minutes and hourly rate | Calculated | Rate does not say cash operating cost versus depreciation/overhead allocation | Add cost classification or separate operating/allocation rates | Yes | Preserve stored v1 `machineCost`; newer meanings require schema fields/version | Document it as allocated machine cost, not next-run cash |
| Net business profit | Selling price minus hard cost, waste, machine allocation, owner labor allocation, included shipping, and selling fees | Stored `PricingResult` | Calculated | It is profit after imputed owner labor and machine allocation, not cash contribution | No | No | Compare stored snapshots only with visible formula-version context | Retain exact v1 definition and name |
| Profit margin | `net business profit / selling price * 100` | Selling price and net business profit | Calculated | None once selling-price basis is explicit | No | No | Historical value belongs to its formula version | Retain stored value |
| Owner economic benefit | Owner labor compensation plus net business profit | Labor compensation and net profit | Reliably derivable from stored v1 result, subject to labor meaning | Aggregate labor semantics | No for v1; split fields improve later value | Optional derived metric/version metadata | Derive without mutating historical snapshot; identify source formula version | Define and test this derived v1 metric before comparison implementation |
| Active labor minutes | Hands-on owner minutes that consume labor capacity for one sale, including the sale's share of setup and finishing | Setup, per-unit active labor, finishing, batch size | Not calculated or reliable | Current `laborMinutes` has no activity or basis distinction | Yes | Yes | Old snapshots show unavailable, not `laborMinutes` relabeled | Do not equate current labor minutes with active labor in saved schema semantics |
| Machine minutes | Machine-occupied minutes attributable to one sale | Setup/run times and batch quantity | Present as aggregate `machineMinutes` | Per-sale versus per-batch and machine identity are unstated | Yes for detailed production profile | Yes | V1 can display “recorded machine minutes,” with limitations | Persist current aggregate unchanged and mark its basis explicitly |
| Total elapsed production time | Wall-clock duration from production start to ready-for-fulfillment, using an overlap-aware process model | Setup, active, supervised/unsupervised machine, finishing, passive waits, dependency/overlap rules | Not derivable | Current labor plus machine time may overlap; passive time absent | Yes | Yes | Only schema versions with sufficient process data can calculate it | Do not persist or display the sum of current time fields as elapsed time |
| Business profit per labor hour | `net business profit / active owner labor hours`; unavailable when active labor is missing or zero | Net profit and active labor minutes | Arithmetic is possible with `laborMinutes`, but not semantically reliable | Current labor meaning is undefined | Yes | Active-labor breakdown | Derived metric definition/version must remain stable | Show unavailable for v1 unless user explicitly supplies active-labor semantics later |
| Owner economic benefit per labor hour | `(owner labor compensation + net business profit) / active owner labor hours`; unavailable at zero/missing hours | Labor compensation, net profit, active labor minutes | Same limitation as above | Same | Yes | Same | Same | Do not reuse current `effectiveHourlyEarnings`; it divides profit by labor plus machine time |
| Business profit per machine hour | `net business profit / occupied machine hours`; unavailable when machine time is missing or zero | Net profit and machine minutes | Derivable for products with positive recorded machine time | Batch basis and machine identity unknown | No for a limited v1 metric; yes for robust capacity use | Production profile | Treat zero-machine products as not applicable, never infinity | Permit a clearly qualified recorded-time metric; exclude N/A values from rankings |
| Units per labor hour | Sellable units completed divided by active owner labor hours for the same batch | Batch output quantity and active labor by batch | Not derivable | No quantity or batch basis | Yes | Yes | Requires production-profile schema | Add during v0.4; old records remain unavailable |
| Units per machine hour | Sellable units completed divided by occupied machine hours for the same batch | Batch output and machine time by batch | Not derivable | No quantity/batch basis; zero-machine products are N/A | Yes | Yes | Requires production-profile schema | Add during v0.4; never substitute one unit |
| Cash required per unit | Upfront cash the maker funds per sellable product before customer payout, excluding owner compensation, allocated machine cost, percentage fees, and post-sale costs | Classified pre-payout cash outlay and sellable output quantity | Not derivable | Current costs lack cash timing and classification | Yes | Yes | Definition and cost schema must be versioned | Do not derive from `trueBaseCost` |
| Cash required per batch | Upfront cash funded for one production run: per-product upfront cash times batch size plus fixed pre-payout batch cash | Batch size; fixed-batch and per-product cash; payment timing | Not derivable | No batch or cash classification | Yes | Yes | Requires batch/cost schema | Add during v0.4; missing timing or classification yields unavailable |
| Break-even unit count | Smallest whole number of sellable products whose contribution margin recovers explicitly assigned product-level fixed costs: `ceil(assigned fixed product cost / contribution margin per sellable product)`; unavailable when fixed cost is missing or contribution is nonpositive | Selling price, unit-variable costs, and assigned design labor, tooling, jigs, samples, photography, listing setup, or other launch costs | Not derivable | No fixed/variable split or assigned product-launch costs | Yes | Yes | Store assigned scope and inputs, not only output; exclude general overhead and sunk costs unless explicitly assigned | Add as optional Version 0.4 data; missing fixed cost yields unavailable, never zero |
| Primary production bottleneck | Resource or constraint with the highest utilization against an explicit available capacity for the proposed batch/period | Resource demands, available labor/machine/cash capacity, supervision, overlap, batch size | Not calculated or derivable | No capacities, machine identity, supervision, overlap, or batch data | Yes | Yes | Model/version must be visible; missing data yields unavailable | Do not infer from whichever current time/cost number is largest |

## Production-Time Audit

| Concept | Current status | Finding |
| --- | --- | --- |
| Setup labor | Missing | Cannot separate one-time batch setup from repeated work. |
| Active per-unit labor | Ambiguous | `laborMinutes` is an undifferentiated aggregate. |
| Finishing labor | Missing | May be included in aggregate labor, but this cannot be established. |
| Supervised machine time | Missing | No indication whether machine runtime also consumes labor capacity. |
| Unsupervised machine time | Missing | Cannot separate unattended capacity occupation from hands-on work. |
| Passive curing/drying/cooling/waiting | Missing | No passive-time field exists. |
| Total elapsed production time | Missing and not derivable | Labor, machine, and passive stages may overlap. Summing labor and machine minutes is not valid. |
| Batch-level time | Missing | No batch quantity or setup/run distinction exists. |
| Per-unit time | Ambiguous | UI implies one product calculation, but time basis is not encoded. |
| Overlapping labor and machine activity | Missing | No operation sequence, overlap, or supervision model exists. |

The current `effectiveHourlyEarnings` is `netProfit / ((machineMinutes + laborMinutes) / 60)`. It is a retained Version 0.2 pricing result, not active-labor earnings and not elapsed-time earnings. Version 0.4 must not use it as a substitute for either comparison metric.

### Minimum production profile

A small, optional and independently versioned Version 0.4 production profile can describe one representative batch. The following names are proposed, not finalized:

- `unitsPerBatch`
- `setupLaborMinutesPerBatch`
- `activeLaborMinutesPerUnit`
- `finishingLaborMinutesPerUnit`
- `machineMinutesPerBatch` or per unit
- `supervisedMachineMinutes`
- `passiveWaitMinutes`
- `totalElapsedMinutesPerBatch`
- `primaryMachineKey` as a stable resource key and `primaryMachineLabel` as its historical display-label snapshot
- `fixedProductLaunchCost`
- `upfrontCashCostPerUnit`
- `fixedCashCostPerBatch`
- an explicit overlap model

Active labor and machine time are separate capacity measures. Supervised machine time can consume both. Passive waiting consumes neither active labor nor, unless explicitly occupied, machine capacity. Total elapsed time cannot be a blind sum and must be explicitly supplied or calculated by a later production-stage model; no hidden overlap assumption is allowed.

## Cost Audit

| Concept | Current status | Finding |
| --- | --- | --- |
| Material cash cost | Likely but not guaranteed | `materialCost` has no explicit cash or basis classification. |
| Packaging cash cost | Likely but not guaranteed | `packagingCost` is undifferentiated per current sale. |
| Other cash cost | Ambiguous | `otherCost` could contain cash, overhead allocation, or both. |
| Shipping paid by maker | Explicit | `shippingCostIncluded` is zero when the customer pays separately; timing remains fulfillment-stage. |
| Marketplace fixed fees | Explicit in pricing | Paid when listing/selling depending on marketplace; not necessarily upfront production cash. |
| Marketplace percentage fees | Explicit in pricing | Calculated from selling price; a sale-related outflow, not production working capital. |
| Owner labor compensation | Economically modeled | `laborCost` uses time times desired hourly rate; it is not proof of a cash payment. |
| Machine cost | Economically modeled | `machineCost` uses time times a rate. The rate's composition is not recorded. |
| Machine depreciation/operating allocation | Ambiguous | The single machine rate may mix depreciation, energy, consumables, maintenance, and overhead. |
| True cash outlay | Missing | `trueBaseCost` includes owner labor and machine allocation, so it is not a cash-outlay measure. |
| Working-capital requirement | Missing | Payment timing, inventory purchase quantity, batch size, and post-sale expenses are absent. |
| Fixed batch cost | Missing | No fixed-versus-variable or batch-level classification. |
| Per-unit variable cost | Ambiguous | Current costs are for a sellable product/sale, not explicitly for each physical unit in a batch. |

Current “machine cost” is an allocated economic cost. Nothing in `PricingInput` proves that its hourly rate is cash required for the next production run. Version 0.4 should split or classify machine operating cash (for example, consumables and incremental energy) separately from depreciation/overhead allocation while preserving the historical v1 field unchanged.

For comparison terminology:

- **Total cash cost** is actual cash expense associated with producing and completing a sale.
- **Upfront cash requirement** is cash funded before customer payout. It includes direct materials, packaging, consumables, and fulfillment expenses paid before payout. It excludes owner labor compensation, allocated machine cost, marketplace percentage fees, and costs paid only after sale. Exact payment timing may require later configuration.
- **Economic cost** combines cash expense with non-cash economic allocations used to judge whether the product is worth producing.

Paid-employee labor is a future business cash expense and is not owner compensation or part of owner economic benefit. Version 0.4 initially compares owner-operated production. Machine allocation must never be presented as cash required, working capital, or demonstrated current operating cash; electricity, consumables, maintenance, and outsourced machine work require separate future modeling.

## Batch-Economics Audit

The current calculator consistently computes one price for one sellable product or sale. Presets may internally embed amortized assumptions: the digital print allocates creation labor over expected sales, and the slate product is a four-piece set. Because that amortization and quantity context lives only in prose, the stored numeric model can be inconsistently mixed across per-sale, per-physical-unit, and implied-batch assumptions.

Honest batch metrics require:

- A definition of `unit` as one sellable product, distinct from physical pieces in a set.
- Output quantity per batch and expected usable units after scrap.
- Setup costs and time per batch separated from per-unit variable costs and time.
- Active labor and occupied machine time for the same batch basis.
- Packaging cost associated with one sellable product.
- Shipping representing one standard sale. Batch size is production quantity, not order quantity; multi-product and multi-quantity orders are deferred.
- Fixed-cost recovery scope and unit contribution margin for break-even.

“Best batch economics” should be a transparent category explanation, not a score. It may compare profit per completed batch, owner benefit per active labor hour, cash required per batch, and setup cost per usable unit, with each leader reported separately when those measures disagree.

## Transparent Bottleneck Model

Version 0.4 should model resource demand and capacity separately:

1. Calculate active labor demand for the chosen batch.
2. Calculate occupied time for the optional primary machine identified by its stable resource key; retain its historical display label.
3. Count supervised primary-machine time against both machine and labor capacity; count unattended time against machine capacity while retaining its elapsed duration.
4. Treat passive wait as lead time and work-in-progress exposure, not automatically as labor or machine demand.
5. Calculate upfront cash demand using only classified, pre-revenue cash outflows.
6. Divide each demand by a user-selected available capacity for the relevant planning period. The highest valid utilization is the primary constraint; ties and near-ties should be reported.

Minimum responsible data therefore includes batch size, active labor demand, a primary-machine resource key and historical label, its occupied time, supervision state, upfront cash demand, and the user's available labor hours, primary-machine hours, and cash ceiling. Passive duration is additionally required to discuss lead-time bottlenecks. Without both demand and capacity, MakerMargin may report resource intensity but must say that a primary bottleneck cannot be determined. Multiple-machine routing remains deferred.

This model has no aggregate score. Its output should state the evidence, such as “Laser capacity is limiting: this batch uses 82% of available laser time versus 44% of labor capacity and 36% of the cash budget.”

## Minimum Data-Model Extension

### A. Required before Version 0.3 Save implementation

1. Add a code-owned `PricingInputSnapshotVersion` independent of `formula_version` and wrap input data in a `PricingInputSnapshot` containing its schema version, `per_sellable_product` basis, and data.
2. Add a code-owned `CalculationSnapshotVersion` and require `CalculationSnapshot` to contain its schema version, matching basis, and data.
3. Keep the saved record's top-level `formula_version` authoritative. The calculation snapshot need not repeat it; if a future format does, runtime parsing must require exact consistency.
4. Parse and validate both JSON objects at application boundaries by supported schema version and basis. Malformed and unsupported versions fail safely.
5. Preserve missing versus zero: a missing optional value means unavailable; numeric zero means known zero. Never synthesize a default or rewrite historical JSON during parsing.
6. Keep formula version and both snapshot schema versions distinct: formula version describes arithmetic; schema versions describe data shape and meaning.

These are application snapshot-contract changes, not migration changes. They should precede the first production save so the meaning of the first historical rows is explicit.

### B. Safe to add during Version 0.4

- Optional, versioned production profile with the proposed batch quantity, labor breakdown, primary-machine key/label snapshot, supervision, passive time, explicit elapsed time, fixed launch cost, and cash fields listed above.
- Optional classified cash-cost profile with per-sale, per-unit, and per-batch bases and pre-revenue timing.
- Optional comparison constraint profile for available labor hours, machine hours by type, and working-capital ceiling.
- A versioned comparison engine that emits values or structured unavailable reasons.
- Explicit observed elapsed time if an operation/dependency model is deferred.

These fields belong in `pricing_inputs` or a related versioned snapshot envelope. Derived comparison outputs need not become authoritative database columns; they can be recomputed from stored, versioned source snapshots. If cached, they require their own comparison-engine version and cannot replace original data.

### C. Deferred to Version 0.5 or later

- Demand forecasts and marketplace synchronization.
- Weekly capacity calendars and multi-machine scheduling.
- Inventory optimization and purchasing recommendations.
- Seasonal/product-mix optimization.
- Automated recommendations or weighted scores.
- Full operation graphs if validated user needs exceed the simpler Version 0.4 model.

## Database-Schema Assessment

The existing `saved_products` schema can remain. `pricing_inputs` and `calculation_snapshot` are JSONB objects, and `formula_version` already preserves arithmetic lineage. No new top-level comparison columns or migration edit is required for the proposed minimum.

Application validation must become stricter than the database's object-shape checks. If future querying or indexing of a specific comparison field becomes operationally necessary, a generated column or JSON expression index can be proposed in a new migration after usage is measured. The committed Phase 1 migration must not be rewritten.

## Backward Compatibility

- Every input and calculation snapshot has an explicit schema version; `formula_version` remains separate.
- New production and cash fields are optional for historical rows and required only for metrics that depend on them.
- Missing means unavailable. Zero is accepted only when explicitly stored and valid for that field.
- The comparison engine returns a structured missing-input reason, displays the metric as unavailable, and excludes it from leader rankings.
- Historical stored input/result snapshots remain visible under their original versions.
- Unknown versions may display preserved values but must not be interpreted or ranked by an incompatible engine.
- Recalculation with the current formula is explicit and creates a preview. It does not fill absent production/batch facts, substitute defaults, or mutate a row.
- Saving an explicitly accepted recalculation may update the pricing snapshot/version according to the Version 0.3 flow, but it must not fabricate new comparison inputs.
- No formula, preset, schema, or comparison-engine release silently mutates historical rows.
- Products with different formula versions may appear together. Rank only metrics documented as semantically compatible for those formula/snapshot versions; exclude incompatible metrics, show a compatibility warning, and offer explicit current-formula recalculation without silent normalization or mutation.

## Recommended Implementation Sequence

1. Merge the Product Intelligence roadmap and audit.
2. Complete Version 0.3 Phase 2 authentication foundation.
3. Implement versioned input and calculation snapshot contracts.
4. Implement Version 0.3 saved-product service and CRUD interface.
5. Add optional Version 0.4 production and cash profiles.
6. Build the Version 0.4 comparison engine.
7. Build the Version 0.4 comparison interface.
8. Validate the comparison model before portfolio recommendations.

## Remaining Implementation Detail

No unresolved product-scope decision blocks publication of this roadmap and audit. Version 0.4 implementation still must validate the exact optional production-profile field names, choose between explicitly supplied elapsed time and a later stage model, define the machine-resource-key format, and document the metric-compatibility matrix. These are implementation details constrained by the approved rules above, not permission to introduce hidden defaults or change historical formulas.

## Major Risks

- **False precision:** Reusing aggregate v1 time fields under new labels would produce plausible but invalid efficiency rankings.
- **Cash/profit conflation:** `trueBaseCost` includes imputed labor and machine allocations and cannot represent working capital.
- **Unit ambiguity:** A sale, a set, a physical piece, and a batch are different quantities; silent conversion would corrupt comparisons.
- **Overlap error:** Adding labor, machine, and passive durations can overstate elapsed time and understate capacity.
- **Historical drift:** Formula version alone does not describe evolving JSON meaning; independent schema versions are required.
- **Sparse comparisons:** Historical products will legitimately have unavailable metrics. The UI must remain useful without pressuring users into invented defaults.
- **Cross-version rankings:** Stored numeric values may cease to be semantically comparable after a formula change even though each remains historically correct.
