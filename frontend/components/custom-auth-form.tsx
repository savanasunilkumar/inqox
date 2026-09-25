"use client";

import { useSignIn, useSignUp } from "@clerk/nextjs";
import type { SetActiveNavigate } from "@clerk/shared/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { advanceSignIn, authErrorMessage, checkAuthResult, resendSignInCode, verifySignInCode, type SignInStep } from "@/lib/custom-auth-flow";

function useProfileNavigation(): SetActiveNavigate {
  const router = useRouter();
  return ({ session, decorateUrl }) => {
    if (session.currentTask) throw new Error("Your account has an unfinished security step. Complete it in your account settings before continuing.");
    const url = decorateUrl("/profile");
    if (url.startsWith("http")) window.location.assign(url);
    else router.replace(url);
  };
}
function useFormAction() {
  const active = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: () => Promise<void>) {
    if (active.current) return;
    active.current = true;
    setBusy(true); setError("");
    try { await action(); }
    catch (failure) { setError(authErrorMessage(failure)); }
    finally { active.current = false; setBusy(false); }
  }
  return { busy, error, run };
}
function useResendDelay() {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!remaining) return;
    const timer = setTimeout(() => setRemaining(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);
  return { remaining, sent: () => setRemaining(30) };
}
function Heading({ title, description, verification = false }: { title: string; description: string; verification?: boolean }) {
  return <div className="custom-auth-heading">{verification && <span className="custom-auth-emblem"><ShieldCheck size={22} strokeWidth={1.5} aria-hidden="true" /></span>}<h1>{title}</h1><p>{description}</p></div>;
}
function Submit({ busy, children, disabled = false }: { busy: boolean; children: ReactNode; disabled?: boolean }) {
  return <button type="submit" className="custom-auth-primary" disabled={busy || disabled}><span>{busy ? "Please wait…" : children}</span>{busy ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}</button>;
}
function PasswordField({ id, value, onChange, fresh = false, disabled = false }: { id: string; value: string; onChange: (value: string) => void; fresh?: boolean; disabled?: boolean }) {
  const [visible, setVisible] = useState(false);
  return <div className="custom-auth-field"><label htmlFor={id}>{fresh ? "New password" : "Password"}</label><div className="custom-auth-password"><input id={id} name="password" type={visible ? "text" : "password"} autoComplete={fresh ? "new-password" : "current-password"} value={value} onChange={event => onChange(event.target.value)} placeholder={fresh ? "Create a strong password" : "Enter your password"} required disabled={disabled} /><button type="button" onClick={() => setVisible(current => !current)} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} disabled={disabled}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>;
}
function CodeField({ value, onChange, backup = false, disabled = false }: { value: string; onChange: (value: string) => void; backup?: boolean; disabled?: boolean }) {
  return <div className="custom-auth-field"><label htmlFor="auth-code">{backup ? "Backup code" : "Verification code"}</label><input id="auth-code" name="code" className="custom-auth-code" type="text" inputMode={backup ? "text" : "numeric"} autoComplete="one-time-code" value={value} onChange={event => onChange(backup ? event.target.value.trim() : event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder={backup ? "Enter your backup code" : "000000"} maxLength={backup ? 32 : 6} minLength={backup ? 1 : 6} required disabled={disabled} autoFocus /></div>;
}
function FormError({ error }: { error: string }) {
  return error ? <p id="auth-error" className="custom-auth-error" role="alert">{error}</p> : null;
}

export function CustomSignIn() {
  const { signIn, fetchStatus } = useSignIn();
  const navigate = useProfileNavigation();
  const { busy: submitting, error, run } = useFormAction();
  const busy = submitting || fetchStatus === "fetching";
  const { remaining, sent } = useResendDelay();
  const [step, setStep] = useState<SignInStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const isCode = ["email-code", "mfa-email", "mfa-phone", "mfa-totp", "mfa-backup", "reset-code"].includes(step);
  const resetMode = step === "reset-code" || step === "new-password";
  const canResend = ["email-code", "mfa-email", "mfa-phone", "reset-code"].includes(step);

  async function advance() {
    const next = await advanceSignIn(signIn, navigate);
    setStep(next); setCode("");
    if (["email-code", "mfa-email", "mfa-phone"].includes(next)) sent();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      if (step === "email") {
        checkAuthResult(await signIn.create({ identifier: email.trim() }));
        await advance();
      } else if (step === "password") {
        checkAuthResult(await signIn.password({ identifier: email.trim(), password }));
        setPassword(""); await advance();
      } else if (step === "new-password") {
        checkAuthResult(await signIn.resetPasswordEmailCode.submitPassword({ password }));
        setPassword(""); await advance();
      } else if (isCode) {
        const next = await verifySignInCode(signIn, step, code, navigate);
        setStep(next); setCode("");
      }
    });
  }
  function restart() {
    void run(async () => { checkAuthResult(await signIn.reset()); setPassword(""); setCode(""); setStep("email"); });
  }
  function resetPassword() {
    void run(async () => {
      checkAuthResult(await signIn.resetPasswordEmailCode.sendCode());
      setPassword(""); setCode(""); setStep("reset-code"); sent();
    });
  }
  const title = step === "new-password" ? "A fresh start." : step === "reset-code" ? "Reset your password." : isCode ? "Verify it’s you." : "Welcome back.";
  const description = step === "new-password" ? "Choose a new password for your inqox account." : step === "mfa-totp" ? "Enter the code from your authenticator app." : step === "mfa-backup" ? "Use one of your saved backup codes." : step === "mfa-phone" ? "Enter the code sent to your account’s phone number." : isCode ? `Enter the six-digit code sent to ${email}.` : step === "password" ? "Enter your password to continue." : "Pick up where your next chapter left off.";
  return <>
    <Heading title={title} description={description} verification={isCode} />
    <FormError error={error} />
    <form onSubmit={submit} className="custom-auth-form" aria-busy={busy} aria-describedby={error ? "auth-error" : undefined}>
      {step === "email" ? <div className="custom-auth-field"><label htmlFor="signin-email">Email address</label><div className="custom-auth-email"><Mail size={17} aria-hidden="true" /><input id="signin-email" name="email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" required disabled={busy} autoFocus /></div></div> : <div className="custom-auth-identity"><span>{email}</span><button type="button" onClick={restart} disabled={busy}>Change</button></div>}
      {(step === "password" || step === "new-password") && <PasswordField key={step} id="signin-password" value={password} onChange={setPassword} fresh={step === "new-password"} disabled={busy} />}
      {step === "password" && <button type="button" className="custom-auth-forgot" onClick={resetPassword} disabled={busy}>Forgot password?</button>}
      {isCode && <CodeField value={code} onChange={setCode} backup={step === "mfa-backup"} disabled={busy} />}
      <Submit busy={busy} disabled={step === "complete" || (isCode && (step === "mfa-backup" ? !code : code.length !== 6))}>{step === "email" ? "Continue with email" : step === "new-password" ? "Save password & continue" : step === "complete" ? "Opening your profile…" : isCode ? "Verify & continue" : "Sign in"}</Submit>
      {isCode && <div className="custom-auth-links">{canResend ? <button type="button" disabled={busy || remaining > 0} onClick={() => void run(async () => { await resendSignInCode(signIn, step); sent(); })}>{remaining ? `Resend in ${remaining}s` : "Resend code"}</button> : <span />}{step.startsWith("mfa-") && step !== "mfa-backup" && signIn.supportedSecondFactors.some(factor => factor.strategy === "backup_code") ? <button type="button" disabled={busy} onClick={() => { setStep("mfa-backup"); setCode(""); }}>Use a backup code</button> : <button type="button" onClick={restart} disabled={busy}>Start again</button>}</div>}
      {step === "new-password" && <button type="button" className="custom-auth-forgot" onClick={restart} disabled={busy}>Back to sign in</button>}
    </form>
    {!resetMode && <p className="custom-auth-switch">New to inqox? <Link href="/sign-up">Create an account <ArrowRight size={13} aria-hidden="true" /></Link></p>}
    <div id="clerk-captcha" />
  </>;
}

