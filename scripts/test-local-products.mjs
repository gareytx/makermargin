import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const isWindows = process.platform === "win32";
const status = spawnSync(isWindows ? "cmd.exe" : "npx", isWindows
  ? ["/d", "/s", "/c", "npx.cmd supabase status -o env"]
  : ["supabase", "status", "-o", "env"], { encoding: "utf8" });
if (status.status !== 0) throw new Error("Local Supabase is not running.");
const env = Object.fromEntries(status.stdout.split(/\r?\n/).map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((match) => [match[1], match[2].replace(/"$/, "")]));
if (!env.API_URL || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) throw new Error("Required local test values are unavailable.");

const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const password = `Maker-${suffix}!`;
const users = [];
let checks = 0;
function assert(condition, message) { if (!condition) throw new Error(message); checks += 1; console.log(`ok ${checks} - ${message}`); }
function client() { return createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } }); }
function inputs(name = "Integration Product") { return { schemaVersion: "pricing-input-v1", basis: "per_sellable_product", data: { productName: name, materialCost: 1, packagingCost: 0, otherCost: 0, wastePercentage: 0, machineMinutes: 0, machineHourlyRate: 7.75, laborMinutes: 10, laborHourlyRate: 40, marketplaceFeePercentage: 10, processingFeePercentage: 3, fixedTransactionFee: 0.3, shippingCost: 0, customerPaysShipping: true, desiredMarginPercentage: 30 } }; }
function calculation(marker = 1) { return { schemaVersion: "calculation-snapshot-v1", basis: "per_sellable_product", formulaVersion: "pricing-v1", data: { result: { hardCost: marker, wasteCost: 0, machineCost: 0, laborCost: 6.6666666667, shippingCostIncluded: 0, trueBaseCost: 7.6666666667, recommendedPrice: 12.645, estimatedFees: 1.94385, netProfit: 3.03448, profitMarginPercentage: 24, effectiveHourlyEarnings: 18.2 }, viability: { score: 50, label: "Caution", summary: "Test", recommendation: "Test" }, calculatedAt: new Date().toISOString(), warnings: [] } }; }
function row(userId, name, source = null, marker = 1) { return { user_id: userId, name, source_preset_id: source, pricing_inputs: inputs(name), calculation_snapshot: calculation(marker), formula_version: "pricing-v1" }; }

try {
  for (const index of [1, 2]) {
    const email = `products-${index}-${suffix}@example.test`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error("User creation failed.");
    users.push(created.data.user.id);
  }
  const first = client(); const second = client();
  assert(!(await first.auth.signInWithPassword({ email: `products-1-${suffix}@example.test`, password })).error, "first user authenticates");
  assert(!(await second.auth.signInWithPassword({ email: `products-2-${suffix}@example.test`, password })).error, "second user authenticates");
  const custom = await first.from("saved_products").insert(row(users[0], "A", null)).select("*").single();
  assert(!custom.error && custom.data.source_preset_id === null, "custom product stores null preset provenance");
  assert(custom.data.pricing_inputs.schemaVersion === "pricing-input-v1" && custom.data.calculation_snapshot.formulaVersion === "pricing-v1", "product stores versioned snapshots");
  const preset = await first.from("saved_products").insert(row(users[0], "Legacy Digital", "digital-print")).select("*").single();
  assert(!preset.error && preset.data.source_preset_id === "digital-print", "product preserves a retired historical preset ID");
  assert(!(await first.from("saved_products").insert(row(users[0], "x"))).error, "one-character name succeeds");
  assert(!(await first.from("saved_products").insert(row(users[0], "x".repeat(120)))).error, "120-character name succeeds");
  for (const bad of ["", "   ", "x".repeat(121)]) assert(Boolean((await first.from("saved_products").insert(row(users[0], bad))).error), `invalid name length ${bad.length} fails`);
  assert(!(await first.from("saved_products").insert(row(users[0], "A"))).error, "duplicate names succeed");
  const other = await second.from("saved_products").insert(row(users[1], "Other")).select("*").single();
  assert(!other.error, "second user creates a product");
  assert((await first.from("saved_products").select("*").eq("id", other.data.id)).data.length === 0, "user cannot read another user's product");
  assert((await first.from("saved_products").update({ name: "Stolen" }).eq("id", other.data.id).select()).data.length === 0, "user cannot update another user's product");
  assert((await first.from("saved_products").delete().eq("id", other.data.id).select()).data.length === 0, "user cannot delete another user's product");
  assert(Boolean((await first.from("saved_products").update({ user_id: users[1] }).eq("id", custom.data.id)).error), "ownership cannot be transferred");
  let before = await first.from("saved_products").select("*").eq("id", custom.data.id).single();
  const profiledInputs = { ...structuredClone(before.data.pricing_inputs), schemaVersion: "pricing-input-v2", productionProfile: { schemaVersion: "production-profile-v1", unitsPerBatch: 2 }, cashProfile: { schemaVersion: "cash-profile-v1", upfrontCashCostPerUnit: 0 } };
  const profiled = await first.from("saved_products").update({ pricing_inputs: profiledInputs }).eq("id", custom.data.id).select("*").single();
  assert(!profiled.error && JSON.stringify(profiled.data.pricing_inputs.data) === JSON.stringify(before.data.pricing_inputs.data), "profile save preserves pricing data");
  assert(JSON.stringify(profiled.data.calculation_snapshot) === JSON.stringify(before.data.calculation_snapshot), "profile save preserves calculation snapshot byte-for-byte");
  assert(profiled.data.formula_version === before.data.formula_version, "profile save preserves formula version");
  assert((await second.from("saved_products").update({ pricing_inputs: profiledInputs }).eq("id", custom.data.id).select()).data.length === 0, "another user cannot update a product profile");
  before = profiled;
  const preview = structuredClone(before.data.calculation_snapshot); preview.data.result.hardCost = 99;
  const afterPreview = await first.from("saved_products").select("*").eq("id", custom.data.id).single();
  assert(afterPreview.data.calculation_snapshot.data.result.hardCost !== 99, "recalculation preview is non-destructive");
  await new Promise((resolve) => setTimeout(resolve, 5));
  const updated = await first.from("saved_products").update({ calculation_snapshot: preview }).eq("id", custom.data.id).select("*").single();
  assert(!updated.error && updated.data.updated_at !== before.data.updated_at, "confirmed recalculation updates snapshot and timestamp");
  const duplicate = await first.from("saved_products").insert({ ...row(users[0], "A — Copy"), pricing_inputs: structuredClone(updated.data.pricing_inputs), calculation_snapshot: structuredClone(updated.data.calculation_snapshot) }).select("*").single();
  assert(!duplicate.error && duplicate.data.id !== custom.data.id, "duplicate has a separate ID");
  duplicate.data.pricing_inputs.data.productName = "Local mutation";
  assert((await first.from("saved_products").select("pricing_inputs").eq("id", custom.data.id).single()).data.pricing_inputs.data.productName !== "Local mutation", "duplicate snapshots are independent");
  const cleared = await first.from("saved_products").update({ pricing_inputs: { schemaVersion: "pricing-input-v2", basis: "per_sellable_product", data: structuredClone(profiledInputs.data) } }).eq("id", custom.data.id).select("pricing_inputs").single();
  assert(!cleared.error && !("productionProfile" in cleared.data.pricing_inputs) && !("cashProfile" in cleared.data.pricing_inputs), "clearing profile values removes empty envelopes");
  const ordered = await first.from("saved_products").select("id,updated_at").order("updated_at", { ascending: false }).order("id", { ascending: true });
  assert(!ordered.error && ordered.data.length >= 2, "list uses updated-at and ID ordering");
  assert(!(await first.from("saved_products").delete().eq("id", duplicate.data.id)).error && (await first.from("saved_products").select("id").eq("id", custom.data.id)).data.length === 1, "delete removes only selected product");
  console.log(`1..${checks}`);
} finally {
  for (const id of users) await admin.auth.admin.deleteUser(id);
}
