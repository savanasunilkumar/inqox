"use client";

import { LoaderCircle, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function ProfileSummaryHeader({
  resumeName,
  resumeSize,
  educationCount,
  experienceCount,
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
  const size = resumeSize > 1024 * 1024 ? `${(resumeSize / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(resumeSize / 1024))} KB`;
  const found = [
    experienceCount ? plural(experienceCount, "role") : "no roles",
    educationCount ? plural(educationCount, "school") : "no schools",
  ].join(", ");

  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-b px-4 sm:px-6">
      <div className="flex min-w-0 flex-1 items-baseline gap-2 text-[13px]">
        <span className="truncate font-medium" title={resumeName}>{resumeName}</span>
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{size} · Found {found}</span>
        {busy && <LoaderCircle className="size-3.5 shrink-0 animate-spin self-center text-muted-foreground" aria-label="Working" />}
      </div>

      <ToggleGroup
        type="single"
        size="sm"
        value={activeTab}
        onValueChange={value => { if (value) onTabChange(value as "extracted" | "pdf"); }}
        aria-label="View"
      >
        <ToggleGroupItem value="extracted" className="px-2.5 text-xs">Profile</ToggleGroupItem>
        <ToggleGroupItem value="pdf" className="px-2.5 text-xs">Résumé PDF</ToggleGroupItem>
      </ToggleGroup>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Résumé actions" disabled={!!busy}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={onReplace}>Replace résumé…</DropdownMenuItem>
          <DropdownMenuItem onSelect={onDownload}>Download PDF</DropdownMenuItem>
          {logCount > 0 && (
            <DropdownMenuItem onSelect={onToggleLogs}>{showLogs ? "Hide extraction logs" : "Show extraction logs"}</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onRemove}>Remove résumé</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
