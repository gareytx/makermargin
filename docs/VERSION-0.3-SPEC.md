# MakerMargin Version 0.3 Specification

Status: Planning
Release theme: User accounts and private saved products
Baseline: MakerMargin v0.2.0 (`f877bea`)

## Product Goals

- Keep the pricing calculator and all editable presets fully usable without an account.
- Let a user create an account with email and password and privately save calculator work.
- Treat a saved product as an auditable snapshot of both its inputs and its calculated result.
- Let a user manage saved products through create, list, open, edit, rename, duplicate, and confirmed-delete operations.
- Preserve the user's in-progress calculator state through successful, failed, or canceled authentication.
- Enforce product ownership in the database with Supabase Row Level Security (RLS), not only in application code.
- Make formula and preset evolution explicit so historical saved results never change silently.

## Non-Goals

- Requiring authentication for calculator or preset use.
- Social login, OAuth providers, passwordless email, or magic links.
- Public product sharing, teams, organizations, or collaboration.
- Stripe, subscriptions, billing, saved-product limits, or plan enforcement.
- Live links from saved products to product preset definitions.
- Automatic migration or recalculation of historical saved products when formulas or assumptions change.
- A general user-profile feature, avatars, public names, or account discovery.
- Offline persistence or cross-device synchronization for anonymous calculator drafts.

## User Stories

- As a visitor, I can calculate pricing and edit presets without signing in.
- As a visitor with unsaved calculator work, I can start registration or login and return without losing that work.
- As a visitor who tries to save, I am asked to authenticate and can continue the original save afterward.
- As a user, I can save the calculator's current inputs and result under a product name.
- As a user, I can save a modified preset without the saved product changing when the preset later changes.
- As a user, I can view and open only my own saved products.
- As a user, I can edit inputs, recalculate, and save changes to an existing product.
- As a user, I can rename, duplicate, or delete a product, with confirmation before deletion.
- As a user, I can see that a historical result used an older formula and explicitly recalculate it with the current engine.

## Primary User Flows

1. **Anonymous calculation:** Open `/`, choose a starting point, edit inputs, and receive the existing validated result. No authentication request is shown until a cloud action is chosen.
2. **Save while signed in:** Select Save, validate the current input, enter or confirm the product name, and insert an input/result snapshot. On success, show confirmation and make the saved record available from `/products`.
3. **Save while anonymous:** Select Save, preserve the complete calculator draft and intended save action, authenticate, return to the calculator, restore the draft, and resume the save. Cancellation and authentication failure return to the same intact draft.
4. **Manage products:** Open `/products`, then open, rename, duplicate, or request deletion of an owned product. Deletion requires explicit confirmation.
5. **Edit a saved product:** Open `/products/[id]`, edit a working copy, calculate with the current engine, and explicitly save. Navigating away with unsaved edits should use the same edit-loss protection pattern as presets.
6. **Recalculate historical data:** Open a record whose `formulaVersion` differs from the current engine, compare its stored snapshot with a newly calculated preview, and explicitly choose whether to save the new result and version.

## Authentication Flow

- Version 0.3 supports Supabase email-and-password registration and login only.
- Email confirmation is enabled. Registration ends in a **Check your email** state and does not imply that the user can save.
- A user cannot save or manage cloud products until confirmation has produced a valid authenticated session.
- `/login` and `/register` are available to anonymous users. Authenticated users visiting them are returned to a validated internal destination.
- Save and product-management actions require an authenticated session. The calculator itself does not.
- A login prompt must explain that signing in is needed to save, not to calculate.
- Password recovery is included through `/forgot-password` and `/update-password`. Magic-link authentication is not enabled.
- Redirect destinations must be application-owned relative paths. Never trust an arbitrary external `returnTo` URL.
- When an unauthenticated user attempts to save, create a `PendingSaveDraft` under a unique opaque draft ID. Authentication URLs may carry only that ID, never calculator contents.
- Registration, confirmation, failed login, canceled login, successful login, and password recovery must preserve the pending draft. Successful product save or explicit discard removes it.
- `/auth/callback` validates the Supabase callback, establishes the session, and redirects to a validated internal destination with the opaque draft ID when present. Callback failure retains the draft and offers a safe retry path.
- Password-reset requests always show the same generic success response whether or not the email belongs to an account. Recovery callbacks route to `/update-password`, where the new password is validated and submitted. Invalid or expired links show a recovery-specific error and a new-request action without deleting a pending draft.
- Do not put passwords, access tokens, refresh tokens, or sensitive authentication errors in draft storage or URLs.
- Supabase's browser/session integration owns authentication tokens. Server-side authorization and RLS remain authoritative.

