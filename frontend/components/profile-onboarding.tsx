"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BriefcaseBusiness, Check, CircleAlert, Inbox, Kanban, LayoutDashboard, LoaderCircle, LockKeyholeOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { profileFields } from "@/lib/profile-model";
import { profileCompletion, requiredProfileFields } from "@/lib/profile-completion";
import { COUNTRIES, US_STATES, fieldUi, onboardingSteps, type OnboardingStep } from "@/lib/onboarding-steps";

type Completion = ReturnType<typeof profileCompletion>;
type Props = {
  fields: Record<string, string>;
  onFieldChange: (field: string, value: string) => void;
  prefilled: Record<string, string>;
  completion: Completion;
  background: React.ReactNode;
  onSave: () => Promise<void>;
  finishHref?: string;
  linkTiles?: boolean;
};

const required = new Set<string>(requiredProfileFields);
const fieldByKey = new Map(profileFields.map(f => [f.key, f]));

function errorFor(key: string, value: string | undefined): string {
  if (!value?.trim()) return "This is required";
  if (key === "email") return "Enter a valid email address";
  if (key === "yearsExperience") return "Enter a number, like 3";
  if (key === "availableDate") return "Pick a date";
  return "Choose one of the options";
}

function missingIn(step: OnboardingStep, completion: Completion) {
  return step.fields.filter(k => completion.missing.includes(k));
}

