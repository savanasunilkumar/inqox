"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { profileFields } from "@/lib/profile-model";
import { profileCompletion, requiredProfileFields } from "@/lib/profile-completion";
import { COUNTRIES, NOTICE_PERIODS, US_STATES, VISA_TYPES, fieldUi, onboardingSteps, type OnboardingStep } from "@/lib/onboarding-steps";

type Completion = ReturnType<typeof profileCompletion>;
type Props = {
  fields: Record<string, string>;
  onFieldChange: (field: string, value: string) => void;
  prefilled: Record<string, string>;
  completion: Completion;
  background: React.ReactNode;
  onSave: () => Promise<void>;
  finishHref?: string;
};

const required = new Set<string>(requiredProfileFields);
const fieldByKey = new Map(profileFields.map(f => [f.key, f]));
const datalists = { countries: COUNTRIES, states: US_STATES, visas: VISA_TYPES, notice: NOTICE_PERIODS };

function errorFor(key: string, value: string | undefined): string {
  if (!value?.trim()) return "Required";
  if (key === "email") return "Enter a valid email address";
  if (key === "yearsExperience") return "Enter a number, like 3";
  if (key === "availableDate") return "Pick a date";
  return "Choose one of the options";
}

function missingIn(step: OnboardingStep, completion: Completion) {
  return step.fields.filter(k => completion.missing.includes(k));
}

