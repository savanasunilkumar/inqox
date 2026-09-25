import type { SignInFutureResource, SetActiveNavigate } from "@clerk/shared/types";

export type SignInStep = "email" | "password" | "email-code" | "mfa-email" | "mfa-phone" | "mfa-totp" | "mfa-backup" | "reset-code" | "new-password" | "complete";
export type SignInFlow = Pick<SignInFutureResource, "status" | "supportedFirstFactors" | "supportedSecondFactors" | "emailCode" | "mfa" | "resetPasswordEmailCode" | "finalize">;

export function authErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (!error || typeof error !== "object") return fallback;
  const value = error as { longMessage?: string; message?: string; errors?: { longMessage?: string; message?: string }[] };
  return value.errors?.[0]?.longMessage || value.errors?.[0]?.message || value.longMessage || value.message || fallback;
}
export function checkAuthResult(result: { error: unknown }) {
  if (result.error) throw new Error(authErrorMessage(result.error));
}

// Advance only from Clerk's verified state. No UI step or URL can create a session.
export async function advanceSignIn(flow: SignInFlow, navigate: SetActiveNavigate): Promise<SignInStep> {
  if (flow.status === "complete") {
    checkAuthResult(await flow.finalize({ navigate }));
    return "complete";
  }
  if (flow.status === "needs_new_password") return "new-password";
  if (flow.status === "needs_second_factor" || flow.status === "needs_client_trust") {
    const available = new Set(flow.supportedSecondFactors.map(factor => factor.strategy));
    if (available.has("totp")) return "mfa-totp";
    if (available.has("email_code")) {
      checkAuthResult(await flow.mfa.sendEmailCode());
      return "mfa-email";
    }
    if (available.has("phone_code")) {
      checkAuthResult(await flow.mfa.sendPhoneCode());
      return "mfa-phone";
    }
    if (available.has("backup_code")) return "mfa-backup";
    throw new Error("Your account needs an additional verification method that is not available here. Please contact support.");
  }
  if (flow.status === "needs_first_factor") {
    if (flow.supportedFirstFactors.some(factor => factor.strategy === "password")) return "password";
    if (flow.supportedFirstFactors.some(factor => factor.strategy === "email_code")) {
      checkAuthResult(await flow.emailCode.sendCode());
      return "email-code";
    }
  }
  if (flow.status === "needs_protect_check") throw new Error("A security check is required. Refresh the page and try again.");
  throw new Error("Couldn’t complete sign-in. Please start again.");
}
export async function verifySignInCode(flow: SignInFlow, step: SignInStep, code: string, navigate: SetActiveNavigate) {
  if (step === "reset-code") {
    checkAuthResult(await flow.resetPasswordEmailCode.verifyCode({ code }));
    if (flow.status !== "needs_new_password") throw new Error("Couldn’t verify the reset code. Please request another.");
    return "new-password" as const;
  }
  const methods = {
    "email-code": () => flow.emailCode.verifyCode({ code }),
    "mfa-email": () => flow.mfa.verifyEmailCode({ code }),
    "mfa-phone": () => flow.mfa.verifyPhoneCode({ code }),
    "mfa-totp": () => flow.mfa.verifyTOTP({ code }),
    "mfa-backup": () => flow.mfa.verifyBackupCode({ code }),
  };
  if (!(step in methods)) throw new Error("Start sign-in again to request a new code.");
  checkAuthResult(await methods[step as keyof typeof methods]());
  return advanceSignIn(flow, navigate);
}
export async function resendSignInCode(flow: SignInFlow, step: SignInStep) {
  if (step === "email-code") checkAuthResult(await flow.emailCode.sendCode());
  else if (step === "mfa-email") checkAuthResult(await flow.mfa.sendEmailCode());
  else if (step === "mfa-phone") checkAuthResult(await flow.mfa.sendPhoneCode());
  else if (step === "reset-code") checkAuthResult(await flow.resetPasswordEmailCode.sendCode());
  else throw new Error("Use a code from your authenticator or your saved backup codes.");
}
