import "server-only";

import type { PricingInput } from "./calculations";
import type { Json } from "./supabase/database.types";
import type { Database } from "./supabase/database.types";
import { createServerSupabaseClient } from "./supabase/server";
import type { SavedProduct } from "./saved-products";
import { duplicateProductName, safeProductId } from "./saved-product-validation";
import {
  createCurrentSnapshots,
  CURRENT_FORMULA_VERSION,
  parseCalculationSnapshot,
  parsePricingInputSnapshot,
} from "./saved-product-snapshots";

type Row = Database["public"]["Tables"]["saved_products"]["Row"];

export type SavedProductErrorCode =
  | "configuration"
  | "authentication"
  | "not-found"
  | "validation"
  | "snapshot"
  | "database";

export class SavedProductError extends Error {
  constructor(public readonly code: SavedProductErrorCode, message: string) {
    super(message);
  }
}

function parseRow(row: Row): SavedProduct {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    sourcePresetId: row.source_preset_id,
    pricingInputs: parsePricingInputSnapshot(row.pricing_inputs),
    calculationSnapshot: parseCalculationSnapshot(row.calculation_snapshot, row.formula_version),
    formulaVersion: row.formula_version,
    rawPricingInputs: structuredClone(row.pricing_inputs),
    rawCalculationSnapshot: structuredClone(row.calculation_snapshot),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validName(name: string) {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 120) {
    throw new SavedProductError("validation", "Product name must contain 1 to 120 characters.");
  }
  return trimmed;
}

function validId(id: string) {
  if (!safeProductId(id)) throw new SavedProductError("not-found", "Saved product was not found.");
  return id;
}

async function context() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new SavedProductError("configuration", "Cloud products are unavailable.");
  const { data, error } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (error || !userId) throw new SavedProductError("authentication", "Sign in to manage saved products.");
  return { supabase, userId };
}

function databaseFailure() {
  return new SavedProductError("database", "Saved products are temporarily unavailable. Try again.");
}

export async function listSavedProducts(): Promise<SavedProduct[]> {
  const { supabase } = await context();
  const { data, error } = await supabase.from("saved_products").select("*")
    .order("updated_at", { ascending: false }).order("id", { ascending: true });
  if (error) throw databaseFailure();
  return (data ?? []).map(parseRow);
}

export async function getSavedProduct(id: string): Promise<SavedProduct> {
  const { supabase } = await context();
  const { data, error } = await supabase.from("saved_products").select("*").eq("id", validId(id)).maybeSingle();
  if (error) throw databaseFailure();
  if (!data) throw new SavedProductError("not-found", "Saved product was not found.");
  return parseRow(data);
}

export async function createSavedProduct(input: {
  name: string;
  pricingInput: PricingInput;
  sourcePresetId: string | null;
}): Promise<SavedProduct> {
  const { supabase, userId } = await context();
  let snapshots;
  try { snapshots = createCurrentSnapshots(input.pricingInput); }
  catch (error) { throw new SavedProductError("validation", error instanceof Error ? error.message : "Pricing inputs are invalid."); }
  const { data, error } = await supabase.from("saved_products").insert({
    user_id: userId,
    name: validName(input.name),
    source_preset_id: input.sourcePresetId,
    pricing_inputs: snapshots.pricingInputs as unknown as Json,
    calculation_snapshot: snapshots.calculationSnapshot as unknown as Json,
    formula_version: snapshots.formulaVersion,
  }).select("*").single();
  if (error || !data) throw databaseFailure();
  return parseRow(data);
}

export async function updateSavedProduct(id: string, input: { name: string; pricingInput: PricingInput }) {
  const { supabase } = await context();
  let snapshots;
  try { snapshots = createCurrentSnapshots(input.pricingInput); }
  catch (error) { throw new SavedProductError("validation", error instanceof Error ? error.message : "Pricing inputs are invalid."); }
  const { data, error } = await supabase.from("saved_products").update({
    name: validName(input.name),
    pricing_inputs: snapshots.pricingInputs as unknown as Json,
    calculation_snapshot: snapshots.calculationSnapshot as unknown as Json,
    formula_version: snapshots.formulaVersion,
  }).eq("id", validId(id)).select("*").maybeSingle();
  if (error) throw databaseFailure();
  if (!data) throw new SavedProductError("not-found", "Saved product was not found.");
  return parseRow(data);
}

export async function renameSavedProduct(id: string, name: string) {
  const { supabase } = await context();
  const { data, error } = await supabase.from("saved_products").update({ name: validName(name) })
    .eq("id", validId(id)).select("*").maybeSingle();
  if (error) throw databaseFailure();
  if (!data) throw new SavedProductError("not-found", "Saved product was not found.");
  return parseRow(data);
}

export async function duplicateSavedProduct(id: string) {
  const original = await getSavedProduct(id);
  const { supabase, userId } = await context();
  const name = validName(duplicateProductName(original.name));
  const { data, error } = await supabase.from("saved_products").insert({
    user_id: userId,
    name,
    source_preset_id: original.sourcePresetId,
    pricing_inputs: structuredClone(original.rawPricingInputs),
    calculation_snapshot: structuredClone(original.rawCalculationSnapshot),
    formula_version: original.formulaVersion,
  }).select("*").single();
  if (error || !data) throw databaseFailure();
  return parseRow(data);
}

export async function deleteSavedProduct(id: string) {
  const { supabase } = await context();
  const { data, error } = await supabase.from("saved_products").delete().eq("id", validId(id)).select("id").maybeSingle();
  if (error) throw databaseFailure();
  if (!data) throw new SavedProductError("not-found", "Saved product was not found.");
}

export async function previewSavedProductRecalculation(id: string) {
  const product = await getSavedProduct(id);
  if (!product.pricingInputs) {
    throw new SavedProductError("snapshot", "This historical input version cannot be recalculated.");
  }
  return { product, preview: createCurrentSnapshots(product.pricingInputs.data) };
}

export async function saveRecalculatedProduct(id: string) {
  const { product, preview } = await previewSavedProductRecalculation(id);
  const { supabase } = await context();
  const { data, error } = await supabase.from("saved_products").update({
    pricing_inputs: preview.pricingInputs as unknown as Json,
    calculation_snapshot: preview.calculationSnapshot as unknown as Json,
    formula_version: CURRENT_FORMULA_VERSION,
  }).eq("id", product.id).select("*").maybeSingle();
  if (error) throw databaseFailure();
  if (!data) throw new SavedProductError("not-found", "Saved product was not found.");
  return parseRow(data);
}
