"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";

export function ResumeDocument({ resume, loadResume }: { resume: { name: string; size: number }; loadResume: () => Promise<Blob> }) {
  const pages = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const container = pages.current;
    if (!container) return;
    let cancelled = false;
    let documentTask: PDFDocumentLoadingTask | undefined;
    const renders: RenderTask[] = [];
    container.replaceChildren();

    async function renderDocument() {
      try {
        const [pdfjs, file] = await Promise.all([import("pdfjs-dist"), loadResume()]);
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const data = new Uint8Array(await file.arrayBuffer());
        if (cancelled) return;
        documentTask = pdfjs.getDocument({ data });
        const document = await documentTask.promise;
        if (document.numPages > 20) throw new Error("Please choose a résumé with 20 pages or fewer.");
        for (let number = 1; number <= document.numPages; number++) {
          if (cancelled) return;
          const page = await document.getPage(number);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: 2 });
          const canvas = window.document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.className = "block bg-white";
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `Résumé page ${number}`);
          const render = page.render({ canvas, viewport });
          renders.push(render);
          await render.promise;
          const text = await page.getTextContent();
          if (cancelled) return;
          const accessibleText = window.document.createElement("p");
          accessibleText.className = "sr-only";
          accessibleText.textContent = text.items.map(item => "str" in item ? item.str : "").join(" ");
          const sheet = window.document.createElement("div");
          sheet.appendChild(canvas);
          sheet.appendChild(accessibleText);
          container!.appendChild(sheet);
          setLoading(false);
        }
      } catch (failure) {
        if (!cancelled) {
          setError(failure instanceof Error && failure.message.includes("20 pages") ? failure.message : "Couldn’t open this PDF. Try another résumé.");
          setLoading(false);
        }
      }
    }
    void renderDocument();
    return () => {
      cancelled = true;
      renders.forEach(render => render.cancel());
      if (documentTask) void documentTask.destroy().catch(() => {});
      container.replaceChildren();
    };
  }, [resume, loadResume, attempt]);

  return <div className="w-full px-3 pb-5 sm:px-5">
    {loading && <div role="status" aria-label="Opening résumé" className="flex justify-center p-12"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>}
    {error && <div className="flex flex-col items-center gap-3 p-8"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={() => { setError(""); setLoading(true); setAttempt(value => value + 1); }}>Try again</Button></div>}
    <div ref={pages} role="document" aria-label="Résumé preview" className="mx-auto w-full max-w-[960px] space-y-4" />
  </div>;
}
