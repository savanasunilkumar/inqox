"use client";

import { useState } from "react";
import { AlertTriangle, Briefcase, Calendar, Check, ChevronDown, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { EntityLogo } from "@/components/entity-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ExtractedExperience } from "@/lib/profile-model";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const VISIBLE_HIGHLIGHTS = 3;

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
        <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-xs font-semibold text-foreground">
              {editingIndex !== null ? "Edit Position" : "New Position"}
            </span>
            <button
              type="button"
              onClick={cancelForm}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                Job Title <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="e.g. Senior Software Engineer"
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                Company Name <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="e.g. Stripe, Google, Acme Corp"
                value={formCompany}
                onChange={e => setFormCompany(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                Dates
              </label>
              <Input
                placeholder="e.g. 2021 – Present"
                value={formDateRange}
                onChange={e => setFormDateRange(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                Location (optional)
              </label>
              <Input
                placeholder="e.g. San Francisco, CA or Remote"
                value={formLocation}
                onChange={e => setFormLocation(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="isCurrentRole"
              checked={formIsCurrent}
              onChange={e => setFormIsCurrent(e.target.checked)}
              className="size-3.5 rounded border-input text-primary focus:ring-primary"
            />
            <label htmlFor="isCurrentRole" className="text-xs text-foreground">
              Current role
            </label>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              Accomplishments & Responsibilities (one per line)
            </label>
            <Textarea
              placeholder="• Architected backend microservices&#10;• Led team of engineers"
              value={formHighlights}
              onChange={e => setFormHighlights(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={cancelForm}>
              Cancel
            </Button>
            <Button size="sm" className="h-8 gap-1 text-xs" onClick={saveItem}>
              <Check className="size-3.5" />
              <span>{editingIndex !== null ? "Update" : "Add"}</span>
            </Button>
          </div>
        </div>
    );
  }

  return (
    <section aria-label="Work Experience" className="space-y-4">
      {/* Section Header: Open, clean, no box container */}
      <div className="flex items-baseline justify-between border-b pb-3">
        <div>
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Work Experience
          </h2>
          <p className="text-sm font-medium text-foreground">
            {experienceList.length > 0
              ? `${experienceList.length} ${experienceList.length === 1 ? "position" : "positions"} found`
              : "Employment history"}
          </p>
        </div>

        {!showAddForm && editingIndex === null && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs text-primary hover:bg-primary/10"
            onClick={startAdd}
          >
            <Plus className="size-3.5" />
            <span>Add position</span>
          </Button>
        )}
      </div>

      {/* Warning if no experience section was detected */}
      {!hasExperience && experienceList.length === 0 && (
        <div className="flex items-start gap-3 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1">
            <p className="font-medium">No experience section detected in this résumé</p>
            <p className="text-amber-800/90 dark:text-amber-300/80">
              Add your current position or internships so employers have your background.
            </p>
          </div>
        </div>
      )}

      {showAddForm && renderForm()}

      {experienceList.length > 0 && (
        <ol className="relative">
          {experienceList.map((item, index) => {
            if (editingIndex === index) {
              return <li key={index} className="py-2">{renderForm()}</li>;
            }
            const duration = item.dateRange ? formatDuration(item.dateRange) : "";
            const highlights = item.highlights ?? [];
            const isExpanded = expanded.has(index);
            const visible = isExpanded ? highlights : highlights.slice(0, VISIBLE_HIGHLIGHTS);
            const isLast = index === experienceList.length - 1;
            return (
              <li key={index} className="group relative flex gap-4 pb-6 last:pb-0">
                {!isLast && (
                  <span aria-hidden="true" className="absolute top-11 bottom-1 left-[17px] w-px bg-border" />
                )}
                <EntityLogo name={item.company} kind="company" location={item.location} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm leading-tight font-semibold text-foreground">{item.title}</h3>
                        {item.isCurrent && (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="flex items-center gap-1.5 text-[13px] text-foreground/80">
                        <Briefcase aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
                        <span className="truncate" title={item.company}>{item.company}</span>
                      </p>
                      {(item.dateRange || item.location) && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pt-0.5 text-xs text-muted-foreground">
                          {item.dateRange && (
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <Calendar aria-hidden="true" className="size-3" />
                              {item.dateRange}
                              {duration && <span className="text-muted-foreground/70">· {duration}</span>}
                            </span>
                          )}
                          {item.location && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin aria-hidden="true" className="size-3" />
                              {item.location}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => startEdit(index)}
                        aria-label={`Edit ${item.title} at ${item.company}`}
                        title="Edit role"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => removeItem(index)}
                        aria-label={`Delete ${item.title} at ${item.company}`}
                        title="Delete role"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  {visible.length > 0 && (
                    <ul className="mt-2.5 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-foreground/85 marker:text-muted-foreground/60">
                      {visible.map((bullet, bIdx) => (
                        <li key={bIdx}>{bullet}</li>
                      ))}
                    </ul>
                  )}
                  {highlights.length > VISIBLE_HIGHLIGHTS && (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(index)}
                      aria-expanded={isExpanded}
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      {isExpanded ? "Show less" : `Show ${highlights.length - VISIBLE_HIGHLIGHTS} more`}
                      <ChevronDown aria-hidden="true" className={`size-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
