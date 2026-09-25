"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp, DollarSign, Lock, MessageSquareQuote, Plus, ShieldCheck, Trash2, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  fields: Record<string, string>;
  customAnswers: { question: string; answer: string }[];
  missingFields: string[];
  onFieldChange: (field: string, value: string) => void;
  onCustomAnswersChange: (answers: { question: string; answer: string }[]) => void;
};

export function ProfileAgentSections({
  fields,
  customAnswers,
  missingFields,
  onFieldChange,
  onCustomAnswersChange,
}: Props) {
  const [openSection, setOpenSection] = useState<string>("workAuth");

  // State for new custom answer
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [showAddAnswer, setShowAddAnswer] = useState(false);

  function isMissing(key: string) {
    return missingFields.includes(key);
  }

  function addCustomAnswer() {
    if (!newQuestion.trim() || !newAnswer.trim()) return;
    onCustomAnswersChange([...customAnswers, { question: newQuestion.trim(), answer: newAnswer.trim() }]);
    setNewQuestion("");
    setNewAnswer("");
    setShowAddAnswer(false);
  }

  function removeCustomAnswer(index: number) {
    onCustomAnswersChange(customAnswers.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      {/* 1. Work Authorization & Sponsorship */}
      <Card className="rounded-xl border">
        <CardHeader
          className="cursor-pointer select-none pb-3"
          onClick={() => setOpenSection(openSection === "workAuth" ? "" : "workAuth")}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheck className="size-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base font-semibold">Work Authorization & Sponsorship</CardTitle>
                  {(isMissing("workCountry") || isMissing("authorizedToWork") || isMissing("sponsorshipNow") || isMissing("sponsorshipFuture")) && (
                    <Badge variant="destructive" className="h-4 text-[10px] font-normal">
                      Required by agent
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  The agent never infers work permission; explicit answers are strictly required.
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="size-7">
              {openSection === "workAuth" ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </Button>
          </div>
        </CardHeader>

        {openSection === "workAuth" && (
          <CardContent className="space-y-4 border-t pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Country these permissions apply to <span className="text-destructive">*</span>
                </label>
                <Input
                  value={fields.workCountry || ""}
                  onChange={e => onFieldChange("workCountry", e.target.value)}
                  placeholder="e.g. United States"
                />
                <p className="text-[11px] text-muted-foreground">
                  Update this when applying in another country.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Legally authorized to work in that country? <span className="text-destructive">*</span>
                </label>
                <div className="flex gap-2 pt-1">
                  {["Yes", "No"].map(opt => (
                    <Button
                      key={opt}
                      type="button"
                      variant={fields.authorizedToWork === opt ? "default" : "outline"}
                      size="sm"
                      className="h-8 flex-1 text-xs"
                      onClick={() => onFieldChange("authorizedToWork", opt)}
                    >
                      {opt}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Will you require visa sponsorship now? <span className="text-destructive">*</span>
                </label>
                <div className="flex gap-2 pt-1">
                  {["Yes", "No"].map(opt => (
                    <Button
                      key={opt}
                      type="button"
                      variant={fields.sponsorshipNow === opt ? "default" : "outline"}
                      size="sm"
                      className="h-8 flex-1 text-xs"
                      onClick={() => onFieldChange("sponsorshipNow", opt)}
                    >
                      {opt}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Will you require sponsorship in the future? <span className="text-destructive">*</span>
                </label>
                <div className="flex gap-2 pt-1">
                  {["Yes", "No"].map(opt => (
                    <Button
                      key={opt}
                      type="button"
                      variant={fields.sponsorshipFuture === opt ? "default" : "outline"}
                      size="sm"
                      className="h-8 flex-1 text-xs"
                      onClick={() => onFieldChange("sponsorshipFuture", opt)}
                    >
                      {opt}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-foreground">
                  Visa / work authorization type (optional)
                </label>
                <Input
                  value={fields.visaStatus || ""}
                  onChange={e => onFieldChange("visaStatus", e.target.value)}
                  placeholder="e.g. US Citizen, Permanent Resident, H-1B, OPT/CPT, etc."
                />
                <p className="text-[11px] text-muted-foreground">
                  Optional. Enter your exact status; the agent will not infer it.
                </p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* 2. Availability & Compensation Preferences */}
      <Card className="rounded-xl border">
        <CardHeader
          className="cursor-pointer select-none pb-3"
          onClick={() => setOpenSection(openSection === "prefs" ? "" : "prefs")}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <DollarSign className="size-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base font-semibold">Availability & Compensation</CardTitle>
                  {(isMissing("workPreference") || isMissing("salaryAmount") || isMissing("availableDate")) && (
                    <Badge variant="destructive" className="h-4 text-[10px] font-normal">
                      Required by agent
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Salary expectations, start dates, and work arrangement preferences.
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="size-7">
              {openSection === "prefs" ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </Button>
          </div>
        </CardHeader>

        {openSection === "prefs" && (
          <CardContent className="space-y-4 border-t pt-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Preferred work arrangement <span className="text-destructive">*</span>
                </label>
                <select
                  value={fields.workPreference || ""}
                  onChange={e => onFieldChange("workPreference", e.target.value)}
                  className="h-8 w-full rounded-lg border border-input bg-card px-2.5 text-xs text-foreground outline-none focus:border-ring"
                >
                  <option value="">Select...</option>
                  {["Remote", "Hybrid", "On-site", "Flexible"].map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Available start date <span className="text-destructive">*</span>
                </label>
                <Input
                  type="date"
                  value={fields.availableDate || ""}
                  onChange={e => onFieldChange("availableDate", e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Notice period <span className="text-destructive">*</span>
                </label>
                <Input
                  value={fields.noticePeriod || ""}
                  onChange={e => onFieldChange("noticePeriod", e.target.value)}
                  placeholder="e.g. 2 weeks, Immediate"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Desired salary amount <span className="text-destructive">*</span>
                </label>
                <Input
                  value={fields.salaryAmount || ""}
                  onChange={e => onFieldChange("salaryAmount", e.target.value)}
                  placeholder="140000"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Currency <span className="text-destructive">*</span>
                </label>
                <Input
                  value={fields.salaryCurrency || "USD"}
                  onChange={e => onFieldChange("salaryCurrency", e.target.value)}
                  placeholder="USD"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Pay period <span className="text-destructive">*</span>
                </label>
                <select
                  value={fields.salaryPeriod || "Year"}
                  onChange={e => onFieldChange("salaryPeriod", e.target.value)}
                  className="h-8 w-full rounded-lg border border-input bg-card px-2.5 text-xs text-foreground outline-none focus:border-ring"
                >
                  {["Year", "Month", "Hour"].map(opt => (
                    <option key={opt} value={opt}>Per {opt}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Willing to relocate? <span className="text-destructive">*</span>
                </label>
                <div className="flex gap-2 pt-1">
                  {["Yes", "No"].map(opt => (
                    <Button
                      key={opt}
                      type="button"
                      variant={fields.relocation === opt ? "default" : "outline"}
                      size="sm"
                      className="h-8 flex-1 text-xs"
                      onClick={() => onFieldChange("relocation", opt)}
                    >
                      {opt}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-foreground">
                  Willingness to travel <span className="text-destructive">*</span>
                </label>
                <Input
                  value={fields.travel || ""}
                  onChange={e => onFieldChange("travel", e.target.value)}
                  placeholder="e.g. None, Up to 25%, Flexible"
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* 3. Personal & Contact Details */}
      <Card className="rounded-xl border">
        <CardHeader
          className="cursor-pointer select-none pb-3"
          onClick={() => setOpenSection(openSection === "contact" ? "" : "contact")}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <User className="size-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base font-semibold">Personal & Contact Details</CardTitle>
                  {(isMissing("firstName") || isMissing("lastName") || isMissing("email") || isMissing("phone")) && (
                    <Badge variant="destructive" className="h-4 text-[10px] font-normal">
                      Required by agent
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Pre-filled from your résumé header and used for employer contact fields.
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="size-7">
              {openSection === "contact" ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </Button>
          </div>
        </CardHeader>

        {openSection === "contact" && (
          <CardContent className="space-y-4 border-t pt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  First name <span className="text-destructive">*</span>
                </label>
                <Input
                  value={fields.firstName || ""}
                  onChange={e => onFieldChange("firstName", e.target.value)}
                  placeholder="First name"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Last name <span className="text-destructive">*</span>
                </label>
                <Input
                  value={fields.lastName || ""}
                  onChange={e => onFieldChange("lastName", e.target.value)}
                  placeholder="Last name"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Preferred name (optional)
                </label>
                <Input
                  value={fields.preferredName || ""}
                  onChange={e => onFieldChange("preferredName", e.target.value)}
                  placeholder="Preferred name"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Email address <span className="text-destructive">*</span>
                </label>
                <Input
                  type="email"
                  value={fields.email || ""}
                  onChange={e => onFieldChange("email", e.target.value)}
                  placeholder="you@example.com"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Phone (with country code) <span className="text-destructive">*</span>
                </label>
                <Input
                  type="tel"
                  value={fields.phone || ""}
                  onChange={e => onFieldChange("phone", e.target.value)}
                  placeholder="+1 (555) 000-0000"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Street address <span className="text-destructive">*</span>
                </label>
                <Input
                  value={fields.address || ""}
                  onChange={e => onFieldChange("address", e.target.value)}
                  placeholder="123 Main St"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  City <span className="text-destructive">*</span>
                </label>
                <Input
                  value={fields.city || ""}
                  onChange={e => onFieldChange("city", e.target.value)}
                  placeholder="City"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  State / Province <span className="text-destructive">*</span>
                </label>
                <Input
                  value={fields.region || ""}
                  onChange={e => onFieldChange("region", e.target.value)}
                  placeholder="State / Region"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Postal code <span className="text-destructive">*</span>
                </label>
                <Input
                  value={fields.postalCode || ""}
                  onChange={e => onFieldChange("postalCode", e.target.value)}
                  placeholder="Postal code"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Country of residence <span className="text-destructive">*</span>
                </label>
                <Input
                  value={fields.country || ""}
                  onChange={e => onFieldChange("country", e.target.value)}
                  placeholder="United States"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  LinkedIn URL
                </label>
                <Input
                  value={fields.linkedIn || ""}
                  onChange={e => onFieldChange("linkedIn", e.target.value)}
                  placeholder="https://linkedin.com/in/..."
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  GitHub URL
                </label>
                <Input
                  value={fields.github || ""}
                  onChange={e => onFieldChange("github", e.target.value)}
                  placeholder="https://github.com/..."
                />
              </div>

              <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                <label className="text-xs font-medium text-foreground">
                  Portfolio or personal website URL
                </label>
                <Input
                  value={fields.website || ""}
                  onChange={e => onFieldChange("website", e.target.value)}
                  placeholder="https://yoursite.com"
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* 4. Optional Disclosures */}
      <Card className="rounded-xl border">
        <CardHeader
          className="cursor-pointer select-none pb-3"
          onClick={() => setOpenSection(openSection === "disclosures" ? "" : "disclosures")}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Lock className="size-4" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Equal Opportunity & Disclosures</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Voluntary self-identification for employer EEOC questions.
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="size-7">
              {openSection === "disclosures" ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </Button>
          </div>
        </CardHeader>

        {openSection === "disclosures" && (
          <CardContent className="space-y-4 border-t pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Are you at least 18?
                </label>
                <div className="flex gap-2 pt-1">
                  {["Yes", "No"].map(opt => (
                    <Button
                      key={opt}
                      type="button"
                      variant={fields.over18 === opt ? "default" : "outline"}
                      size="sm"
                      className="h-8 flex-1 text-xs"
                      onClick={() => onFieldChange("over18", opt)}
                    >
                      {opt}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Gender answer
                </label>
                <Input
                  value={fields.gender || ""}
                  onChange={e => onFieldChange("gender", e.target.value)}
                  placeholder="Prefer not to disclose, Male, Female, etc."
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Race / ethnicity answer
                </label>
                <Input
                  value={fields.raceEthnicity || ""}
                  onChange={e => onFieldChange("raceEthnicity", e.target.value)}
                  placeholder="Prefer not to disclose, or specify"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Veteran status answer
                </label>
                <Input
                  value={fields.veteranStatus || ""}
                  onChange={e => onFieldChange("veteranStatus", e.target.value)}
                  placeholder="I am not a protected veteran / Prefer not to say"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-foreground">
                  Disability status answer
                </label>
                <Input
                  value={fields.disabilityStatus || ""}
                  onChange={e => onFieldChange("disabilityStatus", e.target.value)}
                  placeholder="No, I don't have a disability / Prefer not to say"
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* 5. Custom Answers for ATS Questions */}
      <Card className="rounded-xl border">
        <CardHeader
          className="cursor-pointer select-none pb-3"
          onClick={() => setOpenSection(openSection === "custom" ? "" : "custom")}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <MessageSquareQuote className="size-4" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Saved Answers for Application Prompts</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Reusable custom answers for company questions (e.g. &quot;Why work here?&quot;, &quot;Proudest accomplishment&quot;).
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="size-7">
              {openSection === "custom" ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </Button>
          </div>
        </CardHeader>

        {openSection === "custom" && (
          <CardContent className="space-y-4 border-t pt-4">
            {customAnswers.length > 0 && (
              <div className="space-y-2.5">
                {customAnswers.map((item, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-3 rounded-lg border bg-muted/20 p-3">
                    <div className="min-w-0 space-y-1">
                      <p className="text-xs font-semibold text-foreground">{item.question}</p>
                      <p className="text-xs text-muted-foreground line-clamp-3">{item.answer}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => removeCustomAnswer(idx)}
                      title="Remove answer"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {showAddAnswer ? (
              <div className="space-y-3 rounded-lg border bg-muted/30 p-3.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Question or Prompt</label>
                  <Input
                    placeholder="e.g. What is your favorite programming language and why?"
                    value={newQuestion}
                    onChange={e => setNewQuestion(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Answer</label>
                  <Textarea
                    placeholder="Enter your concise, tailored response..."
                    value={newAnswer}
                    onChange={e => setNewAnswer(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setShowAddAnswer(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" className="h-8 gap-1 text-xs" onClick={addCustomAnswer}>
                    <Check className="size-3.5" />
                    Save Answer
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setShowAddAnswer(true)}
              >
                <Plus className="size-3.5" />
                Add reusable answer
              </Button>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