### Authentication redirect configuration

- Local development must allow the exact callback URL `http://localhost:3000/auth/callback` and the corresponding password-recovery redirect to `/auth/callback` with a validated next destination of `/update-password`.
- Production must allow `https://<production-host>/auth/callback` and use that origin for confirmation and recovery emails.
- Every preview origin used for authentication must be explicitly allowlisted; wildcard production redirects are not acceptable. If previews cannot receive stable allowlisted URLs, authentication must be disabled there or use a dedicated hosted-development origin.
- Supabase Site URL and redirect allowlists must be reviewed for local, preview, and production environments before release. The application must reject off-origin or protocol-relative next destinations after any callback.
- The draft ID may be propagated as an opaque query parameter through approved application routes. Tokens and calculator contents may not be propagated in application query parameters.

### Password recovery flow

1. The user opens `/forgot-password`, enters an email, and submits once.
2. The application requests a Supabase recovery email with `/auth/callback` configured to continue to `/update-password`.
3. The UI always responds with generic wording such as: "If an account exists for that email, a password reset link has been sent."
4. The recovery link reaches `/auth/callback`, which validates the recovery exchange and redirects to `/update-password` while retaining any opaque draft ID.
5. `/update-password` requires a valid recovery session, validates the new password and confirmation, updates it, and then returns to the pending save or calculator flow.
6. Missing, invalid, reused, or expired recovery state shows an error and links back to `/forgot-password`. It never overwrites or deletes the calculator draft.

## Saved Product Behavior

- A saved product is a snapshot, not a live calculator document or preset reference.
- Creation requires valid `PricingInput` and a successful finite calculation. Invalid inputs cannot produce or save a misleading calculation snapshot.
- `name` is initialized from `pricingInputs.productName`, remains independently renameable, and is required after trimming.
- Opening a product loads a working copy. Reading a product does not update it or recalculate it.
- Saving input changes writes the complete input snapshot, the matching complete calculation snapshot, the current formula version, and `updated_at` in one operation.
- Rename changes only `name` and `updated_at`; it does not rewrite inputs, results, or formula version.
- Product names are trimmed and must contain 1-120 characters. Duplicate names are allowed and the database has no unique name constraint.
- Duplicate creates a new row owned by the current user with copied snapshots and formula version, a new identifier and timestamps, and the initial name `Original Name — Copy`. Users may rename it afterward.
- Delete requires a confirmation dialog naming the product. Cancel leaves the row unchanged.
- No hard or soft saved-product limit is imposed in Version 0.3.
- The product list is ordered by `updated_at DESC`, with a stable secondary order of `id`.

## Data Model

### Profiles evaluation

A `profiles` table is **deferred** for Version 0.3. Supabase `auth.users` already supplies the user identifier and email needed for authentication and ownership. `display_name` has no approved Version 0.3 use, and adding an unused table would add triggers, policies, failure modes, and personal data without product value.

If a later release requires profiles, the proposed table is:

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `uuid` | Primary key; references `auth.users(id)` on delete cascade |
| `display_name` | `text` | Nullable; trimmed length constraint when present |
| `created_at` | `timestamptz` | Not null; default `now()` |
| `updated_at` | `timestamptz` | Not null; default `now()`; update trigger |

It should not be included in the Version 0.3 migration unless a profile-dependent requirement is approved.

### `saved_products`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `uuid` | Primary key; default `gen_random_uuid()` |
| `user_id` | `uuid` | Not null; references `auth.users(id)` on delete cascade |
| `name` | `text` | Not null; `char_length(btrim(name)) BETWEEN 1 AND 120` |
| `source_preset_id` | `text` | Nullable; historical provenance only; no foreign key to code-defined presets |
| `pricing_inputs` | `jsonb` | Not null; JSON object constraint |
| `calculation_snapshot` | `jsonb` | Not null; JSON object constraint |
| `formula_version` | `text` | Not null; non-empty and length-limited |
| `created_at` | `timestamptz` | Not null; default `now()` |
| `updated_at` | `timestamptz` | Not null; default `now()`; maintained by trigger |

