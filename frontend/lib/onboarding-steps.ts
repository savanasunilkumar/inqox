export type OnboardingStep = {
  id: "background" | "contact" | "authorization" | "preferences" | "disclosures";
  title: string;
  short: string;
  description: string;
  fields: string[];
  groups: { title: string; fields: string[] }[];
  optional?: boolean;
};

export const onboardingSteps: OnboardingStep[] = [
  {
    id: "background",
    title: "Background",
    short: "Background",
    description: "Extracted from your résumé. Correct anything that looks off.",
    fields: ["currentTitle", "currentCompany", "yearsExperience", "highestEducation", "school", "degree", "major", "graduationDate"],
    groups: [{ title: "Most recent role", fields: ["currentTitle", "currentCompany", "yearsExperience"] }, { title: "Highest education", fields: ["highestEducation", "school", "degree", "major", "graduationDate"] }],
  },
  {
    id: "contact",
    title: "Contact & location",
    short: "Contact",
    description: "How recruiters reach you. Most US applications ask for a mailing address.",
    fields: ["firstName", "lastName", "preferredName", "email", "phone", "linkedIn", "github", "website", "address", "city", "region", "postalCode", "country"],
    groups: [{ title: "Name", fields: ["firstName", "lastName", "preferredName"] }, { title: "Contact", fields: ["email", "phone"] }, { title: "Links", fields: ["linkedIn", "github", "website"] }, { title: "Mailing address", fields: ["address", "city", "region", "postalCode", "country"] }],
  },
  {
    id: "authorization",
    title: "Work authorization",
    short: "Authorization",
    description: "Asked on nearly every US application. Used exactly as you answer.",
    fields: ["workCountry", "authorizedToWork", "sponsorshipNow", "sponsorshipFuture", "visaStatus"],
    groups: [{ title: "Eligibility", fields: ["workCountry", "authorizedToWork", "sponsorshipNow", "sponsorshipFuture", "visaStatus"] }],
  },
  {
    id: "preferences",
    title: "Availability & pay",
    short: "Availability",
    description: "Used to answer screening questions about start date, location and pay.",
    fields: ["workPreference", "relocation", "travel", "availableDate", "noticePeriod", "salaryAmount", "salaryCurrency", "salaryPeriod"],
    groups: [{ title: "Work arrangement", fields: ["workPreference", "relocation", "travel"] }, { title: "Start date", fields: ["availableDate", "noticePeriod"] }, { title: "Compensation", fields: ["salaryAmount", "salaryCurrency", "salaryPeriod"] }],
  },
  {
    id: "disclosures",
    title: "Self-identification",
    short: "Self-ID",
    description: "Voluntary EEO questions. Answers never affect eligibility.",
    fields: ["over18", "gender", "raceEthnicity", "veteranStatus", "disabilityStatus"],
    groups: [{ title: "Voluntary questions", fields: ["over18", "gender", "raceEthnicity", "veteranStatus", "disabilityStatus"] }],
    optional: true,
  },
];

const DECLINE = "I don’t wish to answer";

export type FieldUi = {
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email" | "url";
  options?: string[];
  datalist?: "countries" | "states" | "visas" | "notice";
};

export const fieldUi: Record<string, FieldUi> = {
  currentTitle: { placeholder: "Software Engineer", autoComplete: "organization-title" },
  currentCompany: { placeholder: "Acme Inc.", autoComplete: "organization" },
  yearsExperience: { placeholder: "3", inputMode: "numeric" },
  highestEducation: { options: ["High school", "Associate’s", "Bachelor’s", "Master’s", "Doctorate"] },
  school: { placeholder: "Iowa State University" },
  degree: { placeholder: "M.S." },
  major: { placeholder: "Computer Engineering" },
  graduationDate: { placeholder: "May 2026" },
  firstName: { autoComplete: "given-name" },
  lastName: { autoComplete: "family-name" },
  preferredName: { autoComplete: "nickname", placeholder: "Optional" },
  email: { autoComplete: "email", inputMode: "email", placeholder: "you@example.com" },
  phone: { autoComplete: "tel", inputMode: "tel", placeholder: "+1 555 123 4567" },
  linkedIn: { autoComplete: "url", inputMode: "url", placeholder: "https://linkedin.com/in/…" },
  github: { autoComplete: "url", inputMode: "url", placeholder: "https://github.com/…" },
  website: { autoComplete: "url", inputMode: "url", placeholder: "https://…" },
  address: { autoComplete: "street-address", placeholder: "123 Main St, Apt 4" },
  city: { autoComplete: "address-level2" },
  region: { autoComplete: "address-level1", datalist: "states" },
  postalCode: { autoComplete: "postal-code", inputMode: "numeric" },
  country: { autoComplete: "country-name", datalist: "countries", placeholder: "United States" },
  workCountry: { datalist: "countries", placeholder: "United States" },
  visaStatus: { placeholder: "e.g. F-1 STEM OPT", datalist: "visas" },
  travel: { options: ["None", "Up to 25%", "Up to 50%", "75% or more"] },
  availableDate: {},
  noticePeriod: { placeholder: "2 weeks", datalist: "notice" },
  salaryAmount: { inputMode: "numeric", placeholder: "120000" },
  salaryCurrency: { options: ["USD", "CAD", "EUR", "GBP", "INR"] },
  over18: {},
  gender: { options: ["Male", "Female", "Non-binary", DECLINE] },
  raceEthnicity: {
    options: [
      "American Indian or Alaska Native", "Asian", "Black or African American", "Hispanic or Latino",
      "Native Hawaiian or Other Pacific Islander", "White", "Two or more races", DECLINE,
    ],
  },
  veteranStatus: { options: ["I am not a protected veteran", "I identify as a protected veteran", DECLINE] },
  disabilityStatus: { options: ["No, I don’t have a disability", "Yes, I have a disability", DECLINE] },
};

export const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "District of Columbia",
  "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine",
  "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
  "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia",
  "Washington", "West Virginia", "Wisconsin", "Wyoming",
];

export const COUNTRIES = [
  "United States", "Canada", "India", "United Kingdom", "Germany", "France", "Ireland", "Netherlands", "Australia",
  "Singapore", "Japan", "China", "Mexico", "Brazil", "Israel", "United Arab Emirates", "Spain", "Italy", "Sweden", "Switzerland",
];

export const VISA_TYPES = ["US Citizen", "Green Card", "F-1 OPT", "F-1 STEM OPT", "H-1B", "TN", "L-1", "O-1"];
export const NOTICE_PERIODS = ["Immediately", "1 week", "2 weeks", "1 month", "2 months"];
