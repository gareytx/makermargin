import { safeDraftId, safeReturnPath } from "@/lib/auth-navigation";
import { AuthShell } from "../auth/auth-shell";
import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ next?: string; draft?: string }> }) {
  const params = await searchParams;
  return <AuthShell title="Reset your password" description="Request a secure password-recovery link."><ForgotPasswordForm next={safeReturnPath(params.next)} draft={safeDraftId(params.draft)} /></AuthShell>;
}
