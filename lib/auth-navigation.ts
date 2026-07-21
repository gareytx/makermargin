const DRAFT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return "/";
  }
  if (decoded.includes("\\") || /[\u0000-\u001f]/.test(decoded)) return "/";
  try {
    const parsed = new URL(value, "http://makermargin.local");
    return parsed.origin === "http://makermargin.local"
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : "/";
  } catch {
    return "/";
  }
}

export function safeDraftId(value: string | null | undefined): string | null {
  return value && DRAFT_ID_PATTERN.test(value) ? value : null;
}

export function withAuthContext(path: string, next?: string | null, draft?: string | null) {
  const url = new URL(path, "http://makermargin.local");
  url.searchParams.set("next", safeReturnPath(next));
  const validDraft = safeDraftId(draft);
  if (validDraft) url.searchParams.set("draft", validDraft);
  return `${url.pathname}${url.search}`;
}

export function destinationWithDraft(path: string, draft?: string | null) {
  const safe = new URL(safeReturnPath(path), "http://makermargin.local");
  const validDraft = safeDraftId(draft);
  if (validDraft) safe.searchParams.set("draft", validDraft);
  return `${safe.pathname}${safe.search}${safe.hash}`;
}
