"use client";

import { useState } from "react";
import { AlertTriangle, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ExtractedEducation } from "@/lib/profile-model";

type Props = {
  hasEducation: boolean;
  educationList: ExtractedEducation[];
  onEducationListChange: (list: ExtractedEducation[]) => void;
  onFieldChange: (field: string, value: string) => void;
};

export function ProfileEducationSection({
  hasEducation,
  educationList,
  onEducationListChange,
  onFieldChange,
}: Props) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const [formSchool, setFormSchool] = useState("");
  const [formDegree, setFormDegree] = useState("");
  const [formMajor, setFormMajor] = useState("");
  const [formGradDate, setFormGradDate] = useState("");
  const [formGpa, setFormGpa] = useState("");

  function startEdit(index: number) {
    const item = educationList[index];
    setFormSchool(item.school || "");
    setFormDegree(item.degree || "");
    setFormMajor(item.major || "");
    setFormGradDate(item.graduationDate || "");
    setFormGpa(item.gpa || "");
    setEditingIndex(index);
    setShowAddForm(false);
  }

  function startAdd() {
    setFormSchool("");
    setFormDegree("Bachelor’s");
    setFormMajor("");
    setFormGradDate("");
    setFormGpa("");
    setShowAddForm(true);
    setEditingIndex(null);
  }

  function cancelForm() {
    setEditingIndex(null);
    setShowAddForm(false);
  }

  function saveItem() {
    if (!formSchool.trim() && !formDegree.trim()) return;

    const newItem: ExtractedEducation = {
      school: formSchool.trim() || "University",
      degree: formDegree.trim() || "Bachelor’s",
      major: formMajor.trim(),
      graduationDate: formGradDate.trim(),
      gpa: formGpa.trim() || undefined,
    };

    let nextList: ExtractedEducation[];
    if (editingIndex !== null) {
      nextList = [...educationList];
      nextList[editingIndex] = newItem;
    } else {
      nextList = [newItem, ...educationList];
    }

    onEducationListChange(nextList);

    if (editingIndex === 0 || editingIndex === null) {
      onFieldChange("highestEducation", newItem.degree);
      onFieldChange("school", newItem.school);
      onFieldChange("degree", newItem.degree);
      onFieldChange("major", newItem.major);
      onFieldChange("graduationDate", newItem.graduationDate);
    }

    cancelForm();
  }

  function removeItem(index: number) {
    const nextList = educationList.filter((_, i) => i !== index);
    onEducationListChange(nextList);
    if (nextList.length > 0 && index === 0) {
      onFieldChange("highestEducation", nextList[0].degree);
      onFieldChange("school", nextList[0].school);
      onFieldChange("degree", nextList[0].degree);
      onFieldChange("major", nextList[0].major);
      onFieldChange("graduationDate", nextList[0].graduationDate);
    }
  }

  return (
    <section aria-label="Education" className="space-y-4">
      {/* Section Header: Open, clean, no box container */}
      <div className="flex items-baseline justify-between border-b pb-3">
        <div>
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Education
          </h2>
          <p className="text-sm font-medium text-foreground">
            {educationList.length > 0
              ? `${educationList.length} ${educationList.length === 1 ? "credential" : "credentials"} found`
              : "Academic credentials"}
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
            <span>Add education</span>
          </Button>
        )}
      </div>

      {/* Warning if no education section was detected */}
      {!hasEducation && educationList.length === 0 && (
        <div className="flex items-start gap-3 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1">
            <p className="font-medium">No education section detected in this résumé</p>
            <p className="text-amber-800/90 dark:text-amber-300/80">
              Add your university or highest degree so employers have your academic background.
            </p>
          </div>
        </div>
      )}

      {/* Inline Form (Flat, cleanly separated) */}
      {(showAddForm || editingIndex !== null) && (
        <div className="space-y-3 rounded-lg bg-muted/40 p-4">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-xs font-semibold text-foreground">
              {editingIndex !== null ? "Edit Education" : "New Education"}
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
                University / Institution <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="e.g. Stanford University"
                value={formSchool}
                onChange={e => setFormSchool(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                Degree <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="e.g. Bachelor of Science"
                value={formDegree}
                onChange={e => setFormDegree(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                Field of Study / Major <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="e.g. Computer Science"
                value={formMajor}
                onChange={e => setFormMajor(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                Graduation Date / Year
              </label>
              <Input
                placeholder="e.g. 2024 or May 2024"
                value={formGradDate}
                onChange={e => setFormGradDate(e.target.value)}
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-[11px] font-medium text-muted-foreground">
                GPA / Honors (optional)
              </label>
              <Input
                placeholder="e.g. 3.8 / 4.0"
                value={formGpa}
                onChange={e => setFormGpa(e.target.value)}
              />
            </div>
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

      {/* Education List: Open, flat editorial typography, NO boxes */}
      {educationList.length > 0 && (
        <div className="divide-y divide-border/40">
          {educationList.map((item, index) => (
            <div
              key={index}
              className="group py-4 first:pt-1 last:pb-1"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-semibold text-foreground">
                    {item.degree}{item.major ? ` in ${item.major}` : ""}
                  </h3>
                  <p className="text-xs font-medium text-primary">
                    {item.school}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {[
                      item.graduationDate ? `Graduated ${item.graduationDate}` : "",
                      item.gpa ? `GPA: ${item.gpa}` : "",
                    ].filter(Boolean).join(" · ")}
                  </p>
                </div>

                <div className="flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => startEdit(index)}
                    title="Edit education"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => removeItem(index)}
                    title="Delete education"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
