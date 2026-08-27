export type PricingInput = {
  productName: string;
  materialCost: number;
  packagingCost: number;
  otherCost: number;
  wastePercentage: number;
  machineMinutes: number;
  machineHourlyRate: number;
  laborMinutes: number;
  laborHourlyRate: number;
  marketplaceFeePercentage: number;
  processingFeePercentage: number;
  fixedTransactionFee: number;
  shippingCost: number;
  customerPaysShipping: boolean;
  desiredMarginPercentage: number;
};

export type PricingResult = {
  hardCost: number;
  wasteCost: number;
  machineCost: number;
  laborCost: number;
  shippingCostIncluded: number;
  trueBaseCost: number;
  recommendedPrice: number;
  estimatedFees: number;
  netProfit: number;
  profitMarginPercentage: number;
  effectiveHourlyEarnings: number;
};

export type PricingValidation = {
  errors: string[];
  warnings: string[];
};

export type ViabilityFactorStatus = "strong" | "watch" | "weak";

export type ViabilityFactor = {
  id:
    | "profit_margin"
    | "hourly_earnings"
    | "production_time"
    | "shipping_burden";
  label: string;
  points: number;
  maxPoints: number;
  status: ViabilityFactorStatus;
  explanation: string;
};

export type ProductViability = {
  score: number;
  label: string;
  summary: string;
  recommendation: string;
  factors: ViabilityFactor[];
};

export type PricingCalculation =
  | { valid: true; result: PricingResult; validation: PricingValidation }
  | { valid: false; validation: PricingValidation };

const numericFields = [
  ["materialCost", "Material cost"],
  ["packagingCost", "Packaging cost"],
  ["otherCost", "Other cost"],
  ["wastePercentage", "Waste percentage"],
  ["machineMinutes", "Machine time"],
  ["machineHourlyRate", "Machine hourly rate"],
  ["laborMinutes", "Labor time"],
  ["laborHourlyRate", "Labor hourly rate"],
  ["marketplaceFeePercentage", "Marketplace fee percentage"],
  ["processingFeePercentage", "Processing fee percentage"],
  ["fixedTransactionFee", "Fixed transaction fee"],
  ["shippingCost", "Shipping cost"],
  ["desiredMarginPercentage", "Desired profit margin"],
] as const satisfies ReadonlyArray<readonly [keyof PricingInput, string]>;

const percentageFields = [
  ["wastePercentage", "Waste percentage"],
  ["marketplaceFeePercentage", "Marketplace fee percentage"],
  ["processingFeePercentage", "Processing fee percentage"],
  ["desiredMarginPercentage", "Desired profit margin"],
] as const satisfies ReadonlyArray<readonly [keyof PricingInput, string]>;

export function validatePricingInput(input: PricingInput): PricingValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [field, label] of numericFields) {
    const value = input[field];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.push(`${label} must be a finite number.`);
    } else if (value < 0) {
      errors.push(`${label} cannot be negative.`);
    }
  }

  for (const [field, label] of percentageFields) {
    if (Number.isFinite(input[field]) && input[field] > 100) {
      errors.push(`${label} must be between 0% and 100%.`);
    }
  }

  const allFinite = numericFields.every(([field]) =>
    Number.isFinite(input[field])
  );

  if (allFinite) {
    if (input.machineMinutes > 0 && input.machineHourlyRate === 0) {
      errors.push("Machine hourly rate must be above zero when machine time is used.");
    }
    if (input.laborMinutes > 0 && input.laborHourlyRate === 0) {
      errors.push("Labor hourly rate must be above zero when labor time is used.");
    }
    if (input.machineMinutes === 0 && input.laborMinutes === 0) {
      errors.push("Machine time and labor time cannot both be zero.");
    }
    if (input.desiredMarginPercentage >= 100) {
      errors.push("Desired profit margin must be less than 100%.");
    }

    const totalFees =
      input.marketplaceFeePercentage + input.processingFeePercentage;
    if (input.desiredMarginPercentage + totalFees >= 100) {
      errors.push("Desired margin plus percentage fees must total less than 100%.");
    }

    if (input.desiredMarginPercentage > 70) {
      warnings.push("Desired profit margin is above 70%.");
    }
    if (totalFees > 30) {
      warnings.push("Total percentage fees are above 30%.");
    }
    if (input.wastePercentage > 50) {
      warnings.push("Waste percentage is above 50%.");
    }
    if (input.machineMinutes + input.laborMinutes > 90) {
      warnings.push("Total production time is above 90 minutes.");
    }
  }

  return { errors, warnings };
}

