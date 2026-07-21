import type { PricingInput, PricingResult } from "./calculations";
import type { ProductPresetId } from "./product-presets";
import type { Database } from "./supabase/database.types";

type SavedProductRow = Database["public"]["Tables"]["saved_products"]["Row"];

export type FormulaVersion = "pricing-v1";
export type SnapshotBasis = "per_sellable_product";
export type PricingInputSnapshotVersion = "pricing-input-v1";
export type CalculationSnapshotVersion = "calculation-snapshot-v1";

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
  id: SavedProductRow["id"];
  userId: SavedProductRow["user_id"];
  name: SavedProductRow["name"];
  sourcePresetId: ProductPresetId | null;
  pricingInputs: PricingInputSnapshot;
  calculationSnapshot: CalculationSnapshot;
  formulaVersion: FormulaVersion;
  createdAt: SavedProductRow["created_at"];
  updatedAt: SavedProductRow["updated_at"];
};

export type SavedProductInsert = Pick<
  SavedProduct,
  | "name"
  | "sourcePresetId"
  | "pricingInputs"
  | "calculationSnapshot"
  | "formulaVersion"
>;

export type SavedProductUpdate = Partial<SavedProductInsert>;

export type PendingSaveDraftVersion = 1;

export type PendingSaveDraft = {
  version: PendingSaveDraftVersion;
  id: string;
  createdAt: string;
  expiresAt: string;
  pricingInputs: PricingInputSnapshot;
  sourcePresetId: ProductPresetId | null;
  intendedProductName: string;
  returnPath: "/";
  intendedAction: "save-product";
};
