import type { ProductPresetId } from "./product-presets";
import type { Database } from "./supabase/database.types";
import type { Json } from "./supabase/database.types";
import type {
  CalculationSnapshot,
  FormulaVersion,
  PricingInputSnapshot,
} from "./saved-product-snapshots";

export type {
  CalculationSnapshot,
  CalculationSnapshotVersion,
  FormulaVersion,
  PricingInputSnapshot,
  PricingInputSnapshotVersion,
  PricingInputSnapshotV1,
  PricingInputSnapshotV2,
  SnapshotBasis,
} from "./saved-product-snapshots";

type SavedProductRow = Database["public"]["Tables"]["saved_products"]["Row"];

export type SavedProduct = {
  id: SavedProductRow["id"];
  userId: SavedProductRow["user_id"];
  name: SavedProductRow["name"];
  sourcePresetId: ProductPresetId | string | null;
  pricingInputs: PricingInputSnapshot | null;
  calculationSnapshot: CalculationSnapshot | null;
  formulaVersion: FormulaVersion | string;
  rawPricingInputs: Json;
  rawCalculationSnapshot: Json;
  createdAt: SavedProductRow["created_at"];
  updatedAt: SavedProductRow["updated_at"];
};

export type SavedProductWrite = {
  name: string;
  sourcePresetId: ProductPresetId | string | null;
  pricingInputs: PricingInputSnapshot;
  calculationSnapshot: CalculationSnapshot;
  formulaVersion: FormulaVersion;
};

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
