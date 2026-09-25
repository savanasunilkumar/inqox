"use client";

import { useState } from "react";
import { ChevronRight, MoreHorizontal, Plus } from "lucide-react";
import { EntityLogo } from "@/components/entity-logo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ExtractedExperience } from "@/lib/profile-model";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function parseMonth(text: string, isEnd: boolean): number | null {
  const value = text.trim().toLowerCase();
  if (/present|current|now/.test(value)) {
    const now = new Date();
    return now.getFullYear() * 12 + now.getMonth();
  }
  const year = value.match(/(19|20)\d{2}/);
  if (!year) return null;
  const month = MONTHS.findIndex(m => value.includes(m));
  const numeric = value.match(/\b(\d{1,2})\/(?:19|20)\d{2}/);
  const index = month >= 0 ? month : numeric ? Number(numeric[1]) - 1 : isEnd ? 11 : 0;
  return Number(year[0]) * 12 + index;
}

// "Apr 2022 - Aug 2024" → "2 yrs 5 mos" (inclusive of both months, as résumés and LinkedIn count them).
export function formatDuration(dateRange: string): string {
  const [start, end] = dateRange.split(/\s*(?:-|–|—|\bto\b)\s*/i);
  if (!start || !end) return "";
  const from = parseMonth(start, false);
  const to = parseMonth(end, true);
  if (from === null || to === null || to < from) return "";
  const months = to - from + 1;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [years && `${years} yr${years > 1 ? "s" : ""}`, rest && `${rest} mo${rest > 1 ? "s" : ""}`].filter(Boolean).join(" ");
}

type Props = {
  hasExperience: boolean;
  experienceList: ExtractedExperience[];
  onExperienceListChange: (list: ExtractedExperience[]) => void;
  onFieldChange: (field: string, value: string) => void;
};

