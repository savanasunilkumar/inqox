"use client";

import { useState } from "react";
import { AlertTriangle, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { EntityLogo } from "@/components/entity-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ExtractedExperience } from "@/lib/profile-model";

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
    onExperienceListChange(nextList);
    if (nextList.length > 0 && index === 0) {
      onFieldChange("currentTitle", nextList[0].title);
      onFieldChange("currentCompany", nextList[0].company);
    }
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

      {/* Inline Form (Flat, cleanly separated) */}
      {(showAddForm || editingIndex !== null) && (
        <div className="space-y-3 rounded-lg bg-muted/40 p-4">
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
      )}

      {/* Experience List: Open, flat editorial typography, NO boxes */}
      {experienceList.length > 0 && (
        <div className="divide-y divide-border/40">
          {experienceList.map((item, index) => (
            <div
              key={index}
              className="group py-4 first:pt-1 last:pb-1"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                <EntityLogo name={item.company} kind="company" />
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      {item.title}
                    </h3>
                    {item.isCurrent && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-medium text-primary">
                    {item.company}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {[item.dateRange, item.location].filter(Boolean).join(" · ")}
                  </p>
                </div>
                </div>

                <div className="flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => startEdit(index)}
                    title="Edit role"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => removeItem(index)}
                    title="Delete role"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>

              {item.highlights && item.highlights.length > 0 && (
                <ul className="mt-2.5 space-y-1 text-xs text-foreground/85">
                  {item.highlights.map((bullet, bIdx) => (
                    <li key={bIdx} className="flex items-start gap-2">
                      <span className="text-muted-foreground">—</span>
                      <span className="leading-relaxed">{bullet}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
