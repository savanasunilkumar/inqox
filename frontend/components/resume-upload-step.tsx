"use client";

import { useRef, useState } from "react";
import { Download, LoaderCircle, Trash2, Upload } from "lucide-react";
import { ResumeDocument } from "@/components/resume-document";
import { Button } from "@/components/ui/button";
import { OnboardingShell } from "@/components/onboarding-rail";
import { requiredProfileFields } from "@/lib/profile-completion";
import { onboardingSteps } from "@/lib/onboarding-steps";

const required = new Set<string>(requiredProfileFields);

type ResumeFile = { name: string; size: number };
type Props = {
  resume: ResumeFile | null;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
  onDownload: () => Promise<void>;
  loadResume: () => Promise<Blob>;
  localPreview?: boolean;
};

export function ResumeUploadStep({ resume, onUpload, onRemove, onDownload, loadResume }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const working = useRef(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  async function perform(action: string, task: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(action);
    setError("");
    try { await task(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Something went wrong. Please try again."); }
    finally { working.current = false; setBusy(""); }
  }

  async function upload(files: File[]) {
    setDragging(false);
    if (working.current) return;
    if (files.length !== 1) { setError("Choose one résumé at a time."); return; }
    const file = files[0];
    await perform("upload", async () => {
      if (!file.name.toLowerCase().endsWith(".pdf")) throw new Error("Please choose a PDF résumé.");
      if (!file.size || file.size > 5 * 1024 * 1024) throw new Error("Choose a PDF between 1 byte and 5 MB.");
      const signature = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
      if (signature !== "%PDF-") throw new Error("This file isn’t a valid PDF. Please choose another résumé.");
      await onUpload(file);
    });
  }

  return (
    <section aria-label="Résumé" aria-busy={!!busy} className="flex min-h-full w-full flex-col"
      onDragEnter={event => { event.preventDefault(); if (!busy) setDragging(true); }}
      onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = busy ? "none" : "copy"; }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={event => { event.preventDefault(); void upload(Array.from(event.dataTransfer.files)); }}>
      <input ref={input} type="file" accept="application/pdf,.pdf" aria-label="Upload résumé" className="sr-only" tabIndex={-1} disabled={!!busy}
        onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length) void upload(files); }} />
      {resume ? <>
        <div className="flex h-12 shrink-0 items-center justify-end gap-1 px-3">
          <Button variant="ghost" size="icon" title="Replace résumé" aria-label="Replace résumé" disabled={!!busy} onClick={() => input.current?.click()}>{busy === "upload" ? <LoaderCircle className="animate-spin" /> : <Upload />}</Button>
          <Button variant="ghost" size="icon" title="Download résumé" aria-label="Download résumé" disabled={!!busy} onClick={() => void perform("download", onDownload)}><Download /></Button>
          <Button variant="ghost" size="icon" title="Remove résumé" aria-label="Remove résumé" disabled={!!busy} onClick={() => void perform("remove", onRemove)}>{busy === "remove" ? <LoaderCircle className="animate-spin" /> : <Trash2 />}</Button>
        </div>
        <ResumeDocument key={resume.name + resume.size} resume={resume} loadResume={loadResume} />
      </> : <OnboardingShell
        items={[
          { id: "resume", label: "Résumé", done: false, fraction: 0 },
          ...onboardingSteps.map(step => ({
            id: step.id,
            label: step.short,
            done: false,
            fraction: 0,
            left: step.fields.filter(f => required.has(f)).length,
            locked: true,
          })),
        ]}
        activeId="resume"
        completed={0}
        total={requiredProfileFields.length + 1}
      >
        <header className="mb-8">
          <p className="text-xs text-muted-foreground tabular-nums">Step 1 of {onboardingSteps.length + 1}</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Import your résumé</h2>
          <p className="mt-1 text-sm text-muted-foreground">We read it once and prefill every step after this.</p>
        </header>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => input.current?.click()}
          aria-describedby="resume-upload-help"
          className={`group flex min-h-64 w-full flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-wait ${dragging ? "border-foreground/50 bg-accent" : "border-border hover:border-foreground/30 hover:bg-accent/40"}`}
        >
          {busy ? (
            <span className="flex items-center gap-2 text-sm font-medium"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Reading your résumé…</span>
          ) : (
            <>
              <span className="text-[15px] font-medium">{dragging ? "Release to import" : "Drop your résumé here"}</span>
              <span id="resume-upload-help" className="mt-1.5 text-sm text-muted-foreground">
                or <span className="text-foreground underline decoration-border underline-offset-4 group-hover:decoration-foreground">browse files</span> · PDF up to 5 MB
              </span>
            </>
          )}
        </button>
        <dl className="mt-8 grid gap-x-12 gap-y-3 text-[13px] sm:grid-cols-3">
          {[
            ["Background", "Experience, education, current role"],
            ["Contact", "Name, email, phone, LinkedIn, GitHub"],
            ["You answer", "Work authorization, availability, pay"],
          ].map(([term, detail]) => (
            <div key={term}>
              <dt className="font-medium">{term}</dt>
              <dd className="mt-0.5 text-muted-foreground">{detail}</dd>
            </div>
          ))}
        </dl>
        {error && <p role="alert" className="mt-6 text-sm text-destructive">{error}</p>}
      </OnboardingShell>}
      {error && resume && <p role="alert" className="px-6 pb-6 text-sm text-destructive">{error}</p>}
    </section>
  );
}
