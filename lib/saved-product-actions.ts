"use server";

import { revalidatePath } from "next/cache";
import type { PricingInput } from "./calculations";
import {
  createSavedProduct,
  deleteSavedProduct,
  duplicateSavedProduct,
  previewSavedProductRecalculation,
  renameSavedProduct,
  saveRecalculatedProduct,
  SavedProductError,
  updateSavedProduct,
} from "./saved-product-service";
import type { SavedProduct } from "./saved-products";

export type ProductActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

async function run<T>(operation: () => Promise<T>): Promise<ProductActionResult<T>> {
  try { return { ok: true, data: await operation() }; }
  catch (error) {
    if (error instanceof SavedProductError) return { ok: false, error: error.message, code: error.code };
    return { ok: false, error: "Saved products are temporarily unavailable. Try again.", code: "database" };
  }
}

function refresh(id?: string) {
  revalidatePath("/products");
  if (id) revalidatePath(`/products/${id}`);
}

export async function createSavedProductAction(input: {
  name: string;
  pricingInput: PricingInput;
  sourcePresetId: string | null;
}): Promise<ProductActionResult<SavedProduct>> {
  const result = await run(() => createSavedProduct(input));
  if (result.ok) refresh(result.data.id);
  return result;
}

export async function updateSavedProductAction(id: string, name: string, pricingInput: PricingInput) {
  const result = await run(() => updateSavedProduct(id, { name, pricingInput }));
  if (result.ok) refresh(id);
  return result;
}

export async function renameSavedProductAction(id: string, name: string) {
  const result = await run(() => renameSavedProduct(id, name));
  if (result.ok) refresh(id);
  return result;
}

export async function duplicateSavedProductAction(id: string) {
  const result = await run(() => duplicateSavedProduct(id));
  if (result.ok) refresh(result.data.id);
  return result;
}

export async function deleteSavedProductAction(id: string) {
  const result = await run(async () => { await deleteSavedProduct(id); return { id }; });
  if (result.ok) refresh(id);
  return result;
}

export async function saveRecalculatedProductAction(id: string) {
  const result = await run(() => saveRecalculatedProduct(id));
  if (result.ok) refresh(id);
  return result;
}

export async function previewSavedProductRecalculationAction(id: string) {
  return run(() => previewSavedProductRecalculation(id));
}
