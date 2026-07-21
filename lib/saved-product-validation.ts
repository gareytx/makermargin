const PRODUCT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COPY_SUFFIX = " — Copy";
const MAX_NAME_LENGTH = 120;

export function safeProductId(value: string | null | undefined): string | null {
  return value && PRODUCT_ID_PATTERN.test(value) ? value : null;
}

export function duplicateProductName(name: string): string {
  const suffixLength = Array.from(COPY_SUFFIX).length;
  const base = Array.from(name).slice(0, MAX_NAME_LENGTH - suffixLength).join("");
  return `${base}${COPY_SUFFIX}`;
}