export function CustomSignUp() {
  const { signUp, fetchStatus } = useSignUp();
  const navigate = useProfileNavigation();
  const { busy: submitting, error, run } = useFormAction();
  const busy = submitting || fetchStatus === "fetching";
  const { remaining, sent } = useResendDelay();
  const [step, setStep] = useState<"details" | "verify" | "complete">("details");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  async function finishOrVerify() {
    if (signUp.status === "complete") { checkAuthResult(await signUp.finalize({ navigate })); setStep("complete"); return; }
    if (signUp.missingFields.length) throw new Error("Your account needs additional details. Please contact support to finish setup.");
    if (signUp.unverifiedFields.includes("email_address")) {
      // Switch immediately so a failed send can be retried without recreating the account.
      setStep("verify");
      checkAuthResult(await signUp.verifications.sendEmailCode()); sent();
      return;
    }
    throw new Error("Couldn’t complete account verification. Please try again.");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      if (step === "details") {
        checkAuthResult(await signUp.password({ emailAddress: email.trim(), password }));
        setPassword(""); await finishOrVerify();
      } else if (step === "verify") {
        checkAuthResult(await signUp.verifications.verifyEmailCode({ code }));
        if (signUp.status !== "complete") throw new Error("Verification is incomplete. Check your code and try again.");
        checkAuthResult(await signUp.finalize({ navigate })); setStep("complete");
      }
    });
  }
  return <>
    <Heading title={step === "verify" ? "Check your inbox." : "Make your next move."} description={step === "verify" ? `We sent a six-digit code to ${email}.` : "Create an account. Then make your profile yours."} verification={step === "verify"} />
    <FormError error={error} />
    <form onSubmit={submit} className="custom-auth-form" aria-busy={busy} aria-describedby={error ? "auth-error" : undefined}>
      {step === "details" ? <><div className="custom-auth-field"><label htmlFor="signup-email">Email address</label><div className="custom-auth-email"><Mail size={17} aria-hidden="true" /><input id="signup-email" name="email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" required disabled={busy} autoFocus /></div></div><PasswordField id="signup-password" value={password} onChange={setPassword} fresh disabled={busy} /><p className="custom-auth-hint">Use a unique password for your account.</p></> : step === "verify" ? <CodeField value={code} onChange={setCode} disabled={busy} /> : null}
      <div id="clerk-captcha" />
      <Submit busy={busy} disabled={step === "complete" || (step === "verify" && code.length !== 6)}>{step === "verify" ? "Verify & create account" : step === "complete" ? "Opening your profile…" : "Create account"}</Submit>
      {step === "verify" && <div className="custom-auth-links"><button type="button" disabled={busy || remaining > 0} onClick={() => void run(async () => { checkAuthResult(await signUp.verifications.sendEmailCode()); sent(); })}>{remaining ? `Resend in ${remaining}s` : "Resend code"}</button><button type="button" disabled={busy} onClick={() => void run(async () => { checkAuthResult(await signUp.reset()); setCode(""); setPassword(""); setStep("details"); })}>Change email</button></div>}
    </form>
    <p className="custom-auth-switch">Already have an account? <Link href="/sign-in">Sign in <ArrowRight size={13} aria-hidden="true" /></Link></p>
  </>;
}
