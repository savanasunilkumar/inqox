"use client";

import { AlertTriangle, CheckCircle2, Download, FileText, List, LoaderCircle, Terminal, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Props = {
  resumeName: string;
  resumeSize: number;
  hasEducation: boolean;
  educationCount: number;
  educationHighlight?: string;
  hasExperience: boolean;
  experienceCount: number;
  experienceHighlight?: string;
  activeTab: "extracted" | "pdf";
  onTabChange: (tab: "extracted" | "pdf") => void;
  showLogs: boolean;
  onToggleLogs: () => void;
  logCount: number;
  busy: string;
  onReplace: () => void;
  onDownload: () => void;
  onRemove: () => void;
};

export function ProfileSummaryHeader({
  resumeName,
  resumeSize,
  hasEducation,
  educationCount,
  educationHighlight,
  hasExperience,
  experienceCount,
  experienceHighlight,
  activeTab,
  onTabChange,
  showLogs,
  onToggleLogs,
  logCount,
  busy,
  onReplace,
  onDownload,
  onRemove,
}: Props) {
  const formattedSize = resumeSize > 1024 * 1024
    ? `${(resumeSize / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.round(resumeSize / 1024)} KB`;

  return (
    <div className="border-b px-4 py-4 sm:px-8">
      {/* Top row: Résumé metadata and actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <FileText className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{resumeName}</p>
            <p className="text-xs text-muted-foreground">{formattedSize} · PDF parsed</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs font-normal"
            disabled={!!busy}
            onClick={onReplace}
            title="Replace résumé"
          >
            {busy === "upload" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            <span>Replace</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs font-normal"
            disabled={!!busy}
            onClick={onDownload}
            title="Download résumé PDF"
          >
            {busy === "download" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            <span className="hidden sm:inline">Download</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            disabled={!!busy}
            onClick={onRemove}
            title="Remove résumé"
          >
            {busy === "remove" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
          </Button>
        </div>
      </div>

      {/* Detection status summary */}
      <div className="flex flex-wrap items-center gap-2.5 pt-1 pb-3">
        {hasExperience ? (
          <Badge variant="outline" className="h-6 max-w-full gap-1.5 border-emerald-500/25 bg-emerald-500/10 px-2.5 text-xs font-normal text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="min-w-0 truncate">
              Experience detected
              {experienceCount > 0 ? ` (${experienceCount} ${experienceCount === 1 ? "role" : "roles"})` : ""}
              {experienceHighlight ? ` · ${experienceHighlight}` : ""}
            </span>
          </Badge>
        ) : (
          <Badge variant="outline" className="h-6 gap-1.5 border-amber-500/30 bg-amber-500/10 px-2.5 text-xs font-normal text-amber-800 dark:text-amber-300">
            <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400" />
            <span>Experience not detected in résumé</span>
          </Badge>
        )}

        {hasEducation ? (
          <Badge variant="outline" className="h-6 max-w-full gap-1.5 border-emerald-500/25 bg-emerald-500/10 px-2.5 text-xs font-normal text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="min-w-0 truncate">
              Education detected
              {educationCount > 0 ? ` (${educationCount} ${educationCount === 1 ? "credential" : "credentials"})` : ""}
              {educationHighlight ? ` · ${educationHighlight}` : ""}
            </span>
          </Badge>
        ) : (
          <Badge variant="outline" className="h-6 gap-1.5 border-amber-500/30 bg-amber-500/10 px-2.5 text-xs font-normal text-amber-800 dark:text-amber-300">
            <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400" />
            <span>Education not detected in résumé</span>
          </Badge>
        )}

        {logCount > 0 && (
          <Button
            variant={showLogs ? "secondary" : "ghost"}
            size="sm"
            className="ml-auto h-6 gap-1.5 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
            onClick={onToggleLogs}
          >
            <Terminal className="size-3" />
            <span>{showLogs ? "Hide extraction logs" : "View extraction logs"}</span>
          </Button>
        )}
      </div>

      {/* Tabs navigation: Flat, clean, no box containers or sparkles */}
      <div className="flex items-center gap-4 border-t pt-3">
        <button
          type="button"
          onClick={() => onTabChange("extracted")}
          className={`flex items-center gap-1.5 pb-2 text-xs font-medium transition-colors border-b-2 ${
            activeTab === "extracted"
              ? "border-primary text-foreground font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <List className="size-3.5" />
          <span>Extracted Details</span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange("pdf")}
          className={`flex items-center gap-1.5 pb-2 text-xs font-medium transition-colors border-b-2 ${
            activeTab === "pdf"
              ? "border-primary text-foreground font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="size-3.5" />
          <span>Original Document (PDF)</span>
        </button>
      </div>
    </div>
  );
}
