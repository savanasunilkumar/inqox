export type ProfileField = {
  key: string;
  label: string;
  group: string;
  type?: string;
  options?: string[];
  hint?: string;
};
const yesNo = ["Yes", "No"];
export const profileFields: ProfileField[] = [
  { key: "firstName", label: "First name", group: "Personal details" },
  { key: "lastName", label: "Last name", group: "Personal details" },
  { key: "preferredName", label: "Preferred name", group: "Personal details" },
  { key: "email", label: "Email", type: "email", group: "Personal details" },
  {
    key: "phone",
    label: "Phone (with country code)",
    type: "tel",
    group: "Personal details",
  },
  {
    key: "linkedIn",
    label: "LinkedIn URL",
    type: "url",
    group: "Personal details",
  },
  {
    key: "website",
    label: "Portfolio or website URL",
    type: "url",
    group: "Personal details",
  },
  {
    key: "github",
    label: "GitHub URL",
    type: "url",
    group: "Personal details",
  },
  { key: "address", label: "Street address", group: "Location" },
  { key: "city", label: "City", group: "Location" },
  { key: "region", label: "State / province", group: "Location" },
  { key: "postalCode", label: "Postal code", group: "Location" },
  { key: "country", label: "Country of residence", group: "Location" },
  {
    key: "workCountry",
    label: "Country these work permissions apply to",
    group: "Work authorization",
    hint: "For example, United States. Update this when applying in another country.",
  },
  {
    key: "authorizedToWork",
    label: "Legally authorized to work in that country?",
    options: yesNo,
    group: "Work authorization",
  },
  {
    key: "sponsorshipNow",
    label: "Need visa sponsorship now?",
    options: yesNo,
    group: "Work authorization",
  },
  {
    key: "sponsorshipFuture",
    label: "Need visa sponsorship in the future?",
    options: yesNo,
    group: "Work authorization",
  },
  {
    key: "visaStatus",
    label: "Visa / work authorization type",
    group: "Work authorization",
    hint: "Optional. Enter your exact status; the agent will not infer it.",
  },
  {
    key: "currentTitle",
    label: "Current or most recent job title",
    group: "Experience & education",
  },
  {
    key: "currentCompany",
    label: "Current or most recent employer",
    group: "Experience & education",
  },
  {
    key: "yearsExperience",
    label: "Years of professional experience",
    group: "Experience & education",
  },
  {
    key: "highestEducation",
    label: "Highest education level",
    group: "Experience & education",
  },
  {
    key: "school",
    label: "University / school",
    group: "Experience & education",
  },
  { key: "degree", label: "Degree", group: "Experience & education" },
  { key: "major", label: "Field of study", group: "Experience & education" },
  {
    key: "graduationDate",
    label: "Graduation date",
    group: "Experience & education",
  },
  {
    key: "relocation",
    label: "Willing to relocate?",
    options: yesNo,
    group: "Availability & preferences",
  },
  {
    key: "workPreference",
    label: "Preferred work arrangement",
    options: ["Remote", "Hybrid", "On-site", "Flexible"],
    group: "Availability & preferences",
  },
  {
    key: "noticePeriod",
    label: "Notice period",
    group: "Availability & preferences",
  },
  {
    key: "availableDate",
    label: "Available start date",
    type: "date",
    group: "Availability & preferences",
  },
  {
    key: "salaryAmount",
    label: "Desired salary / compensation amount",
    group: "Availability & preferences",
  },
  {
    key: "salaryCurrency",
    label: "Currency",
    group: "Availability & preferences",
  },
  {
    key: "salaryPeriod",
    label: "Pay period",
    options: ["Year", "Month", "Hour"],
    group: "Availability & preferences",
  },
  {
    key: "travel",
    label: "Willingness to travel",
    group: "Availability & preferences",
  },
  {
    key: "over18",
    label: "Are you at least 18?",
    options: yesNo,
    group: "Optional disclosures",
  },
  {
    key: "gender",
    label: "Gender answer",
    group: "Optional disclosures",
    hint: "Leave blank or enter your preferred answer, including prefer not to disclose.",
  },
  {
    key: "raceEthnicity",
    label: "Race / ethnicity answer",
    group: "Optional disclosures",
  },
  {
    key: "veteranStatus",
    label: "Veteran status answer",
    group: "Optional disclosures",
  },
  {
    key: "disabilityStatus",
    label: "Disability status answer",
    group: "Optional disclosures",
  },
];
export type ExtractedEducation = {
  school: string;
  degree: string;
  major: string;
  graduationDate: string;
  gpa?: string;
  rawText?: string;
};

export type ExtractedExperience = {
  company: string;
  title: string;
  dateRange: string;
  location?: string;
  highlights: string[];
  isCurrent?: boolean;
};

export type Profile = {
  fields: Record<string, string>;
  customAnswers: { question: string; answer: string }[];
  educationHistory?: ExtractedEducation[];
  experienceHistory?: ExtractedExperience[];
  resume: {
    name: string;
    size: number;
    uploadedAt: string;
    key: string;
    text: string;
  } | null;
  updatedAt: string | null;
};
export const emptyProfile: Profile = {
  fields: {},
  customAnswers: [],
  educationHistory: [],
  experienceHistory: [],
  resume: null,
  updatedAt: null,
};
