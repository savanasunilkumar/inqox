"use client";
import { CustomSignIn, CustomSignUp } from "@/components/custom-auth-form";
import { ArrowUpRight, Check, Fingerprint, LockKeyhole } from "lucide-react";

export function AuthPage({ signUp = false }: { signUp?: boolean }) {
  return (
    <main id="main-content" className="auth-page">
      <aside className="auth-story">
        <a href="/sign-in" className="auth-wordmark" aria-label="inqox home">inqox<span>.</span></a>
        <div className="auth-story-copy">
          <span className="auth-eyebrow"><span /> A LITTLE MORE DIRECTION.</span>
          <h1>Your next chapter.<br /><span>Starts with you.</span></h1>
          <p>A place for your experience, your ambitions,<br className="hidden xl:block" /> and the opportunities that come next.</p>
          <div className="auth-path" aria-label="Your journey: Profile, Discover, Apply">
            <div className="auth-path-item"><span className="auth-path-icon"><Fingerprint size={21} strokeWidth={1.5} /></span><div><strong>Make it yours</strong><span>One profile. Your story.</span></div><Check size={15} className="ml-auto opacity-40" /></div>
            <div className="auth-path-item"><span className="auth-path-number">02</span><div><strong>Find your next role</strong><span>Openings, straight from companies.</span></div></div>
            <div className="auth-path-item"><span className="auth-path-number">03</span><div><strong>Take the next step</strong><span>Your details, ready when you are.</span></div><ArrowUpRight size={18} className="ml-auto opacity-40" /></div>
          </div>
        </div>
        <div className="auth-story-footer"><span>YOUR CAREER. YOUR PACE.</span><span>inqox © {new Date().getFullYear()}</span></div>
        <div className="auth-orbit auth-orbit-one" aria-hidden="true" /><div className="auth-orbit auth-orbit-two" aria-hidden="true" />
      </aside>
      <section className="auth-form-panel" aria-label={signUp ? "Create an account" : "Sign in"}>
        <a href="/sign-in" className="auth-mobile-wordmark" aria-label="inqox home">inqox<span>.</span></a>
        <div className="auth-form-wrap">
          <div className="auth-form-intro"><span className="auth-eyebrow">{signUp ? "LET’S GET YOU STARTED" : "YOUR NEXT STEP AWAITS"}</span></div>
          {signUp ? <CustomSignUp /> : <CustomSignIn />}
          <p className="auth-profile-note"><LockKeyhole size={14} aria-hidden="true" />Your profile and résumé stay private.</p>
        </div>
        <p className="auth-panel-footer">A little less searching. A little more possibility.</p>
      </section>
    </main>
  );
}
