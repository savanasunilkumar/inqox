export type OnboardingGroup = {
  title: string;
  rows: string[][];
  layout?: "grid" | "questions";
};

export type OnboardingStep = {
  id: "background" | "contact" | "authorization" | "preferences" | "disclosures";
  title: string;
  short: string;
  description: string;
  fields: string[];
  groups: OnboardingGroup[];
  optional?: boolean;
};

function step(definition: Omit<OnboardingStep, "fields">): OnboardingStep {
  return { ...definition, fields: definition.groups.flatMap(g => g.rows.flat()) };
}

export const onboardingSteps: OnboardingStep[] = [
  step({
    id: "background",
    title: "Background",
    short: "Background",
    description: "Pulled from your résumé. Fix anything that looks off.",
    groups: [
      { title: "Current role", rows: [["currentTitle", "currentCompany", "yearsExperience"]] },
      { title: "Highest education", rows: [["school"], ["degree", "major"], ["highestEducation", "graduationDate"]] },
    ],
  }),
  step({
    id: "contact",
    title: "Contact",
    short: "Contact",
    description: "How recruiters reach you.",
    groups: [
      { title: "Name", rows: [["firstName", "lastName", "preferredName"]] },
      { title: "Email & phone", rows: [["email", "phone"]] },
      { title: "Links", rows: [["linkedIn", "github"], ["website"]] },
      { title: "Mailing address", rows: [["address"], ["city", "region", "postalCode"], ["country"]] },
    ],
  }),
  step({
    id: "authorization",
    title: "Work authorization",
    short: "Authorization",
    description: "Asked on nearly every US application.",
    groups: [
      { title: "Country", rows: [["workCountry", "visaStatus"]] },
      { title: "Eligibility", layout: "questions", rows: [["authorizedToWork"], ["sponsorshipNow"], ["sponsorshipFuture"]] },
    ],
  }),
  step({
    id: "preferences",
    title: "Availability & pay",
    short: "Availability",
    description: "Answers screening questions about start date, location and pay.",
    groups: [
      { title: "Work arrangement", layout: "questions", rows: [["workPreference"], ["relocation"], ["travel"]] },
      { title: "Start date", rows: [["availableDate", "noticePeriod"]] },
      { title: "Compensation", rows: [["salaryAmount", "salaryCurrency", "salaryPeriod"]] },
    ],
  }),
  step({
    id: "disclosures",
    title: "Self-identification",
    short: "Self-ID",
    description: "Voluntary EEO questions. Answers never affect eligibility.",
    groups: [
      { title: "Voluntary questions", layout: "questions", rows: [["over18"], ["gender"], ["raceEthnicity"], ["veteranStatus"], ["disabilityStatus"]] },
    ],
    optional: true,
  }),
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
  preferredName: { autoComplete: "nickname" },
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
