"use client";

import { useMemo, useRef, useState } from "react";
import { useAgentFetch } from "@/lib/use-agent-fetch";
import { useProfile, ProfileLoading, ProfileLoadError } from "@/components/profile-provider";
import { ResumeUploadStep } from "@/components/resume-upload-step";
import { ResumeDocument } from "@/components/resume-document";
import { ProfileSummaryHeader } from "@/components/profile-summary-header";
import { ProfileExperienceSection } from "@/components/profile-experience-section";
import { ProfileEducationSection } from "@/components/profile-education-section";
import { ProfileExtractionLogs } from "@/components/profile-extraction-logs";
import { extractFromResumeText, type ResumeExtractionResult } from "@/lib/resume-extractor";
import { ProfileOnboarding } from "@/components/profile-onboarding";
import { profileCompletion } from "@/lib/profile-completion";
import type { ExtractedEducation, ExtractedExperience, Profile } from "@/lib/profile-model";

export function ProfileForm() {
  const { profile, loading, error, acceptSaved } = useProfile();

  if (loading) return <ProfileLoading />;
  if (error || !profile) return <ProfileLoadError />;

  return (
    <ProfileFormContent
      key={profile.resume?.uploadedAt ?? "no-resume"}
      profile={profile}
      acceptSaved={acceptSaved}
    />
  );
}

