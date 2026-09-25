"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox, DatePicker } from "@/components/field-pickers";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { OnboardingShell, StepStatus, type RailItem } from "@/components/onboarding-rail";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { profileFields } from "@/lib/profile-model";
import { profileCompletion, requiredProfileFields } from "@/lib/profile-completion";
import { COUNTRIES, NOTICE_PERIODS, US_STATES, VISA_TYPES, fieldUi, onboardingSteps, type OnboardingGroup, type OnboardingStep } from "@/lib/onboarding-steps";

type Completion = ReturnType<typeof profileCompletion>;
type Props = {
  fields: Record<string, string>;
  onFieldChange: (field: string, value: string) => void;
  prefilled: Record<string, string>;
  completion: Completion;
  background: React.ReactNode;
  onSave: () => Promise<void>;
  finishHref?: string;
  notice?: React.ReactNode;
};

const required = new Set<string>(requiredProfileFields);
const fieldByKey = new Map(profileFields.map(f => [f.key, f]));
const pickerOptions = { countries: COUNTRIES, states: US_STATES, visas: VISA_TYPES, notice: NOTICE_PERIODS };

function errorFor(key: string, value: string | undefined): string {
  if (!value?.trim()) return " ";
  if (key === "email") return "Enter a valid email address";
  if (key === "yearsExperience") return "Enter a number, like 3";
  if (key === "availableDate") return "Pick a date";
  return "Choose one of the options";
}

function missingIn(step: OnboardingStep, completion: Completion) {
  return step.fields.filter(k => completion.missing.includes(k));
}