`pricing_inputs` and `calculation_snapshot` are versioned JSON objects. Each contains its own schema version, the semantic basis `per_sellable_product`, and its snapshot data. The basis means one sellable product in one standard sale: a four-piece coaster set is one product, not four comparison units. The top-level `formula_version` remains authoritative for the pricing formula used by the saved record.

Required database details:

- Foreign key: `saved_products.user_id -> auth.users.id ON DELETE CASCADE`.
- Checks: `name = btrim(name)` and `char_length(name) BETWEEN 1 AND 120`; `jsonb_typeof(pricing_inputs) = 'object'`; `jsonb_typeof(calculation_snapshot) = 'object'`; trimmed `formula_version` length 1-40; nullable `source_preset_id` length 1-80 when present.
- Index: `user_id` for ownership lookups and foreign-key operations.
- Composite list index: `(user_id, updated_at DESC, id)` for the product list and stable pagination.
- No unique constraint on product names; duplicates and copied names are allowed.
- A `BEFORE UPDATE` trigger sets `updated_at = now()`. Clients must not be trusted to supply update timestamps.
- The database stores JSON snapshots, while application validation enforces the complete schema before writes and after reads. JSONB checks alone do not establish a trusted `PricingInput`.
- No migration change is required for snapshot envelopes because both columns already store JSONB objects.
- Version-aware parsing must preserve the distinction between missing and zero. A missing optional field is unknown or unavailable; numeric zero is a known value. Parsers never supply zero for absent data or rewrite a historical snapshot.
- Malformed objects and invalid or unsupported schema versions fail safely and cannot be used as trusted calculation inputs.

### Typed application representation

The application should define these types in a dedicated saved-product module and derive database row types from generated Supabase types where practical:

```ts
import type { PricingInput, PricingResult } from "@/lib/calculations";
import type { ProductPresetId } from "@/lib/product-presets";

export type FormulaVersion = "pricing-v1";
export type SnapshotBasis = "per_sellable_product";
export type PricingInputSnapshotVersion = "pricing-input-v1";
export type CalculationSnapshotVersion = "calculation-snapshot-v1";
export type PendingSaveDraftVersion = 1;

export type PricingInputSnapshot = {
  schemaVersion: PricingInputSnapshotVersion;
  basis: SnapshotBasis;
  data: PricingInput;
};

export type CalculationSnapshot = {
  schemaVersion: CalculationSnapshotVersion;
  basis: SnapshotBasis;
  data: {
    result: PricingResult;
    calculatedAt: string;
    warnings: string[];
  };
};

export type SavedProduct = {
  id: string;
  userId: string;
  name: string;
  sourcePresetId: ProductPresetId | null;
  pricingInputs: PricingInputSnapshot;
  calculationSnapshot: CalculationSnapshot;
  formulaVersion: FormulaVersion;
  createdAt: string;
  updatedAt: string;
};

export type SavedProductInsert = Pick<
  SavedProduct,
  | "name"
  | "sourcePresetId"
  | "pricingInputs"
  | "calculationSnapshot"
  | "formulaVersion"
>;

export type SavedProductUpdate = Partial<
  Pick<
    SavedProduct,
    | "name"
    | "sourcePresetId"
    | "pricingInputs"
    | "calculationSnapshot"
    | "formulaVersion"
  >
>;

export type PendingSaveDraft = {
  version: PendingSaveDraftVersion;
  id: string;
  createdAt: string;
  expiresAt: string;
  pricingInputs: PricingInputSnapshot;
  sourcePresetId: ProductPresetId | null;
  intendedProductName: string;
  returnPath: "/";
};

export type RecalculationPreview = {
  savedProductId: string;
  originalFormulaVersion: FormulaVersion | string;
  currentFormulaVersion: FormulaVersion;
  pricingInputs: PricingInputSnapshot;
  calculationSnapshot: CalculationSnapshot;
  createdAt: string;
};
```

`CalculationSnapshot` does not repeat `formulaVersion` in Version 0.3 because the saved record's top-level `formula_version` is authoritative. If a future self-contained export repeats it inside the snapshot, runtime validation must require exact equality with the top-level value and reject inconsistent records safely.

The server derives `userId` from the authenticated user, never from an untrusted insert/update payload. Update operations must distinguish rename-only updates from calculation updates so fields that must remain internally consistent are written together.

