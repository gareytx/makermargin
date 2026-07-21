# MakerMargin Product Intelligence Roadmap

## Product Direction

MakerMargin will evolve from a product-pricing calculator into a decision-support platform for small product-based makers.

The platform should progressively answer three questions:

1. Can this product make money?
2. Is this product worth making?
3. Which product is the best use of the maker's limited time, equipment capacity, and working capital?

Version 0.3 establishes the saved-product and historical-calculation foundation required for later comparison and portfolio-analysis features.

### Comparison Basis

The comparison unit is one sellable product in one standard sale. One four-piece coaster set, one journal, and one digital download each count as one sellable product. A component inside a set is not a comparison unit. Versioned snapshots identify this basis as `per_sellable_product`.

Batch size is the number of sellable products produced in one production run. It describes production quantity, not customer order quantity. Packaging cost applies to one sellable product, shipping represents one standard sale, and multi-product or multi-quantity customer orders are deferred.

## Version 0.4: Product Comparison

Version 0.4 will allow authenticated users to compare two or more saved products using consistent profitability, time-efficiency, machine-utilization, and cash-efficiency metrics.

### Primary User Story

As a maker with multiple possible products, I want to compare their economic and production characteristics so that I can determine which product best fits my current business constraints.

### Required Comparison Metrics

For each selected product, MakerMargin must display:

- Selling price
- Total cash cost
- Owner labor compensation
- Machine cost
- Net business profit
- Profit margin
- Owner economic benefit
- Active labor minutes
- Machine minutes
- Total elapsed production time
- Business profit per labor hour
- Owner economic benefit per labor hour
- Business profit per machine hour
- Units per labor hour
- Units per machine hour
- Cash required per unit
- Cash required per batch
- Break-even unit count
- Primary production bottleneck

Owner economic benefit is defined as:

> owner labor compensation + net business profit

This metric must remain distinct from net business profit.

The initial comparison model is for owner-operated production. Current labor cost represents owner labor compensation. Paid-employee labor is a separate future cash expense and is excluded from owner economic benefit.

Total cash cost means actual cash expenses associated with producing and completing one standard sale. Upfront cash requirement means cash funded before customer payout; it excludes owner labor compensation, allocated machine cost, marketplace percentage fees, and costs paid only after sale. Economic cost includes cash and non-cash allocations used to judge whether a product is worth producing. Existing calculator formulas remain unchanged.

### Comparison Results

MakerMargin must identify category leaders without relying on a single opaque aggregate score.

Required categories include:

- Highest profit per unit
- Highest profit margin
- Highest owner economic benefit per labor hour
- Highest business profit per machine hour
- Lowest upfront cash requirement
- Fastest active production
- Best batch economics

MakerMargin must provide a concise plain-language explanation of the comparison results.

Example:

> Product A generates the greatest profit per sale. Product B produces the greatest owner economic benefit per active labor hour. Product C uses the least working capital.

### Missing Data

If a saved product lacks a value required for a comparison metric, MakerMargin must:

- Show the affected metric as unavailable
- Identify the missing input
- Exclude the unavailable metric from category rankings
- Avoid silently substituting a default value

### Historical Integrity

Comparison calculations must respect each saved product's stored input snapshot, result snapshot, and formula version.

Before Version 0.3 saved-product writes ship, `pricing_inputs` and `calculation_snapshot` must become independently versioned JSON envelopes containing their schema version, `per_sellable_product` basis, and snapshot data. The saved record's top-level `formula_version` remains authoritative. Version-aware parsing treats missing optional data as unavailable and numeric zero as known zero; it never supplies a silent default, rewrites history, or trusts malformed or unsupported versions.

Recalculating a product under the current formula version must not overwrite historical values without an explicit save action.

Products from different formula versions may appear together. MakerMargin ranks only metrics whose definitions are semantically compatible, excludes incompatible metrics from category rankings, shows a version-compatibility warning, and offers explicit recalculation with the current formula. It never silently normalizes or overwrites historical records. Metric compatibility is documented by formula and snapshot version.

### Production Semantics

Active labor and machine time are separate capacity measures. Supervised machine time may consume both resources; passive waiting is not active labor. Total elapsed production time is explicitly supplied or calculated through a future production-stage model and is never obtained by blindly adding component durations.

Version 0.4 may record one optional primary machine using a stable resource key plus a historical display-label snapshot. Multiple-machine routing and production scheduling remain deferred.

### Initial Data Audit

Before implementation, audit the existing calculator types and saved-product schema for support of:

- Batch size
- Setup labor time
- Active labor time
- Machine time
- Machine type
- Supervision requirement
- Finishing time
- Passive waiting or curing time
- Upfront cash cost

Prefer derived calculations from existing snapshots where possible. Add persistent fields only when required information cannot be reliably reconstructed.

## Deferred from Version 0.4

The following capabilities are explicitly deferred:

- Sales-demand forecasting
- Etsy or Shopify sales synchronization
- Weighted recommendation scores
- Weekly capacity planning
- Multi-machine production scheduling
- Inventory optimization
- Seasonal demand modeling
- Automated product-mix recommendations

These capabilities may be considered for Version 0.5 or later after the product-comparison model is validated.