export function ProfileOnboarding({ fields, onFieldChange, prefilled, completion, background, onSave, finishHref = "/job-board", linkTiles = true }: Props) {
  const [stepIndex, setStepIndex] = useState(() => {
    const first = onboardingSteps.findIndex(s => missingIn(s, completion).length > 0);
    return first === -1 ? 0 : first;
  });
  const [attempted, setAttempted] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [finished, setFinished] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  const step = onboardingSteps[stepIndex];
  const stepMissing = missingIn(step, completion);
  const requiredLeft = completion.missing.length;
  const percent = Math.round((completion.completed / completion.total) * 100);

  useEffect(() => {
    top.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [stepIndex, finished]);

  function goTo(index: number) {
    setSaveError("");
    setStepIndex(index);
  }

  async function next() {
    setAttempted(prev => new Set(prev).add(step.id));
    if (stepMissing.length > 0) {
      document.getElementById(`field-${stepMissing[0]}`)?.focus();
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await onSave();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn’t save your answers. Please try again.");
      setSaving(false);
      return;
    }
    setSaving(false);
    if (stepIndex < onboardingSteps.length - 1) {
      goTo(stepIndex + 1);
      return;
    }
    const firstIncomplete = onboardingSteps.findIndex(s => missingIn(s, completion).length > 0);
    if (firstIncomplete === -1) setFinished(true);
    else {
      setAttempted(new Set(onboardingSteps.map(s => s.id)));
      goTo(firstIncomplete);
    }
  }

  if (finished && completion.complete) {
    return (
      <div ref={top} className="mx-auto flex w-full max-w-xl flex-col items-center px-6 py-16 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 ring-8 ring-emerald-500/5 dark:text-emerald-400">
          <LockKeyholeOpen className="size-6" aria-hidden="true" />
        </span>
        <h2 className="mt-6 text-2xl font-semibold tracking-tight">Your workspace is unlocked</h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          Your profile has everything a typical US job application asks for. You can update any answer here at any time.
        </p>
        <div className="mt-8 grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
            { label: "Job Board", href: "/job-board", icon: BriefcaseBusiness },
            { label: "Inbox", href: "/inbox", icon: Inbox },
            { label: "Tracker", href: "/tracker", icon: Kanban },
          ].map(({ label, href, icon: Icon }) => (
            <Link key={label} href={linkTiles ? href : "#"} aria-disabled={!linkTiles || undefined} onClick={e => { if (!linkTiles) e.preventDefault(); }} className="flex flex-col items-center gap-1.5 rounded-xl border bg-card px-3 py-3 text-xs font-medium transition-colors outline-none hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50">
              <Icon className="size-4 text-primary" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Button asChild className="h-10 gap-2 px-5">
            <Link href={finishHref}>Explore the Job Board<ArrowRight aria-hidden="true" /></Link>
          </Button>
          <Button variant="ghost" className="h-10 px-4" onClick={() => { setFinished(false); goTo(0); }}>
            Review profile
          </Button>
        </div>
      </div>
    );
  }

  const showErrors = attempted.has(step.id);

  return (
    <div ref={top} className="mx-auto w-full max-w-5xl scroll-mt-4 px-4 py-6 sm:px-8 sm:py-8">
      {/* Progress summary */}
      <div className="mb-6 rounded-2xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Step {stepIndex + 1} of {onboardingSteps.length}
            </p>
            <h2 className="text-base font-semibold tracking-tight sm:text-lg">
              {completion.complete ? "Profile complete" : "Finish your profile to unlock your workspace"}
            </h2>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {completion.complete ? (
              <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400"><Check className="size-3.5" aria-hidden="true" />All required answers done</span>
            ) : (
              <><span className="font-semibold text-foreground">{requiredLeft}</span> required {requiredLeft === 1 ? "answer" : "answers"} left · {percent}%</>
            )}
          </p>
        </div>
        <div role="progressbar" aria-label="Profile completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
        {/* Stepper */}
        <nav aria-label="Profile steps" className="-mx-4 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,black_85%,transparent)] [scrollbar-width:none] lg:mx-0 lg:overflow-visible lg:px-0 lg:[mask-image:none] [&::-webkit-scrollbar]:hidden">
          <ol className="flex gap-2 pr-10 lg:sticky lg:pr-0 lg:top-4 lg:flex-col lg:gap-1">
            {onboardingSteps.map((s, index) => {
              const left = missingIn(s, completion).length;
              const done = left === 0;
              const active = index === stepIndex;
              const Icon = s.icon;
              return (
                <li key={s.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => goTo(index)}
                    aria-current={active ? "step" : undefined}
                    className={`group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${active ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                  >
                    <span className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] transition-colors ${done && !s.optional ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : active ? "border-primary/30 bg-background text-primary" : "bg-background"}`}>
                      {done && !s.optional ? <Check className="size-3.5" aria-hidden="true" /> : <Icon className="size-3.5" aria-hidden="true" />}
                    </span>
                    <span className="whitespace-nowrap lg:whitespace-normal">
                      <span className="lg:hidden">{s.short}</span>
                      <span className="hidden lg:inline">{s.title}</span>
                    </span>
                    {s.optional ? (
                      <span className="ml-auto hidden text-[10px] text-muted-foreground lg:inline">Optional</span>
                    ) : left > 0 ? (
                      <span className="ml-auto rounded-full bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-700 tabular-nums dark:text-amber-300" aria-label={`${left} required left`}>{left}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Step content */}
        <section aria-labelledby={`step-${step.id}`} className="min-w-0">
          <header className="mb-6 flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <step.icon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 id={`step-${step.id}`} className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight">
                {step.title}
                {step.optional && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Optional</span>}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
            </div>
          </header>

          {step.id === "background" && <div className="mb-8 space-y-10">{background}</div>}

          {step.id === "background" && (
            <h4 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Used to answer application questions</h4>
          )}
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            {step.fields.map(key => (
              <FieldControl
                key={key}
                fieldKey={key}
                value={fields[key] ?? ""}
                fromResume={!!prefilled[key] && prefilled[key] === fields[key]}
                error={showErrors && completion.missing.includes(key) ? errorFor(key, fields[key]) : ""}
                onChange={value => onFieldChange(key, value)}
              />
            ))}
          </div>

          {/* Step actions */}
          <div className="sticky bottom-0 z-20 -mx-4 mt-8 flex items-center justify-between gap-3 border-t bg-background/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-b-xl sm:px-0">
            <Button variant="ghost" className="h-9 gap-1.5" disabled={stepIndex === 0 || saving} onClick={() => goTo(stepIndex - 1)}>
              <ArrowLeft aria-hidden="true" />Back
            </Button>
            <div className="flex min-w-0 items-center gap-3">
              <p aria-live="polite" className="min-w-0 truncate text-xs">
                {saveError ? (
                  <span role="alert" className="inline-flex items-center gap-1 text-destructive"><CircleAlert className="size-3.5" aria-hidden="true" />{saveError}</span>
                ) : showErrors && stepMissing.length > 0 ? (
                  <span className="text-amber-700 dark:text-amber-300">{stepMissing.length} <span className="hidden sm:inline">{stepMissing.length === 1 ? "answer needs" : "answers need"} attention</span><span className="sm:hidden">left</span></span>
                ) : null}
              </p>
              <Button className="h-9 gap-1.5 px-4" disabled={saving} onClick={() => void next()}>
                {saving ? <><LoaderCircle className="animate-spin" aria-hidden="true" />Saving…</> : (
                  <>{stepIndex === onboardingSteps.length - 1 ? (step.optional && stepMissing.length === 0 ? "Save & finish" : "Finish") : "Save & continue"}<ArrowRight aria-hidden="true" /></>
                )}
              </Button>
            </div>
          </div>
                  </section>
      </div>

      <datalist id="onboarding-countries">{COUNTRIES.map(c => <option key={c} value={c} />)}</datalist>
      <datalist id="onboarding-states">{US_STATES.map(s => <option key={s} value={s} />)}</datalist>
    </div>
  );
}

function FieldControl({ fieldKey, value, fromResume, error, onChange }: {
  fieldKey: string; value: string; fromResume: boolean; error: string; onChange: (value: string) => void;
}) {
  const field = fieldByKey.get(fieldKey);
  if (!field) return null;
  const ui = fieldUi[fieldKey] ?? {};
  const id = `field-${fieldKey}`;
  const describedBy = [error && `${id}-error`, field.hint && `${id}-hint`].filter(Boolean).join(" ") || undefined;
  const isRequired = required.has(fieldKey);
  const options = field.options ?? ui.choices;
  const wide = ui.wide || (ui.choices && ui.choices.length > 4);

  const label = (
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={options ? undefined : id} id={`${id}-label`} className="text-[13px] font-medium text-foreground">
        {field.label}
        {isRequired ? <span className="ml-0.5 text-destructive" aria-hidden="true">*</span> : null}
      </label>
      {fromResume ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary" title="Filled in from your résumé">
          <Sparkles className="size-3" aria-hidden="true" />From résumé
        </span>
      ) : !isRequired ? (
        <span className="text-[11px] text-muted-foreground">Optional</span>
      ) : null}
    </div>
  );

  let control: React.ReactNode;
  if (options) {
    const vertical = options.length > 4 || options.some(o => o.length > 14);
    control = (
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        aria-describedby={describedBy}
        aria-invalid={!!error || undefined}
        className={vertical ? "grid gap-2 sm:grid-cols-2" : "flex flex-wrap gap-2"}
      >
        {options.map((option, idx) => {
          const selected = value === option;
          return (
            <button
              key={option}
              id={idx === 0 ? id : undefined}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(selected && !isRequired ? "" : option)}
              className={`flex min-h-9 items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-[13px] transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${vertical ? "" : "min-w-20 justify-center"} ${selected ? "border-primary bg-primary/10 font-medium text-foreground shadow-xs" : "bg-card text-foreground/80 hover:border-foreground/20 hover:bg-muted"} ${error && !selected ? "border-destructive/50" : ""}`}
            >
              {vertical && (
                <span className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${selected ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>
                  {selected && <Check className="size-2.5" strokeWidth={3} aria-hidden="true" />}
                </span>
              )}
              {option}
            </button>
          );
        })}
      </div>
    );
  } else {
    control = (
      <>
        <Input
          id={id}
          type={field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "tel" ? "tel" : field.type === "url" ? "url" : "text"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={ui.placeholder}
          autoComplete={ui.autoComplete}
          inputMode={ui.inputMode}
          list={ui.datalist ? `onboarding-${ui.datalist}` : undefined}
          aria-invalid={!!error || undefined}
          aria-describedby={describedBy}
          aria-required={isRequired || undefined}
          className="h-10 rounded-lg bg-card px-3"
        />
        {ui.suggestions && (
          <div className="flex flex-wrap gap-1.5">
            {ui.suggestions.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => onChange(s)}
                aria-pressed={value === s}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${value === s ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <div className={`space-y-2 ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      {control}
      {field.hint && !error && <p id={`${id}-hint`} className="text-[11px] leading-relaxed text-muted-foreground">{field.hint}</p>}
      {error && (
        <p id={`${id}-error`} className="flex items-center gap-1 text-[11px] font-medium text-destructive">
          <CircleAlert className="size-3" aria-hidden="true" />{error}
        </p>
      )}
    </div>
  );
}