`PendingSaveDraft` is application state, not authentication session state. It is created only after an anonymous Save attempt and stored in browser storage under its unique, cryptographically opaque ID. Each tab or authentication attempt may create an independent draft. `createdAt` and `expiresAt` are ISO timestamps, with `expiresAt` exactly 24 hours after creation. Reads must parse and validate the entire model and version before restoration. Missing, malformed, expired, or incompatible drafts are discarded or reported safely and must never overwrite the current calculator.

The storage key should be namespaced and keyed by ID, for example `makermargin:pending-save:v1:<opaque-id>`. The selected preset itself is never reloaded to reconstruct the draft; `sourcePresetId` is provenance and `pricingInputs` is authoritative. Successful cloud save and explicit discard remove that one draft. Failed or canceled authentication retains it.

## Row Level Security Policy

- Enable and force RLS on `saved_products`.
- Every policy targets `TO authenticated`.
- Grant only the minimum table privileges needed to the authenticated role. The anonymous role receives no table privileges on `saved_products`.
- `SELECT`: `USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) = user_id)`.
- `INSERT`: `WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) = user_id)`.
- `UPDATE`: `USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) = user_id)` and the identical ownership expression in `WITH CHECK`, so ownership cannot be transferred.
- `DELETE`: `USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) = user_id)`.
- Application queries should still filter by `user_id`, but filters are not a substitute for RLS.
- The service-role key must never be exposed to the browser. Normal product operations use the authenticated user's session.
- Automated database tests must create two distinct authenticated users and prove isolation for every CRUD operation, including inability to insert for or transfer ownership to the other user.

If `profiles` is later introduced, it requires equivalent self-only select/insert/update policies and no client delete policy unless account deletion behavior is explicitly designed.

## Formula-Versioning Strategy

- Introduce a code-owned `CURRENT_FORMULA_VERSION` with the initial value `pricing-v1`.
- Every saved calculation stores the exact formula version used to produce its `calculation_snapshot`.
- Version identifiers are immutable semantic labels, not package versions. A formula behavior change creates a new identifier such as `pricing-v2`; an existing identifier is never redefined.
- Cosmetic UI changes, warning-copy changes, or preset-assumption changes do not require a formula bump unless calculated numeric output or result semantics change.
- Readers must tolerate known historical versions. Unknown versions display the stored snapshot but prevent claims that it was reproduced by the current engine.
- Existing rows are never silently rewritten when `CURRENT_FORMULA_VERSION` changes.

## Preset Snapshot Strategy

- Selecting a preset continues to copy its values into a mutable `PricingInput`.
- Saving writes the complete current `PricingInput`, including all user edits. It never reconstructs inputs from a preset during load.
- `source_preset_id` is nullable provenance for display only. Custom Product saves store `null`; product-preset saves store the selected preset ID.
- It is not a foreign key and does not create a dependency on the current preset collection.
- Changes to preset labels, metadata, assumptions, identifiers, or removal do not alter any saved product.
- A saved modified preset is independent from the moment it is saved. The saved product remains loadable even if `source_preset_id` is no longer recognized.
- Product detail displays `Started from: [preset label]` when the ID is known. Unknown or removed IDs use neutral wording such as `Started from: Historical preset`; Custom Product may display `Started from scratch`.
- The main product list does not display preset provenance.

## Recalculation Behavior

- Opening a saved product displays its stored calculation snapshot and formula version without running an automatic replacement calculation.
- If its formula version is current, edits may produce a live preview, but persistence still requires an explicit Save action.
- Recalculation is always explicit. **Recalculate with current formula** creates a `RecalculationPreview` and does not mutate the saved row.
- If its formula version is historical, show a clear non-blocking notice and the explicit recalculation action.
- Recalculation validates the stored inputs with the current engine. If invalid, show validation errors and preserve the historical snapshot unchanged.
- A successful recalculation presents the current result for review. Only **Save updated calculation** atomically replaces `pricing_inputs`, `calculation_snapshot`, and `formula_version`; the database trigger updates `updated_at`.
- Canceling or leaving the recalculation leaves the database row and historical snapshot unchanged.
- Version 0.3 does not retain multiple calculation revisions. The previous snapshot is replaced only after explicit confirmation and successful persistence.
- Formula history, snapshot rollback, and calculation revision history are deferred.

## Routes and UI Surfaces

