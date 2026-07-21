import { safeDraftId, safeReturnPath } from "@/lib/auth-navigation";
import { AuthShell } from "../auth/auth-shell";
import { UpdatePasswordForm } from "./update-password-form";

export default async function UpdatePasswordPage({ searchParams }: { searchParams: Promise<{ next?: string; draft?: string }> }) {
  const params = await searchParams;
  return <AuthShell title="Choose a new password" description="Set a new password for your MakerMargin account."><UpdatePasswordForm next={safeReturnPath(params.next)} draft={safeDraftId(params.draft)} /></AuthShell>;
}