function ProfileFormContent({
  profile,
  acceptSaved,
}: {
  profile: Profile;
  acceptSaved: (saved: Profile) => void;
}) {
  const agentFetch = useAgentFetch();

  const [activeTab, setActiveTab] = useState<"extracted" | "pdf">("extracted");
  const [showLogs, setShowLogs] = useState(false);
  const [busy, setBusy] = useState("");

  const replaceInput = useRef<HTMLInputElement>(null);

  // Compute extraction from the uploaded résumé
  const resumeText = profile.resume?.text;
  const extractionResult = useMemo(() => {
    if (!resumeText) return null;
    return extractFromResumeText(resumeText);
  }, [resumeText]);

  const prefilled = useMemo(() => {
    const values: Record<string, string> = {};
    if (!extractionResult) return values;
    for (const [k, v] of Object.entries({ ...extractionResult.summary, ...extractionResult.contact })) {
      if (v) values[k] = v;
    }
    return values;
  }, [extractionResult]);

  // Initialize fields, merging extraction results into any empty fields
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const merged: Record<string, string> = { ...profile.fields };
    if (extractionResult) {
      for (const [k, v] of Object.entries(extractionResult.summary)) {
        if (!merged[k] && v) merged[k] = v;
      }
      for (const [k, v] of Object.entries(extractionResult.contact)) {
        if (!merged[k] && v) merged[k] = v;
      }
    }
    return merged;
  });

  const [experienceList, setExperienceList] = useState<ExtractedExperience[]>(() => {
    if (profile.experienceHistory && profile.experienceHistory.length > 0) {
      return profile.experienceHistory;
    }
    return extractionResult?.experience || [];
  });

  const [educationList, setEducationList] = useState<ExtractedEducation[]>(() => {
    if (profile.educationHistory && profile.educationHistory.length > 0) {
      return profile.educationHistory;
    }
    return extractionResult?.education || [];
  });

  const hasEducation = useMemo(() => {
    return (extractionResult?.hasEducation ?? false) || educationList.length > 0;
  }, [extractionResult, educationList]);

  const hasExperience = useMemo(() => {
    return (extractionResult?.hasExperience ?? false) || experienceList.length > 0;
  }, [extractionResult, experienceList]);

  const detectedInstitutions = useMemo(() => {
    return Array.from(new Set(educationList.map(e => e.school).filter(Boolean)));
  }, [educationList]);

  const detectedCompanies = useMemo(() => {
    return Array.from(new Set(experienceList.map(e => e.company).filter(Boolean)));
  }, [experienceList]);

  function handleFieldChange(field: string, value: string) {
    setFields(prev => ({ ...prev, [field]: value }));
  }

  async function updateResume(method: "PUT" | "DELETE", file?: File) {
    setBusy(method === "PUT" ? "upload" : "remove");
    try {
      let data: Profile & { error?: string };
      try {
        const response = await agentFetch("/api/agent/profile/resume", {
          method,
          ...(file ? { headers: { "Content-Type": "application/pdf", "X-File-Name": encodeURIComponent(file.name) }, body: file } : {}),
        });
        data = await response.json() as Profile & { error?: string };
        if (!response.ok) throw new Error(data.error || "Couldn’t update your résumé. Please try again.");
      } catch (agentErr) {
        // Fallback for local development if Cloudflare Worker binding is unavailable
        if (file && method === "PUT") {
          const formData = new FormData();
          formData.append("file", file);
          const extractRes = await fetch("/api/extract-resume", { method: "POST", body: formData });
          const extractData = await extractRes.json() as {
            extraction?: ResumeExtractionResult;
            text?: string;
            error?: string;
          };
          if (!extractRes.ok || !extractData.extraction) {
            throw new Error(extractData.error || "Could not read selectable text from this PDF. Please ensure it is not scanned.");
          }
          data = {
            fields: {
              ...(profile.fields || {}),
              ...extractData.extraction.summary,
              ...extractData.extraction.contact,
            },
            customAnswers: profile.customAnswers || [],
            educationHistory: extractData.extraction.education,
            experienceHistory: extractData.extraction.experience,
            resume: {
              name: file.name,
              size: file.size,
              key: `local/${file.name}`,
              text: extractData.text || "",
              uploadedAt: new Date().toISOString(),
            },
            updatedAt: new Date().toISOString(),
          };
        } else {
          throw agentErr;
        }
      }

      acceptSaved(data);
      setActiveTab("extracted");
    } finally {
      setBusy("");
    }
  }

  async function loadResume() {
    const response = await agentFetch("/api/agent/profile/resume");
    if (!response.ok) throw new Error("Couldn’t download your résumé. Please try again.");
    return response.blob();
  }

  async function download() {
    setBusy("download");
    try {
      const url = URL.createObjectURL(await loadResume());
      const link = document.createElement("a");
      link.href = url;
      link.download = profile.resume?.name || "resume.pdf";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } finally {
      setBusy("");
    }
  }

  async function saveProfile() {
    const response = await agentFetch("/api/agent/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v.trim())),
        customAnswers: profile.customAnswers || [],
        educationHistory: educationList,
        experienceHistory: experienceList,
      }),
    });
    const data = await response.json() as Profile & { error?: string };
    if (!response.ok) throw new Error(data.error || "Couldn’t save your profile. Please check the answers.");
    acceptSaved(data);
  }

  const completion = profileCompletion({ fields, resume: profile.resume });

  if (!profile.resume) {
    return (
      <ResumeUploadStep
        resume={null}
        loadResume={loadResume}
        onUpload={file => updateResume("PUT", file)}
        onRemove={() => updateResume("DELETE")}
        onDownload={download}
      />
    );
  }

  return (
    <div className="flex min-h-full flex-col">
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
          if (files.length) void updateResume("PUT", files[0]);
        }}
      />

      <ProfileSummaryHeader
        resumeName={profile.resume.name}
        resumeSize={profile.resume.size}
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
        logCount={extractionResult?.logs?.length || 0}
        busy={busy}
        onReplace={() => replaceInput.current?.click()}
        onDownload={download}
        onRemove={() => updateResume("DELETE")}
      />

      {activeTab === "extracted" ? (
        <div className="flex-1">
          {showLogs && (
            <div className="mx-auto w-full max-w-3xl px-4 pt-6 sm:px-6">
              <ProfileExtractionLogs
                logs={extractionResult?.logs || []}
                institutions={detectedInstitutions}
                companies={detectedCompanies}
              />
            </div>
          )}
          <ProfileOnboarding
            fields={fields}
            onFieldChange={handleFieldChange}
            prefilled={prefilled}
            completion={completion}
            onSave={saveProfile}
            background={<>
              <ProfileExperienceSection
                hasExperience={hasExperience}
                experienceList={experienceList}
                onExperienceListChange={setExperienceList}
                onFieldChange={handleFieldChange}
              />
              <ProfileEducationSection
                hasEducation={hasEducation}
                educationList={educationList}
                onEducationListChange={setEducationList}
                onFieldChange={handleFieldChange}
              />
            </>}
          />
        </div>
      ) : (
        /* Original PDF Document Viewer */
        <div className="flex-1 py-4">
          <ResumeDocument
            key={profile.resume.name + profile.resume.size}
            resume={profile.resume}
            loadResume={loadResume}
          />
        </div>
      )}
    </div>
  );
}