| Route | Authentication and behavior | Loading and error states |
| --- | --- | --- |
| `/` | Public calculator. Save creates a pending draft only when anonymous; authenticated Save writes the validated snapshot. | Calculator remains usable while auth initializes. Save errors retain all inputs and the pending draft. |
| `/login` | Anonymous email/password login. Accepts only a safe internal return path and optional opaque draft ID. Authenticated users continue to that destination. | Pending submit prevents duplicates; errors retain email and draft. Cancel returns to the calculator with the draft intact. |
| `/register` | Anonymous email/password registration followed by **Check your email**. Saving remains unavailable until callback establishes a session. | Validation and registration errors retain form context and pending draft. Resend confirmation is rate-limit aware. |
| `/auth/callback` | Public callback endpoint for email confirmation and password recovery. Exchanges valid callback state, then redirects to the validated internal destination. | Shows bounded processing state. Invalid, expired, or missing callback state shows a safe error/retry path and retains any pending draft. |
| `/forgot-password` | Public reset-request form with generic success messaging regardless of account existence. | Prevent duplicate requests; network errors are actionable but do not expose account existence or remove drafts. |
| `/update-password` | Requires a valid recovery session. Validates and submits a new password, then resumes the safe return flow. | Missing, invalid, or expired recovery state links to a new request. Submission errors retain the pending draft. |
| `/products` | Requires authentication. Lists owned products and supports rename, duplicate, and confirmed delete. | Stable loading rows, empty state linking to `/`, retryable database error, and session-expiry redirect preserving pending work. |
| `/products/[id]` | Requires authentication and ownership. Displays and edits the stored snapshot, provenance, formula version, and explicit recalculation preview. | Stable editor loading state; inaccessible and absent IDs share a not-found state; write errors retain edits and original snapshot. |

An authenticated account menu provides sign out. Signing out returns saved-product routes to a safe anonymous surface without erasing an in-progress calculator draft. Product routes preserve safe return intent when redirecting anonymous users to login. A valid session that lacks row ownership receives the same not-found response as an absent product, preventing record enumeration.

## Loading, Empty, and Error States

- Authentication initialization: show a bounded loading state without hiding or disabling the anonymous calculator longer than necessary.
- Login/register submission: prevent duplicate submission, retain the email field, and show actionable non-sensitive errors.
- Product list loading: show stable skeleton rows; do not flash an incorrect empty state.
- Empty list: explain that no products are saved and link back to the calculator.
- Product loading: show a stable editor placeholder. Missing, inaccessible, and deleted products use the same not-found presentation.
- Save/update/rename/duplicate/delete: disable only the active action, prevent duplicate writes, retain local edits after errors, and announce success or failure accessibly.
- Database/network errors: show a retry path and preserve the working calculator or editor state.
- Session expiry during a write: preserve the pending draft, request login, and resume only after the user confirms the intended action.
- Recalculation errors: leave the stored snapshot visible and unchanged.

## Validation and Security Requirements

- Reuse `validatePricingInput` and `calculatePricing`; do not duplicate pricing formulas in UI, persistence, or Supabase code.
- Never save a normal calculation snapshot when pricing validation fails or any numeric result is non-finite.
- Validate and parse JSONB records at the application boundary before treating them as typed data. Reject malformed or unsupported snapshots safely.
- Validate the schema version and `per_sellable_product` basis of both JSON snapshots. Preserve missing optional fields as unavailable and numeric zero as an explicit known value; never backfill missing values while parsing.
- Validate names on client and server boundaries; trim whitespace and enforce the database maximum.
- Authenticate every saved-product mutation and derive ownership from the verified session.
- RLS is mandatory in migrations and tested against cross-user access.
- Prevent mass assignment of `id`, `user_id`, timestamps, or ownership fields.
- Escape rendered user content through React defaults; do not inject product names as HTML.
- Use CSRF-resistant Supabase session patterns and secure cookie settings appropriate to the selected Next.js integration.
- Avoid logging passwords, tokens, full auth responses, or complete saved-product payloads.
- Rate limiting and abuse controls for registration/login should use Supabase platform controls and documented production settings.

## Database Migration Plan

1. Establish local Supabase migration tooling in the implementation branch; no project or database is changed during specification work.
2. Create the `saved_products` table, constraints, foreign key, index, and timestamp trigger in one reviewed migration.
3. Enable and force RLS, then create explicit select/insert/update/delete ownership policies in the same migration.
4. Do not create `profiles` in Version 0.3 unless its deferred requirement is separately approved.
5. Generate or update application database types from the migration.
6. Test the migration from an empty local database and test rollback/reset through the normal local workflow.
7. Run two-user RLS integration tests before applying to a hosted environment.
8. Apply first to a non-production Supabase project, verify auth configuration and policies, then apply to production using reviewed migrations.
9. No backfill is required because v0.2.0 has no cloud saved products.

