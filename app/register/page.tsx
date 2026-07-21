import { redirect } from "next/navigation";
import { getVerifiedClaims } from "@/lib/auth";
import { destinationWithDraft, safeDraftId, safeReturnPath } from "@/lib/auth-navigation";
import { AuthShell } from "../auth/auth-shell";
import { RegisterForm } from "./register-form";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string; draft?: string }> }) {
  const params = await searchParams;
  const next = safeReturnPath(params.next);
  const draft = safeDraftId(params.draft);
  if (await getVerifiedClaims()) redirect(destinationWithDraft(next, draft));
  return <AuthShell title="Create your account" description="Create an account to save products in the cloud."><RegisterForm next={next} draft={draft} /></AuthShell>;
}
