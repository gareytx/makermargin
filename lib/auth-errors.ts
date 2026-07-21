export function normalizeAuthError(message?: string) {
  const value = message?.toLowerCase() ?? "";
  if (value.includes("invalid login credentials")) return "Email or password is incorrect.";
  if (value.includes("password")) return "The password does not meet the required format.";
  return "Authentication could not be completed. Please try again.";
}
