import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterForm } from "../register/register-form";
import { LoginForm } from "../login/login-form";
import { ForgotPasswordForm } from "../forgot-password/forgot-password-form";
import { UpdatePasswordForm } from "../update-password/update-password-form";

const auth = {
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  getSession: vi.fn(),
  updateUser: vi.fn(),
};
let configured = true;

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabaseClient: () => configured ? { auth } : null,
}));

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("authentication forms", () => {
  beforeEach(() => {
    configured = true;
    vi.clearAllMocks();
    auth.signUp.mockResolvedValue({ error: null });
    auth.signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    auth.getSession.mockResolvedValue({ data: { session: {} } });
    auth.updateUser.mockResolvedValue({ error: null });
  });

  it("shows a safe unavailable state without public configuration", () => {
    configured = false;
    render(<RegisterForm next="/" draft={null} />);
    expect(screen.getByRole("alert").textContent).toContain("Authentication is unavailable");
  });

  it("validates registration mismatch and then shows confirmation state", async () => {
    const { container } = render(<RegisterForm next="/" draft="550e8400-e29b-41d4-a716-446655440000" />);
    fill("Email", "person@example.test"); fill("Password", "secret1"); fill("Confirm password", "secret2");
    fireEvent.submit(container.querySelector("form")!);
    expect((await screen.findByRole("alert")).textContent).toContain("Passwords do not match");
    fill("Confirm password", "secret1"); fireEvent.submit(container.querySelector("form")!);
    expect((await screen.findByRole("status")).textContent).toContain("Check your email");
    expect(auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ emailRedirectTo: expect.stringContaining("draft=550e8400-e29b-41d4-a716-446655440000") }) }));
  });

  it("normalizes invalid login credentials and preserves draft links", async () => {
    const { container } = render(<LoginForm next="/" draft="550e8400-e29b-41d4-a716-446655440000" callbackError={false} />);
    fill("Email", "person@example.test"); fill("Password", "wrong"); fireEvent.submit(container.querySelector("form")!);
    expect((await screen.findByRole("alert")).textContent).toContain("Email or password is incorrect");
    expect(screen.getByRole("link", { name: "Register" }).getAttribute("href")).toContain("draft=");
  });

  it("uses generic password-reset messaging even when Supabase returns an error", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: { message: "network" } });
    const { container } = render(<ForgotPasswordForm next="/" draft={null} />);
    fill("Email", "unknown@example.test"); fireEvent.submit(container.querySelector("form")!);
    expect((await screen.findByRole("status")).textContent).toContain("If an account exists");
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("unknown@example.test", expect.objectContaining({ redirectTo: expect.stringContaining("/auth/callback") }));
  });

  it("handles invalid recovery sessions and password mismatch", async () => {
    auth.getSession.mockResolvedValueOnce({ data: { session: null } });
    const first = render(<UpdatePasswordForm next="/" draft={null} />);
    expect((await screen.findByRole("alert")).textContent).toContain("invalid or expired");
    first.unmount();
    auth.getSession.mockResolvedValueOnce({ data: { session: {} } });
    const { container } = render(<UpdatePasswordForm next="/" draft={null} />);
    await waitFor(() => expect(screen.getByLabelText("New password")).toBeTruthy());
    fill("New password", "secret1"); fill("Confirm new password", "secret2"); fireEvent.submit(container.querySelector("form")!);
    expect((await screen.findByRole("alert")).textContent).toContain("Passwords do not match");
  });
});
