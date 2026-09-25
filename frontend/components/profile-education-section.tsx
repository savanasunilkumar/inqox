"use client";

import { useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { EntityLogo } from "@/components/entity-logo";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
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

  const editing = showAddForm || editingIndex !== null;
  const form = (
    <div className="space-y-4 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="edu-school" className="text-xs">School</Label>
          <Input id="edu-school" placeholder="Iowa State University" value={formSchool} onChange={e => setFormSchool(e.target.value)} autoFocus />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="edu-degree" className="text-xs">Degree</Label>
          <Input id="edu-degree" placeholder="M.S." value={formDegree} onChange={e => setFormDegree(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="edu-major" className="text-xs">Field of study</Label>
          <Input id="edu-major" placeholder="Computer Engineering" value={formMajor} onChange={e => setFormMajor(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="edu-grad" className="text-xs">Graduation</Label>
          <Input id="edu-grad" placeholder="May 2026" value={formGradDate} onChange={e => setFormGradDate(e.target.value)} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="edu-gpa" className="text-xs">GPA <span className="font-normal text-muted-foreground">optional</span></Label>
          <Input id="edu-gpa" placeholder="3.8 / 4.0" value={formGpa} onChange={e => setFormGpa(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={cancelForm}>Cancel</Button>
        <Button size="sm" onClick={saveItem} disabled={!formSchool.trim() && !formDegree.trim()}>{editingIndex !== null ? "Save" : "Add school"}</Button>
      </div>
    </div>
  );

  return (
    <section aria-labelledby="education-heading">
      <div className="mb-2 flex items-center justify-between">
        <h4 id="education-heading" className="text-xs font-medium text-muted-foreground">
          Education{educationList.length > 0 && <span className="ml-1.5 tabular-nums">{educationList.length}</span>}
        </h4>
        {!editing && (
          <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={startAdd}>
            <Plus aria-hidden="true" />Add school
          </Button>
        )}
      </div>

      <div className="divide-y rounded-lg border bg-card">
        {showAddForm && form}
        {!hasEducation && educationList.length === 0 && !showAddForm && (
          <p className="px-4 py-6 text-sm text-muted-foreground">No education found in your résumé. Add your highest degree.</p>
        )}
        {educationList.map((item, index) => editingIndex === index ? <div key={index}>{form}</div> : (
          <div key={index} className="flex items-start gap-3 px-4 py-3">
            <EntityLogo name={item.school} kind="school" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">{item.degree}{item.major ? `, ${item.major}` : ""}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[item.school, item.graduationDate, item.gpa && `GPA ${item.gpa}`].filter(Boolean).map((part, i) => (
                  <span key={i}>{i > 0 && <span className="px-1.5 text-muted-foreground/50">·</span>}<span className={i === 0 ? "text-foreground/80" : "tabular-nums"}>{part}</span></span>
                ))}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" className="-mr-1 text-muted-foreground" aria-label={`Actions for ${item.school}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onSelect={() => startEdit(index)}>Edit</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => removeItem(index)}>Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>
    </section>
  );
}