export function ProfileOnboarding({ fields, onFieldChange, prefilled, completion, background, onSave, finishHref = "/job-board", notice }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [attempted, setAttempted] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [finished, setFinished] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const nextRef = useRef<() => Promise<void>>(async () => {});

  const step = onboardingSteps[stepIndex];
  const stepMissing = missingIn(step, completion);
  const isLast = stepIndex === onboardingSteps.length - 1;

  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
    top.current?.scrollTo({ top: 0 });
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
      <div ref={top} className="h-full overflow-y-auto"><div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
        <StepStatus done fraction={1} active />
        <h2 className="mt-4 text-lg font-semibold tracking-tight">Profile complete</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Dashboard, Job Board, Inbox and Tracker are now unlocked. You can change any answer here later.
        </p>
        <div className="mt-6 flex gap-2">
          <Button asChild><Link href={finishHref}>Go to Job Board</Link></Button>
          <Button variant="ghost" onClick={() => { setFinished(false); goTo(0); }}>Review answers</Button>
        </div>
      </div></div>
    );
  }

  const showErrors = attempted.has(step.id);
  const rail: RailItem[] = [
    { id: "resume", label: "Résumé", done: true, fraction: 1 },
    ...onboardingSteps.map(s => {
      const left = missingIn(s, completion).length;
      const requiredCount = s.fields.filter(f => required.has(f)).length;
      return {
        id: s.id,
        label: s.short,
        done: s.optional ? s.fields.some(f => fields[f]) : left === 0,
        fraction: requiredCount ? (requiredCount - left) / requiredCount : 0,
        left: s.optional ? 0 : left,
      };
    }),
  ];

  return (
    <section aria-labelledby={`step-${step.id}`} className="h-full min-h-0">
      <OnboardingShell
        items={rail}
        activeId={step.id}
        onSelect={id => { const index = onboardingSteps.findIndex(s => s.id === id); if (index >= 0) goTo(index); }}
        completed={completion.completed}
        total={completion.total}
        scrollRef={body}
        header={
          <header>
            <p className="text-xs text-muted-foreground tabular-nums">Step {stepIndex + 2} of {onboardingSteps.length + 1}</p>
            <h2 id={`step-${step.id}`} className="mt-1 text-xl font-semibold tracking-tight">{step.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
          </header>
        }
        footer={<>
          <Button variant="ghost" disabled={stepIndex === 0 || saving} onClick={() => goTo(stepIndex - 1)}>Back</Button>
            <div className="flex min-w-0 items-center gap-3">
              <p aria-live="polite" className="min-w-0 truncate text-xs">
                {saveError ? (
                  <span role="alert" className="text-destructive">{saveError}</span>
                ) : showErrors && stepMissing.length > 0 ? (
                  <span className="text-muted-foreground">{stepMissing.length} {stepMissing.length === 1 ? "answer" : "answers"} left</span>
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
        </>}
      >
        {notice && <div className="mb-8">{notice}</div>}
        {step.id === "background" && <div className="mb-12 space-y-12">{background}</div>}

          <div>
            {step.groups.map(group => (
              <GroupSection
                key={group.title}
                group={group}
                render={(key, layout) => (
                  <FieldRow
                    key={key}
                    fieldKey={key}
                    layout={layout}
                    value={fields[key] ?? ""}
                    fromResume={!!prefilled[key] && prefilled[key] === fields[key]}
                    error={showErrors && completion.missing.includes(key) ? errorFor(key, fields[key]) : ""}
                    onChange={value => onFieldChange(key, value)}
                  />
                )}
              />
            ))}
          </div>
      </OnboardingShell>
    </section>
  );
}

const ROW_COLUMNS: Record<number, string> = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" };

function GroupSection({ group, render }: { group: OnboardingGroup; render: (key: string, layout: "stacked" | "question") => React.ReactNode }) {
  return (
    <section className="pb-12">
      <h3 className="mb-6 -mr-5 flex items-center gap-4 sm:-mr-8 lg:-mr-12 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {group.title}
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </h3>
      {group.layout === "questions" ? (
        <div className="-my-3.5 divide-y">
          {group.rows.flat().map(key => render(key, "question"))}
        </div>
      ) : (
        <div className="grid gap-5">
          {group.rows.map(row => (
            <div key={row.join()} className={`grid gap-x-4 gap-y-5 ${ROW_COLUMNS[row.length] ?? "sm:grid-cols-3"}`}>
              {row.map(key => render(key, "stacked"))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function FieldRow({ fieldKey, layout, value, fromResume, error, onChange }: {
  fieldKey: string; layout: "stacked" | "question"; value: string; fromResume: boolean; error: string; onChange: (value: string) => void;
}) {
  const field = fieldByKey.get(fieldKey);
  if (!field) return null;
  const ui = fieldUi[fieldKey] ?? {};
  const id = `field-${fieldKey}`;
  const isRequired = required.has(fieldKey);
  const options = field.options ?? ui.options;
  const describedBy = (error.trim() ? `${id}-error` : field.hint ? `${id}-hint` : undefined);
  const segmented = options && options.length <= 4 && options.every(o => o.length <= 9);

  let control: React.ReactNode;
  if (options && segmented) {
    control = (
      <ToggleGroup
        type="single"
        variant="outline"
        spacing={0}
        value={value}
        onValueChange={v => { if (v || !isRequired) onChange(v); }}
        aria-labelledby={`${id}-label`}
        aria-describedby={describedBy}
        aria-invalid={!!error || undefined}
        className={`w-full ${error ? "rounded-lg ring-1 ring-destructive/60" : ""}`}
      >
        {options.map((option, index) => (
          <ToggleGroupItem
            key={option}
            id={index === 0 ? id : undefined}
            value={option}
            className="h-8 flex-1 px-3 data-[state=on]:bg-foreground data-[state=on]:text-background"
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
  } else if (field.type === "date" || fieldKey === "graduationDate") {
    control = (
      <DatePicker id={id} value={value} onChange={onChange} granularity={field.type === "date" ? "day" : "month"} invalid={!!error} describedBy={describedBy} labelledBy={`${id}-label`} />
    );
  } else if (ui.datalist) {
    control = (
      <Combobox id={id} value={value} onChange={onChange} options={pickerOptions[ui.datalist]} placeholder={ui.placeholder} allowCustom invalid={!!error} describedBy={describedBy} labelledBy={`${id}-label`} />
    );
  } else {
    control = (
      <Input
        id={id}
        type={field.type === "email" ? "email" : field.type === "tel" ? "tel" : field.type === "url" ? "url" : "text"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={ui.placeholder}
        autoComplete={ui.autoComplete}
        inputMode={ui.inputMode}
        aria-invalid={!!error || undefined}
        aria-describedby={describedBy}
        aria-required={isRequired || undefined}
      />
    );
  }

  const message = error.trim() || field.hint?.replace(/^Optional\.\s*/, "");
  const label = (
    <div className="flex items-baseline justify-between gap-2">
      <label id={`${id}-label`} htmlFor={segmented ? undefined : id} className="text-[13px] font-medium">
        {field.label.replace(/ answer$/, "")}
        {isRequired && <span aria-hidden="true" className="ml-0.5 text-destructive">*</span>}
      </label>
      {fromResume && <span className="shrink-0 text-[11px] text-muted-foreground">From résumé</span>}
    </div>
  );
  const note = message && (
    <p id={error.trim() ? `${id}-error` : `${id}-hint`} className={`text-xs ${error.trim() ? "text-destructive" : "text-muted-foreground"}`}>{message}</p>
  );

  if (layout === "question") {
    return (
      <div className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div className="grid min-w-0 gap-0.5">{label}{note}</div>
        <div className="w-full shrink-0 sm:w-72">{control}</div>
      </div>
    );
  }
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      {label}
      {control}
      {note}
    </div>
  );
}