export function ProfileExperienceSection({
  hasExperience,
  experienceList,
  onExperienceListChange,
  onFieldChange,
}: Props) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const [formCompany, setFormCompany] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formDateRange, setFormDateRange] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formHighlights, setFormHighlights] = useState("");
  const [formIsCurrent, setFormIsCurrent] = useState(false);

  function startEdit(index: number) {
    const item = experienceList[index];
    setFormCompany(item.company || "");
    setFormTitle(item.title || "");
    setFormDateRange(item.dateRange || "");
    setFormLocation(item.location || "");
    setFormHighlights(item.highlights ? item.highlights.join("\n") : "");
    setFormIsCurrent(!!item.isCurrent);
    setEditingIndex(index);
    setShowAddForm(false);
  }

  function startAdd() {
    setFormCompany("");
    setFormTitle("");
    setFormDateRange("");
    setFormLocation("");
    setFormHighlights("");
    setFormIsCurrent(false);
    setShowAddForm(true);
    setEditingIndex(null);
  }

  function cancelForm() {
    setEditingIndex(null);
    setShowAddForm(false);
  }

  function saveItem() {
    if (!formTitle.trim() && !formCompany.trim()) return;

    const newItem: ExtractedExperience = {
      company: formCompany.trim() || "Company",
      title: formTitle.trim() || "Role",
      dateRange: formDateRange.trim(),
      location: formLocation.trim() || undefined,
      isCurrent: formIsCurrent,
      highlights: formHighlights
        .split("\n")
        .map(h => h.trim())
        .filter(Boolean),
    };

    let nextList: ExtractedExperience[];
    if (editingIndex !== null) {
      nextList = [...experienceList];
      nextList[editingIndex] = newItem;
    } else {
      nextList = [newItem, ...experienceList];
    }

    onExperienceListChange(nextList);

    if (editingIndex === 0 || editingIndex === null) {
      onFieldChange("currentTitle", newItem.title);
      onFieldChange("currentCompany", newItem.company);
    }

    cancelForm();
  }

  function removeItem(index: number) {
    const nextList = experienceList.filter((_, i) => i !== index);
    setExpanded(new Set());
    onExperienceListChange(nextList);
    if (nextList.length > 0 && index === 0) {
      onFieldChange("currentTitle", nextList[0].title);
      onFieldChange("currentCompany", nextList[0].company);
    }
  }

  function toggleExpanded(index: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function renderForm() {
    return (
      <div className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="exp-title" className="text-xs">Title</Label>
            <Input id="exp-title" placeholder="Senior Software Engineer" value={formTitle} onChange={e => setFormTitle(e.target.value)} autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="exp-company" className="text-xs">Company</Label>
            <Input id="exp-company" placeholder="Acme Inc." value={formCompany} onChange={e => setFormCompany(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="exp-dates" className="text-xs">Dates</Label>
            <Input id="exp-dates" placeholder="Jan 2021 - Present" value={formDateRange} onChange={e => setFormDateRange(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="exp-location" className="text-xs">Location</Label>
            <Input id="exp-location" placeholder="San Francisco, CA" value={formLocation} onChange={e => setFormLocation(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="exp-current" checked={formIsCurrent} onCheckedChange={v => setFormIsCurrent(v === true)} />
          <Label htmlFor="exp-current" className="text-xs font-normal">I currently work here</Label>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="exp-highlights" className="text-xs">Highlights <span className="font-normal text-muted-foreground">one per line</span></Label>
          <Textarea id="exp-highlights" value={formHighlights} onChange={e => setFormHighlights(e.target.value)} rows={4} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={cancelForm}>Cancel</Button>
          <Button size="sm" onClick={saveItem} disabled={!formTitle.trim() && !formCompany.trim()}>{editingIndex !== null ? "Save" : "Add role"}</Button>
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="experience-heading">
      <div className="mb-2 flex items-center justify-between">
        <h4 id="experience-heading" className="text-xs font-medium text-muted-foreground">
          Experience{experienceList.length > 0 && <span className="ml-1.5 tabular-nums">{experienceList.length}</span>}
        </h4>
        {!showAddForm && editingIndex === null && (
          <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={startAdd}>
            <Plus aria-hidden="true" />Add role
          </Button>
        )}
      </div>

      <div className="divide-y rounded-lg border bg-card">
        {showAddForm && renderForm()}
        {!hasExperience && experienceList.length === 0 && !showAddForm && (
          <p className="px-4 py-6 text-sm text-muted-foreground">No experience found in your résumé. Add your most recent role.</p>
        )}
        {experienceList.map((item, index) => {
          if (editingIndex === index) return <div key={index}>{renderForm()}</div>;
          const dateRange = item.isCurrent && item.dateRange
            ? `${item.dateRange.split(/\s*(?:-|–|—|\bto\b)\s*/i)[0]} - Present`
            : item.dateRange;
          const duration = dateRange ? formatDuration(dateRange) : "";
          const highlights = item.highlights ?? [];
          const isExpanded = expanded.has(index);
          const meta = [item.company, dateRange && (duration ? `${dateRange} (${duration})` : dateRange), item.location].filter(Boolean);
          return (
            <div key={index} className="flex gap-3 px-4 py-3">
              <EntityLogo name={item.company} kind="company" location={item.location} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">
                      {item.title}
                      {item.isCurrent && <span className="ml-2 text-xs font-normal text-muted-foreground">Current</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {meta.map((part, i) => (
                        <span key={i}>{i > 0 && <span className="px-1.5 text-muted-foreground/50">·</span>}<span className={i === 0 ? "text-foreground/80" : "tabular-nums"}>{part}</span></span>
                      ))}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-xs" className="-mr-1 text-muted-foreground" aria-label={`Actions for ${item.title} at ${item.company}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <DropdownMenuItem onSelect={() => startEdit(index)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => removeItem(index)}>Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {highlights.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(index)}
                      aria-expanded={isExpanded}
                      className="mt-1.5 inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <ChevronRight aria-hidden="true" className={`size-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                      {highlights.length} {highlights.length === 1 ? "highlight" : "highlights"}
                    </button>
                    {isExpanded && (
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-foreground/80 marker:text-muted-foreground/50">
                        {highlights.map((bullet, bIdx) => <li key={bIdx}>{bullet}</li>)}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