## Environment Variables

Expected public browser configuration:

- `NEXT_PUBLIC_SUPABASE_URL`: project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: publishable/anonymous client key permitted to rely on RLS.

Server-only configuration, only if an approved server task requires it:

- `SUPABASE_SERVICE_ROLE_KEY`: privileged key; never prefixed with `NEXT_PUBLIC_`, never bundled into the client, and not needed for ordinary saved-product CRUD.

Provide `.env.example` with names and comments but no credentials. Keep `.env.local` ignored. Production and preview environments must use separate project credentials where practical. Exact variable naming should be reconciled with the current Supabase SDK guidance during implementation.

### Email infrastructure

- Local confirmation and recovery email must be tested with the local Supabase email-capture service (such as the inbox service shipped with the local stack), not a real recipient.
- Supabase hosted-development email delivery has recipient and rate limitations and is suitable only for controlled development testing. Those limits must be documented for the chosen project configuration.
- Custom SMTP is required and verified before public production launch. Production must not rely on the default hosted-development mail service.
- Confirmation and recovery redirect URLs must be maintained and tested for local development, every authentication-enabled preview deployment, and production.
- Email templates must link only to approved HTTPS production/preview origins or the explicit HTTP localhost origin. A deployment checklist must verify Site URL, redirect allowlist, sender identity, delivery, expiration behavior, and both confirmation and recovery callbacks.

## Local Development Setup

The implementation phase should document these steps after selecting and installing the Supabase tooling:

1. Install approved Supabase client/server packages and local CLI tooling without unrelated upgrades.
2. Start the local Supabase stack and apply migrations from a clean database.
3. Configure local email/password auth, email confirmation, local email capture, callback URLs, and two deterministic authenticated test users.
4. Copy documented variable names into `.env.local` using local values.
5. Run the Next.js development server and exercise anonymous and authenticated flows.
6. Run unit, UI, and database/RLS integration tests.

Version 0.3 planning does not install packages, create a Supabase project, apply migrations, or change environment files.

## Testing Strategy

- **Existing regression tests:** retain all pricing, preset-data, and calculator UI tests, including the default slate result.
- **Unit tests:** serialization/parsing, formula-version comparison, snapshot creation, name validation, duplicate naming, and safe return-path validation.
- **UI tests:** anonymous calculator use; Save requiring authentication; registration awaiting email confirmation; login success and errors; callback success and failure; password-reset request and generic response; valid, invalid, and expired recovery links; preservation through successful, failed, and canceled login and confirmation; all loading, empty, validation, and database-error states.
- **Pending-draft tests:** creation only after anonymous Save; opaque ID routing; schema/version validation; exact 24-hour expiration; multiple independent drafts; restoration after login and email confirmation; retention after failed/canceled authentication; removal after successful save or explicit discard; and safe failure for missing, malformed, expired, or incompatible drafts without overwriting current inputs.
- **Preset integration:** select every preset, modify populated values, save, change the source preset definition in the fixture, and prove the saved inputs remain independent.
- **Saved-product UI:** save current inputs, list, load, edit/update, rename, duplicate as `Original Name — Copy`, cancel/confirm delete, retain edits after a failed write, and dirty-navigation behavior. Verify duplicate names are accepted; 1- and 120-character trimmed names are valid; and empty, whitespace-only, and 121-character names are rejected.
- **Provenance tests:** Custom Product saves `source_preset_id = null`; a preset-derived save records the historical preset ID; preset changes do not affect the saved input; known provenance renders its label; and unknown historical IDs render the neutral fallback.
- **Validation integration:** invalid edits continue to suppress misleading results and cannot be persisted as a valid calculation snapshot.
- **Formula tests:** persist `FormulaVersion`, display historical snapshots unchanged, explicitly create a current-engine preview without mutating the saved row, reject invalid recalculation, update snapshot/version only after **Save updated calculation**, and preserve the original after cancellation.
- **RLS integration tests:** use two distinct authenticated users and verify isolation for every select, insert, update, ownership-transfer, and delete operation. Test anonymous denial directly against the database API.
- **Route tests:** unauthenticated product-route redirects preserve a safe return path; inaccessible IDs do not disclose another user's rows.
- **End-to-end smoke tests:** register, calculate, authenticate without state loss, save, reopen, edit, duplicate, delete, sign out, and confirm anonymous calculation remains available.