export function calculatePricing(input: PricingInput): PricingCalculation {
  const validation = validatePricingInput(input);
  if (validation.errors.length > 0) return { valid: false, validation };

  const hardCost = input.materialCost + input.packagingCost + input.otherCost;
  const wasteCost = input.materialCost * (input.wastePercentage / 100);
  const machineCost = (input.machineMinutes / 60) * input.machineHourlyRate;
  const laborCost = (input.laborMinutes / 60) * input.laborHourlyRate;
  const shippingCostIncluded = input.customerPaysShipping ? 0 : input.shippingCost;
  const trueBaseCost =
    hardCost + wasteCost + machineCost + laborCost + shippingCostIncluded;
  const percentageFees =
    (input.marketplaceFeePercentage + input.processingFeePercentage) / 100;
  const recommendedPrice =
    (trueBaseCost + input.fixedTransactionFee) /
    (1 - input.desiredMarginPercentage / 100 - percentageFees);
  const estimatedFees = recommendedPrice * percentageFees + input.fixedTransactionFee;
  const netProfit = recommendedPrice - trueBaseCost - estimatedFees;
  const profitMarginPercentage =
    recommendedPrice > 0 ? (netProfit / recommendedPrice) * 100 : 0;
  const totalProductionHours = (input.machineMinutes + input.laborMinutes) / 60;
  const effectiveHourlyEarnings = netProfit / totalProductionHours;

  const result: PricingResult = {
    hardCost,
    wasteCost,
    machineCost,
    laborCost,
    shippingCostIncluded,
    trueBaseCost,
    recommendedPrice,
    estimatedFees,
    netProfit,
    profitMarginPercentage,
    effectiveHourlyEarnings,
  };

  if (Object.values(result).some((value) => !Number.isFinite(value))) {
    return {
      valid: false,
      validation: {
        ...validation,
        errors: [
          ...validation.errors,
          "These values are too large to calculate a reliable price. Reduce one or more inputs.",
        ],
      },
    };
  }

  if (
    !input.customerPaysShipping &&
    recommendedPrice > 0 &&
    input.shippingCost / recommendedPrice > 0.25
  ) {
    validation.warnings.push("Shipping is more than 25% of the selling price.");
  }
  if (effectiveHourlyEarnings < 40) {
    validation.warnings.push("Effective hourly earnings are below $40 per hour.");
  }

  return { valid: true, result, validation };
}

export function scoreProfitMargin(profitMarginPercentage: number): ViabilityFactor {
  let points = 4;
  if (profitMarginPercentage >= 50) points = 30;
  else if (profitMarginPercentage >= 40) points = 25;
  else if (profitMarginPercentage >= 30) points = 20;
  else if (profitMarginPercentage >= 20) points = 12;

  return {
    id: "profit_margin",
    label: "Profit margin",
    points,
    maxPoints: 30,
    status: points >= 25 ? "strong" : points >= 12 ? "watch" : "weak",
    explanation: `${profitMarginPercentage.toFixed(1)}% profit margin earns ${points} of 30 viability points.`,
  };
}

