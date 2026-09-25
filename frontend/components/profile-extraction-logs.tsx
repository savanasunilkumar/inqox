"use client";

import { useState } from "react";
import { Check, Copy, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ExtractionLogEntry } from "@/lib/resume-extractor";

type Props = {
  logs: ExtractionLogEntry[];
  institutions: string[];
  companies: string[];
};

export function ProfileExtractionLogs({ logs, institutions, companies }: Props) {
  const [copied, setCopied] = useState(false);

  function copyToClipboard() {
    const fullLogText = [
      "=== RÉSUMÉ EXTRACTION LOGS ===",
      `[Institutions Detected]: ${institutions.join(", ") || "None"}`,
      `[Companies Detected]: ${companies.join(", ") || "None"}`,
      "",
      "--- Detailed Extraction Trace ---",
      ...logs.map(l => `[${l.category.toUpperCase()}] ${l.message}${l.sourceLine ? ` (Line: "${l.sourceLine}")` : ""}`),
    ].join("\n");

    void navigator.clipboard.writeText(fullLogText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg bg-muted/60 p-4 font-mono text-xs">
      <div className="flex items-center justify-between border-b pb-2.5">
        <div className="flex items-center gap-2 text-foreground font-medium">
          <Terminal className="size-3.5" />
          <span>Extraction Logs & Detection Trace</span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px] font-normal"
          onClick={copyToClipboard}
        >
          {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
          <span>{copied ? "Copied" : "Copy logs"}</span>
        </Button>
      </div>

      {/* Summary of Detected Entities */}
      <div className="grid gap-3 pt-3 sm:grid-cols-2">
        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase">
            Detected Educational Institutions ({institutions.length})
          </span>
          {institutions.length > 0 ? (
            <ul className="space-y-0.5 text-foreground">
              {institutions.map((inst, i) => (
                <li key={i} className="truncate">• {inst}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground italic">None detected</p>
          )}
        </div>

        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase">
            Detected Companies / Employers ({companies.length})
          </span>
          {companies.length > 0 ? (
            <ul className="space-y-0.5 text-foreground">
              {companies.map((comp, i) => (
                <li key={i} className="truncate">• {comp}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground italic">None detected</p>
          )}
        </div>
      </div>

      {/* Detailed Granular Event Stream */}
      <div className="mt-4 border-t pt-2.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase">
          Detailed Event Log
        </span>
        <div className="mt-1.5 max-h-48 overflow-y-auto space-y-1 text-[11px] text-muted-foreground">
          {logs.map((log, index) => (
            <div key={index} className="flex items-start gap-2">
              <span className={`shrink-0 font-semibold ${
                log.category === "company"
                  ? "text-blue-600 dark:text-blue-400"
                  : log.category === "institution"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : log.category === "section"
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-muted-foreground"
              }`}>
                [{log.category.toUpperCase()}]
              </span>
              <span className="text-foreground/90">{log.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
