"use client";

import { useMemo, useRef, useState } from "react";
import { BriefcaseBusiness, Inbox, Kanban, LayoutDashboard, LockKeyhole, Settings, UserRound } from "lucide-react";
import { ResumeUploadStep } from "@/components/resume-upload-step";
import { ResumeDocument } from "@/components/resume-document";
import { ProfileSummaryHeader } from "@/components/profile-summary-header";
import { ProfileExperienceSection } from "@/components/profile-experience-section";
import { ProfileEducationSection } from "@/components/profile-education-section";
import { ProfileExtractionLogs } from "@/components/profile-extraction-logs";
import { ProfileOnboarding } from "@/components/profile-onboarding";
import { profileCompletion } from "@/lib/profile-completion";
import type { ExtractedEducation, ExtractedExperience } from "@/lib/profile-model";
import type { ExtractionLogEntry, ResumeExtractionResult } from "@/lib/resume-extractor";

// Rendered only by the server's explicit development preview mode. No account or API calls.
export function LocalProfilePreview() {
  const [file, setFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<"extracted" | "pdf">("extracted");
  const [showLogs, setShowLogs] = useState(false);
  const [busy, setBusy] = useState("");

  const replaceInput = useRef<HTMLInputElement>(null);

  const [experienceList, setExperienceList] = useState<ExtractedExperience[]>([]);
  const [educationList, setEducationList] = useState<ExtractedEducation[]>([]);
  const [hasEducation, setHasEducation] = useState(false);
  const [hasExperience, setHasExperience] = useState(false);
  const [logs, setLogs] = useState<ExtractionLogEntry[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [prefilled, setPrefilled] = useState<Record<string, string>>({});
  const completion = profileCompletion({
    fields,
    resume: file ? { key: "local", size: file.size, text: file.name } : null,
  });

  const items = [
    { label: "Dashboard", icon: LayoutDashboard },
    { label: "Job Board", icon: BriefcaseBusiness },
    { label: "Inbox", icon: Inbox },
    { label: "Tracker", icon: Kanban },
  ];

  async function download() {
    if (!file) return;
    setBusy("download");
    try {
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } finally {
      setBusy("");
    }
  }

  async function handleFileUpload(nextFile: File) {
    setBusy("upload");
    try {
      const formData = new FormData();
      formData.append("file", nextFile);

      const response = await fetch("/api/extract-resume", {
        method: "POST",
        body: formData,
      });

      const data = await response.json() as {
        success?: boolean;
        extraction?: ResumeExtractionResult;
        error?: string;
      };

      if (!response.ok || !data.extraction) {
        throw new Error(data.error || "Could not extract text from this PDF.");
      }

      const extracted = data.extraction;
      setHasEducation(extracted.hasEducation);
      setHasExperience(extracted.hasExperience);
      setEducationList(extracted.education || []);
      setExperienceList(extracted.experience || []);
      setLogs(extracted.logs || []);
      const values: Record<string, string> = {};
      for (const [k, v] of Object.entries({ ...extracted.summary, ...extracted.contact })) {
        if (v) values[k] = v;
      }
      setPrefilled(values);
      setFields(prev => ({ ...values, ...Object.fromEntries(Object.entries(prev).filter(([, v]) => v)) }));

      setActiveTab("extracted");
      setFile(nextFile);
    } finally {
      setBusy("");
    }
  }

  const detectedInstitutions = useMemo(() => {
    return Array.from(new Set(educationList.map(e => e.school).filter(Boolean)));
  }, [educationList]);

  const detectedCompanies = useMemo(() => {
    return Array.from(new Set(experienceList.map(e => e.company).filter(Boolean)));
  }, [experienceList]);

  return (
    <div className="flex h-svh overflow-hidden bg-sidebar">
      {/* Hidden file input for Replace */}
      <input
        ref={replaceInput}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        disabled={!!busy}
        onChange={event => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) void handleFileUpload(files[0]);
        }}
      />

      <aside aria-label="Preview navigation" className="hidden w-[11.5rem] shrink-0 flex-col justify-between px-2 pt-6 pb-4 md:flex">
        <div className="space-y-1">
          {items.map(({ label, icon: Icon }) => (
            <button key={label} disabled={!completion.complete} title={completion.complete ? undefined : "Complete your profile to unlock"} className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] font-medium text-muted-foreground ${completion.complete ? "hover:bg-sidebar-accent hover:text-foreground" : "cursor-not-allowed opacity-40"}`}>
              <Icon className="size-4" />
              <span>{label}</span>
              {!completion.complete && <LockKeyhole className="ml-auto size-3" />}
            </button>
          ))}
        </div>
        <div className="space-y-1">
          <button disabled title="Available in the signed-in app" className="flex h-8 w-full items-center gap-2 px-2 text-[13px] text-muted-foreground">
            <Settings className="size-4" />Settings
          </button>
          <div aria-current="page" className="app-nav-link flex h-8 items-center gap-2 rounded-md bg-sidebar-accent px-2 text-[13px] font-medium">
            <UserRound className="size-4" />Profile
          </div>
          <p className="mt-4 border-t px-2 pt-3 text-[11px] text-muted-foreground">inqox · Local preview</p>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background md:my-2 md:mr-2 md:rounded-xl md:border">
        <header className="flex h-12 shrink-0 items-center justify-between border-b px-5">
          <h1 className="text-[13px] font-medium">Profile</h1>
          <span className="text-[11px] text-muted-foreground">Local preview</span>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!file ? (
            <ResumeUploadStep
              resume={null}
              localPreview
              loadResume={async () => { throw new Error("No résumé selected."); }}
              onUpload={handleFileUpload}
              onRemove={async () => setFile(null)}
              onDownload={download}
            />
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <ProfileSummaryHeader
                resumeName={file.name}
                resumeSize={file.size}
                hasEducation={hasEducation}
                educationCount={educationList.length}
                educationHighlight={educationList[0]?.school ? `${educationList[0].school}` : undefined}
                hasExperience={hasExperience}
                experienceCount={experienceList.length}
                experienceHighlight={experienceList[0]?.company ? `${experienceList[0].company}` : undefined}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                showLogs={showLogs}
                onToggleLogs={() => setShowLogs(v => !v)}
                logCount={logs.length}
                busy={busy}
                onReplace={() => replaceInput.current?.click()}
                onDownload={download}
                onRemove={() => setFile(null)}
              />

              {activeTab === "extracted" ? (
                <div className="min-h-0 flex-1">
                  <ProfileOnboarding
                    notice={showLogs && (
                      <ProfileExtractionLogs logs={logs} institutions={detectedInstitutions} companies={detectedCompanies} />
                    )}
                    key={file.name + file.size}
                    fields={fields}
                    onFieldChange={(key, value) => setFields(prev => ({ ...prev, [key]: value }))}
                    prefilled={prefilled}
                    completion={completion}
                    onSave={async () => { await new Promise(resolve => setTimeout(resolve, 350)); }}
                    finishHref="/profile"
                    background={<>
                      <ProfileExperienceSection
                        hasExperience={hasExperience}
                        experienceList={experienceList}
                        onExperienceListChange={setExperienceList}
                        onFieldChange={(key, value) => setFields(prev => ({ ...prev, [key]: value }))}
                      />
                      <ProfileEducationSection
                        hasEducation={hasEducation}
                        educationList={educationList}
                        onEducationListChange={setEducationList}
                        onFieldChange={(key, value) => setFields(prev => ({ ...prev, [key]: value }))}
                      />
                    </>}
                  />
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto py-4">
                  <ResumeDocument
                    key={file.name + file.size}
                    resume={file}
                    loadResume={async () => file}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