Tests must cover at minimum all approved scenarios: anonymous use; registration and login; authentication errors; auth-required save; saving current inputs and modified presets; loading, editing, updating, renaming, duplicating, and confirmed deletion; cross-user RLS isolation; formula-version persistence and explicit recalculation; state preservation through login; and loading, empty, and database-error states.

## Definition of Done

- Anonymous users retain full v0.2.0 calculator and preset functionality with unchanged valid calculations.
- Email/password registration, login, session restoration, and sign out work with accessible error handling.
- Email confirmation produces a **Check your email** state and only a confirmed valid session can save cloud products.
- Password request, callback, invalid/expired recovery handling, and password update work without account enumeration.
- Authentication interruptions never discard the active calculator draft; temporary drafts expire after 24 hours and are removed only after successful save, explicit discard, or validated expiration/incompatibility handling.
- Authenticated users can create, list, open, edit, save, rename, duplicate, and confirm-delete their private products.
- Saved rows contain validated complete inputs, a matching finite calculation snapshot, and an immutable formula-version identifier.
- Saved rows use supported, independently versioned input and calculation snapshot envelopes with the explicit `per_sellable_product` basis; malformed or unsupported snapshots fail safely.
- Preset-derived saves remain independent of future preset definitions.
- Historical rows are not silently recalculated; explicit recalculation is validated and user-confirmed.
- RLS and database constraints enforce ownership and reject cross-user access in automated tests.
- Loading, empty, not-found, session-expiry, and database-error states preserve user work and are accessible.
- Migrations reproduce the schema from an empty database, generated types are current, and environment setup is documented without secrets.
- Existing tests plus Version 0.3 unit, UI, RLS, and end-to-end suites pass; lint and production build pass.
- Custom SMTP is configured and exercised before public production launch.
- Confirmation and recovery redirect URLs are verified for local, enabled preview, and production environments.
- RLS policies pass all CRUD isolation tests with two distinct authenticated users.
- Build inspection confirms that no service-role secret appears in client bundles.
- The anonymous calculator remains fully operational when Supabase is unavailable or unconfigured for anonymous use.
- Existing saved rows remain unchanged merely because formulas or presets change.
- No Version 0.4 deferred feature is accidentally included.

## Deferred Version 0.4 Work

- Social providers and magic-link authentication.
- Public sharing, share links, teams, organizations, roles, and collaboration.
- Stripe, subscriptions, usage tiers, quotas, and saved-product limits.
- Saved-product revision history or side-by-side historical calculations.
- Batch calculations, quote exports, and advanced reporting.
- User profiles unless a concrete profile-dependent experience is approved.
- Cross-device anonymous drafts or offline-first behavior.
- Live preset update suggestions for saved products.
- Calculation revision history, formula rollback, and historical snapshot restoration.

## Open Risks and Assumptions

- **Auth rendering architecture:** The exact Next.js/Supabase server-client integration must follow the installed Next.js documentation and current Supabase guidance at implementation time.
- **JSON evolution:** JSONB provides snapshot flexibility but requires version-aware runtime parsing. Formula version identifies calculation behavior; independent input and calculation snapshot schema versions identify JSON shape and semantics. Missing fields remain unavailable rather than becoming zero.
- **Browser storage availability:** Privacy modes, quotas, or browser policy may make draft storage unavailable. The Save flow must fail visibly without replacing current calculator state.
- **Preview URL churn:** Per-deployment preview URLs may not be practical to allowlist. Authentication must remain disabled on unapproved previews or use a stable hosted-development origin.
- **Email delivery:** Confirmation and recovery depend on SMTP reputation and delivery. Delivery, bounce handling, expiration, and resend rate limits require operational verification.
- **No profiles table:** Version 0.3 assumes Supabase `auth.users` supplies all required identity and no approved feature needs a public profile record.
- **Operational configuration:** Redirect allowlists, rate limits, retention, backups, and production monitoring must be configured and verified before launch.

No unresolved product decisions remain in this specification. The items above are implementation or operational risks to validate during delivery, not feature-scope placeholders.
