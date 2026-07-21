import { NextResponse, type NextRequest } from "next/server";
import { destinationWithDraft, safeDraftId, safeReturnPath, withAuthContext } from "@/lib/auth-navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeReturnPath(request.nextUrl.searchParams.get("next"));
  const draft = safeDraftId(request.nextUrl.searchParams.get("draft"));
  const supabase = await createServerSupabaseClient();
  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(destinationWithDraft(next, draft), request.url));
  }
  return NextResponse.redirect(new URL(withAuthContext("/login", next, draft) + "&error=callback", request.url));
}
