"use client";

import { useRef, useState } from "react";
import { Download, LoaderCircle, Trash2, Upload } from "lucide-react";
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
      </> : <div className="relative flex min-h-[70svh] flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        {dragging && <div aria-hidden="true" className="pointer-events-none absolute inset-3 rounded-xl border border-dashed border-foreground/25 bg-muted/40" />}
        <div className="relative w-full max-w-sm">
          <h2 className="text-2xl font-semibold tracking-tight">Upload your résumé</h2>
          <p className="mt-2 text-sm text-muted-foreground">We’ll fill in your profile from it.</p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <Button size="lg" disabled={!!busy} onClick={() => input.current?.click()} className="min-w-40">
              {busy ? <><LoaderCircle className="animate-spin" aria-hidden="true" />Reading…</> : "Choose PDF"}
            </Button>
            <p className="text-xs text-muted-foreground">{dragging ? "Release to upload" : "or drop it anywhere · up to 5 MB"}</p>
          </div>
        </div>
      </div>}
      {error && <p role="alert" className="mx-auto -mt-12 w-full max-w-sm px-6 pb-8 text-center text-sm text-destructive">{error}</p>}
    </section>
  );
}