function StepStatus({ done, fraction, active }: { done: boolean; fraction: number; active: boolean }) {
  if (done) {
    return (
      <svg viewBox="0 0 14 14" className="size-3.5 shrink-0 text-primary" aria-hidden="true">
        <circle cx="7" cy="7" r="7" fill="currentColor" />
        <path d="M4.2 7.2 6 9l3.8-3.8" fill="none" stroke="var(--background)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  const r = 3.5;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 14 14" className={`size-3.5 shrink-0 ${active ? "text-foreground" : "text-muted-foreground"}`} aria-hidden="true">
      <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={fraction > 0 ? 1 : 0.6} strokeDasharray={fraction > 0 ? undefined : "2 1.6"} />
      {fraction > 0 && (
        <circle cx="7" cy="7" r={r} fill="none" stroke="currentColor" strokeWidth={r * 2} strokeDasharray={`${c * fraction} ${c}`} transform="rotate(-90 7 7)" />
      )}
    </svg>
  );
}

export function ProfileOnboarding({ fields, onFieldChange, prefilled, completion, background, onSave, finishHref = "/job-board" }: Props) {
  const [stepIndex, setStepIndex] = useState(() => {
    const first = onboardingSteps.findIndex(s => missingIn(s, completion).length > 0);
    return first === -1 ? 0 : first;
  });
  const [attempted, setAttempted] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [finished, setFinished] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const nextRef = useRef<() => Promise<void>>(async () => {});

  const step = onboardingSteps[stepIndex];
  const stepMissing = missingIn(step, completion);
  const isLast = stepIndex === onboardingSteps.length - 1;

  useEffect(() => {
    top.current?.scrollIntoView({ block: "start" });
  }, [stepIndex, finished]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void nextRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function goTo(index: number) {
    setSaveError("");
    setStepIndex(index);
  }

  async function next() {
    if (saving) return;
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
      setSaveError(err instanceof Error ? err.message : "Couldn’t save your answers. Try again.");
      setSaving(false);
      return;
    }
    setSaving(false);
    if (!isLast) {
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
  useEffect(() => { nextRef.current = next; });

  if (finished && completion.complete) {
    return (
      <div ref={top} className="mx-auto w-full max-w-2xl scroll-mt-4 px-4 py-16 sm:px-6">
        <StepStatus done fraction={1} active />
        <h2 className="mt-4 text-lg font-semibold tracking-tight">Profile complete</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Dashboard, Job Board, Inbox and Tracker are now unlocked. You can change any answer here later.
        </p>
        <div className="mt-6 flex gap-2">
          <Button asChild><Link href={finishHref}>Go to Job Board</Link></Button>
          <Button variant="ghost" onClick={() => { setFinished(false); goTo(0); }}>Review answers</Button>
        </div>
      </div>
    );
  }

  const showErrors = attempted.has(step.id);

  return (
    <div ref={top} className="mx-auto w-full max-w-3xl scroll-mt-4 px-4 pt-8 pb-4 sm:px-6 lg:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{completion.complete ? "Your profile" : "Set up your profile"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {completion.complete
              ? "Everything a typical US application asks for is filled in."
              : "Answer the remaining questions to unlock Job Board, Inbox and Tracker."}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
          <span><span className="text-foreground">{completion.completed}</span> / {completion.total}</span>
          <Progress value={(completion.completed / completion.total) * 100} aria-label="Required answers completed" className="w-24" />
        </div>
      </header>

      <nav aria-label="Profile steps" className="mt-6 -mx-4 overflow-x-auto border-b px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <ol className="flex gap-5">
          {onboardingSteps.map((s, index) => {
            const left = missingIn(s, completion).length;
            const requiredCount = s.fields.filter(f => required.has(f)).length;
            const active = index === stepIndex;
            const done = s.optional ? s.fields.some(f => fields[f]) : left === 0;
            return (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => goTo(index)}
                  aria-current={active ? "step" : undefined}
                  className={`-mb-px flex h-9 items-center gap-2 border-b-2 text-[13px] transition-colors outline-none focus-visible:text-foreground ${active ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  <StepStatus done={done} active={active} fraction={requiredCount ? (requiredCount - left) / requiredCount : 0} />
                  {s.short}
                  {!s.optional && left > 0 && <span className="text-xs text-muted-foreground tabular-nums" aria-label={`${left} required left`}>{left}</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <section aria-labelledby={`step-${step.id}`} className="mt-8">
        <div className="mb-6">
          <h3 id={`step-${step.id}`} className="text-[15px] font-medium">
            {step.title}
            {step.optional && <span className="ml-2 text-xs font-normal text-muted-foreground">Optional</span>}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{step.description}</p>
        </div>

        {step.id === "background" && <div className="mb-10 space-y-10">{background}</div>}

        <div className="space-y-8">
          {step.groups.map(group => (
            <div key={group.title}>
              <h4 className="mb-2 text-xs font-medium text-muted-foreground">{group.title}</h4>
              <div className="divide-y rounded-lg border bg-card">
                {group.fields.map(key => (
                  <FieldRow
                    key={key}
                    fieldKey={key}
                    value={fields[key] ?? ""}
                    fromResume={!!prefilled[key] && prefilled[key] === fields[key]}
                    error={showErrors && completion.missing.includes(key) ? errorFor(key, fields[key]) : ""}
                    onChange={value => onFieldChange(key, value)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 z-20 -mx-4 mt-8 flex items-center justify-between gap-3 border-t bg-background px-4 py-3 sm:mx-0 sm:px-0">
          <Button variant="ghost" disabled={stepIndex === 0 || saving} onClick={() => goTo(stepIndex - 1)}>Back</Button>
          <div className="flex min-w-0 items-center gap-3">
            <p aria-live="polite" className="min-w-0 truncate text-xs">
              {saveError ? (
                <span role="alert" className="text-destructive">{saveError}</span>
              ) : showErrors && stepMissing.length > 0 ? (
                <span className="text-muted-foreground">{stepMissing.length} required {stepMissing.length === 1 ? "answer" : "answers"} left</span>
              ) : null}
            </p>
            <Button disabled={saving} onClick={() => void next()} className="gap-2">
              {saving ? "Saving…" : isLast ? "Finish" : "Continue"}
              <KbdGroup className="hidden sm:inline-flex">
                <Kbd className="bg-primary-foreground/15 text-primary-foreground">⌘</Kbd>
                <Kbd className="bg-primary-foreground/15 text-primary-foreground">↵</Kbd>
              </KbdGroup>
            </Button>
          </div>
        </div>
      </section>

      {Object.entries(datalists).map(([id, values]) => (
        <datalist key={id} id={`onboarding-${id}`}>{values.map(v => <option key={v} value={v} />)}</datalist>
      ))}
    </div>
  );
}

function FieldRow({ fieldKey, value, fromResume, error, onChange }: {
  fieldKey: string; value: string; fromResume: boolean; error: string; onChange: (value: string) => void;
}) {
  const field = fieldByKey.get(fieldKey);
  if (!field) return null;
  const ui = fieldUi[fieldKey] ?? {};
  const id = `field-${fieldKey}`;
  const isRequired = required.has(fieldKey);
  const options = field.options ?? ui.options;
  const describedBy = [error && `${id}-error`, field.hint && `${id}-hint`].filter(Boolean).join(" ") || undefined;
  const segmented = options && options.length <= 4 && options.every(o => o.length <= 9);

  let control: React.ReactNode;
  if (options && segmented) {
    control = (
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        value={value}
        onValueChange={v => { if (v || !isRequired) onChange(v); }}
        aria-labelledby={`${id}-label`}
        aria-describedby={describedBy}
        aria-invalid={!!error || undefined}
        className={`w-full sm:w-auto ${error ? "rounded-lg ring-1 ring-destructive/60" : ""}`}
      >
        {options.map((option, index) => (
          <ToggleGroupItem
            key={option}
            id={index === 0 ? id : undefined}
            value={option}
            className="flex-1 px-3 data-[state=on]:bg-foreground data-[state=on]:text-background sm:flex-none"
          >
            {option}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    );
  } else if (options) {
    const items = value && !options.includes(value) ? [value, ...options] : options;
    control = (
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger id={id} aria-labelledby={`${id}-label`} aria-describedby={describedBy} aria-invalid={!!error || undefined} className="w-full">
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent position="popper" align="end">
          {items.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  } else {
    control = (
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
      />
    );
  }

  return (
    <div className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_18rem] sm:items-center sm:gap-6">
      <div className="min-w-0">
        <label id={`${id}-label`} htmlFor={segmented ? undefined : id} className="text-[13px] font-medium">
          {field.label.replace(/ answer$/, "")}
        </label>
        {(fromResume || !isRequired) && (
          <span className="ml-2 text-xs text-muted-foreground">{fromResume ? "From résumé" : "Optional"}</span>
        )}
        {error ? (
          <p id={`${id}-error`} className="mt-0.5 text-xs text-destructive">{error}</p>
        ) : field.hint ? (
          <p id={`${id}-hint`} className="mt-0.5 text-xs text-muted-foreground">{field.hint}</p>
        ) : null}
      </div>
      {control}
    </div>
  );
}
