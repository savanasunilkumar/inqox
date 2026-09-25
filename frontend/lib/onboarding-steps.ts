import { BriefcaseBusiness, ContactRound, HandCoins, ShieldCheck, UserRoundCheck, type LucideIcon } from "lucide-react";

export type OnboardingStep = {
  id: "background" | "contact" | "authorization" | "preferences" | "disclosures";
  title: string;
  short: string;
  description: string;
  icon: LucideIcon;
  fields: string[];
  optional?: boolean;
};

export const onboardingSteps: OnboardingStep[] = [
  {
    id: "background",
    title: "Review your background",
    short: "Background",
    description: "We pulled this from your résumé. Fix anything that looks off; employers see it exactly as it appears here.",
    icon: BriefcaseBusiness,
    fields: ["currentTitle", "currentCompany", "yearsExperience", "highestEducation", "school", "degree", "major", "graduationDate"],
  },
  {
    id: "contact",
    title: "Contact & location",
    short: "Contact",
    description: "How recruiters reach you. Most US applications ask for a full mailing address.",
    icon: ContactRound,
    fields: ["firstName", "lastName", "preferredName", "email", "phone", "linkedIn", "github", "website", "address", "city", "region", "postalCode", "country"],
  },
  {
    id: "authorization",
    title: "Work authorization",
    short: "Authorization",
    description: "Answered on nearly every US application. We never guess these — your exact answers are used.",
    icon: ShieldCheck,
    fields: ["workCountry", "authorizedToWork", "sponsorshipNow", "sponsorshipFuture", "visaStatus"],
  },
  {
    id: "preferences",
    title: "Availability & compensation",
    short: "Preferences",
    description: "Start date, work arrangement and pay expectations used to answer screening questions.",
    icon: HandCoins,
    fields: ["workPreference", "relocation", "travel", "availableDate", "noticePeriod", "salaryAmount", "salaryCurrency", "salaryPeriod"],
  },
  {
    id: "disclosures",
    title: "Voluntary self-identification",
    short: "Self-ID",
    description: "Optional EEO questions US employers are required to ask. Answers never affect eligibility; you can decline any of them.",
    icon: UserRoundCheck,
    fields: ["over18", "gender", "raceEthnicity", "veteranStatus", "disabilityStatus"],
    optional: true,
  },
];

const DECLINE = "I don’t wish to answer";

export type FieldUi = {
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email" | "url";
  suggestions?: string[];
  choices?: string[];
  wide?: boolean;
  datalist?: "countries" | "states";
};

export const fieldUi: Record<string, FieldUi> = {
  currentTitle: { placeholder: "Software Engineer", autoComplete: "organization-title" },
  currentCompany: { placeholder: "Acme Inc.", autoComplete: "organization" },
  yearsExperience: { placeholder: "3", inputMode: "numeric" },
  highestEducation: { suggestions: ["High school", "Associate’s", "Bachelor’s", "Master’s", "Doctorate"] },
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
  address: { autoComplete: "street-address", placeholder: "123 Main St, Apt 4", wide: true },
  city: { autoComplete: "address-level2" },
  region: { autoComplete: "address-level1", datalist: "states" },
  postalCode: { autoComplete: "postal-code", inputMode: "numeric" },
  country: { autoComplete: "country-name", datalist: "countries", suggestions: ["United States"] },
  workCountry: { datalist: "countries", suggestions: ["United States"] },
  visaStatus: { suggestions: ["US Citizen", "Green Card", "F-1 OPT", "F-1 STEM OPT", "H-1B"], wide: true },
  travel: { suggestions: ["None", "Up to 25%", "Up to 50%", "75% or more"] },
  availableDate: {},
  noticePeriod: { suggestions: ["Immediately", "2 weeks", "1 month"] },
  salaryAmount: { inputMode: "numeric", placeholder: "120000" },
  salaryCurrency: { suggestions: ["USD"] },
  over18: {},
  gender: { choices: ["Male", "Female", "Non-binary", DECLINE] },
  raceEthnicity: {
    choices: [
      "American Indian or Alaska Native", "Asian", "Black or African American", "Hispanic or Latino",
      "Native Hawaiian or Other Pacific Islander", "White", "Two or more races", DECLINE,
    ],
    wide: true,
  },
  veteranStatus: { choices: ["I am not a protected veteran", "I identify as a protected veteran", DECLINE], wide: true },
  disabilityStatus: { choices: ["No, I don’t have a disability", "Yes, I have a disability", DECLINE], wide: true },
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
