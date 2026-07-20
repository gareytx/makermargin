import type { PricingInput, PricingResult } from "./calculations";
import type { ProductPresetId } from "./product-presets";
import type { Database } from "./supabase/database.types";

type SavedProductRow = Database["public"]["Tables"]["saved_products"]["Row"];

export type FormulaVersion = "pricing-v1";

export type CalculationSnapshot = {
  result: PricingResult;
  calculatedAt: string;
  warnings: string[];
};

export type SavedProduct = {
  id: SavedProductRow["id"];
  userId: SavedProductRow["user_id"];
  name: SavedProductRow["name"];
  sourcePresetId: ProductPresetId | null;
  pricingInputs: PricingInput;
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
