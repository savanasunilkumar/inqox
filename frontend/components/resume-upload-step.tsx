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
      </> : <div className="flex min-h-[60svh] flex-1 flex-col items-center justify-center gap-3 p-6">
        <Button className="h-10 gap-2 px-5" disabled={!!busy} onClick={() => input.current?.click()}>{busy ? <LoaderCircle className="animate-spin" /> : <Upload />} {dragging ? "Drop résumé here" : "Upload résumé"}</Button>
        <span className="text-xs text-muted-foreground">PDF · Up to 5 MB</span>
      </div>}
      {error && <p role="alert" className="px-5 py-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}
