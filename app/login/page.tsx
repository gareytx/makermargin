import { redirect } from "next/navigation";
import { getVerifiedClaims } from "@/lib/auth";
import { destinationWithDraft, safeDraftId, safeReturnPath } from "@/lib/auth-navigation";
import { AuthShell } from "../auth/auth-shell";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; draft?: string; error?: string }> }) {
  const params = await searchParams;
  const next = safeReturnPath(params.next);
  const draft = safeDraftId(params.draft);
  if (await getVerifiedClaims()) redirect(destinationWithDraft(next, draft));
  return <AuthShell title="Sign in" description="Sign in to save and manage cloud products."><LoginForm next={next} draft={draft} callbackError={params.error === "callback"} /></AuthShell>;
}
