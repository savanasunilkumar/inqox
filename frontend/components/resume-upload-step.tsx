"use client";

import { useRef, useState } from "react";
import { Download, FileUp, LoaderCircle, LockKeyhole, Trash2, Upload } from "lucide-react";
import { ResumeDocument } from "@/components/resume-document";
import { Button } from "@/components/ui/button";

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
    <section aria-label="Résumé" aria-busy={!!busy} className={`flex min-h-full w-full flex-col ${dragging ? "bg-primary/5" : ""}`}
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
      </> : <div className="flex min-h-[70svh] flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-xl text-center">
          <p className="text-xs font-medium tracking-wider text-primary uppercase">Getting started</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">Let’s set up your application profile</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-pretty text-muted-foreground">
            Upload your résumé and we’ll fill in everything we can: experience, education, email, phone, LinkedIn and GitHub. You’ll only answer what’s left.
          </p>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => input.current?.click()}
            aria-describedby="resume-upload-help"
            className={`group mt-8 flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-progress ${dragging ? "scale-[1.01] border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40 hover:bg-primary/[0.03]"}`}
          >
            <span className={`flex size-12 items-center justify-center rounded-xl transition-colors ${dragging || busy ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground"}`}>
              {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <FileUp className="size-5" aria-hidden="true" />}
            </span>
            <span className="text-sm font-medium text-foreground">
              {busy ? "Reading your résumé…" : dragging ? "Drop to upload" : <>Drag your résumé here, or <span className="text-primary underline-offset-4 group-hover:underline">browse</span></>}
            </span>
            <span id="resume-upload-help" className="text-xs text-muted-foreground">PDF with selectable text · up to 5 MB</span>
          </button>
          <ol className="mt-8 grid gap-3 text-left sm:grid-cols-3">
            {[
              ["Upload", "We read your PDF and pull out your details."],
              ["Fill the gaps", "Answer the standard US application questions."],
              ["Unlock", "Job Board, Tracker and Inbox open up."],
            ].map(([title, body], index) => (
              <li key={title} className="flex gap-3 rounded-xl border bg-card/60 p-3 sm:flex-col sm:gap-2">
                <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${index === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{index + 1}</span>
                <span>
                  <span className="block text-[13px] font-medium">{title}</span>
                  <span className="block text-xs leading-relaxed text-muted-foreground">{body}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-6 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <LockKeyhole className="size-3" aria-hidden="true" />Your résumé is stored privately and only used to fill in applications.
          </p>
        </div>
      </div>}
      {error && <p role="alert" className="mx-auto -mt-6 max-w-xl px-5 pb-6 text-center text-sm text-destructive">{error}</p>}
    </section>
  );
}