export function scoreHourlyEarnings(effectiveHourlyEarnings: number): ViabilityFactor {
  let points = 2;
  if (effectiveHourlyEarnings >= 40) points = 30;
  else if (effectiveHourlyEarnings >= 30) points = 24;
  else if (effectiveHourlyEarnings >= 20) points = 16;
  else if (effectiveHourlyEarnings >= 10) points = 8;

  return {
    id: "hourly_earnings",
    label: "Effective hourly earnings",
    points,
    maxPoints: 30,
    status: points >= 24 ? "strong" : points >= 16 ? "watch" : "weak",
    explanation: `${currency(effectiveHourlyEarnings)} effective hourly earnings earns ${points} of 30 viability points.`,
  };
}

export function scoreProductionTime(totalMinutes: number): ViabilityFactor {
  let points = 3;
  if (totalMinutes <= 15) points = 20;
  else if (totalMinutes <= 30) points = 16;
  else if (totalMinutes <= 60) points = 12;
  else if (totalMinutes <= 90) points = 7;

  const formattedMinutes = Number.isInteger(totalMinutes)
    ? totalMinutes.toString()
    : totalMinutes.toFixed(1);

  return {
    id: "production_time",
    label: "Production time",
    points,
    maxPoints: 20,
    status: points >= 16 ? "strong" : points >= 7 ? "watch" : "weak",
    explanation: `${formattedMinutes} minutes of combined machine and labor time earns ${points} of 20 viability points.`,
  };
}

export function scoreShippingBurden(
  customerPaysShipping: boolean,
  shippingRatio: number
): ViabilityFactor {
  let points = 4;
  if (customerPaysShipping || shippingRatio <= 0.1) points = 20;
  else if (shippingRatio <= 0.15) points = 16;
  else if (shippingRatio <= 0.25) points = 10;

  return {
    id: "shipping_burden",
    label: "Shipping burden",
    points,
    maxPoints: 20,
    status: points >= 16 ? "strong" : points >= 10 ? "watch" : "weak",
    explanation: customerPaysShipping
      ? "The customer pays shipping separately, earning 20 of 20 viability points."
      : `Shipping is ${(shippingRatio * 100).toFixed(1)}% of the recommended selling price, earning ${points} of 20 viability points.`,
  };
}

export function calculateViability(
  input: PricingInput,
  result: PricingResult
): ProductViability {
  const totalMinutes = input.machineMinutes + input.laborMinutes;
  const shippingRatio = input.customerPaysShipping
    ? 0
    : input.shippingCost / result.recommendedPrice;
  const factors = [
    scoreProfitMargin(result.profitMarginPercentage),
    scoreHourlyEarnings(result.effectiveHourlyEarnings),
    scoreProductionTime(totalMinutes),
    scoreShippingBurden(input.customerPaysShipping, shippingRatio),
  ];
  const score = factors.reduce((sum, factor) => sum + factor.points, 0);

  let label = "Weak";
  if (score >= 85) label = "Excellent";
  else if (score >= 70) label = "Good";
  else if (score >= 50) label = "Caution";

  if (result.effectiveHourlyEarnings < 40) {
    return {
      score,
      label,
      summary: "Low effective hourly earnings are the primary weakness.",
      recommendation: "Raise the price, reduce hands-on time, or batch production to improve hourly earnings.",
      factors,
    };
  }
  if (shippingRatio > 0.25) {
    return {
      score,
      label,
      summary: "High shipping burden is the primary weakness.",
      recommendation: "Consider separate shipping, bundles, or packaging changes before scaling.",
      factors,
    };
  }
  if (totalMinutes > 90) {
    return {
      score,
      label,
      summary: "Excessive production time is the primary weakness.",
      recommendation: "Simplify or batch the production process to improve throughput.",
      factors,
    };
  }
  if (result.profitMarginPercentage < 30) {
    return {
      score,
      label,
      summary: "Weak profit margin is the primary weakness.",
      recommendation: "Reduce costs or test a higher selling price before scaling.",
      factors,
    };
  }

  return {
    score,
    label,
    summary: "Strong overall economics with no major weakness identified.",
    recommendation: "This product is a good candidate for market testing and measured scaling.",
    factors,
  };
}

export function currency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function percent(value: number): string {
  return `${value.toFixed(1)}%`;
}
