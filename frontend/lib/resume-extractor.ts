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

export type ExtractionLogEntry = {
  category: "institution" | "company" | "section" | "info";
  message: string;
  sourceLine?: string;
};

export type ResumeExtractionResult = {
  hasEducation: boolean;
  hasExperience: boolean;
  education: ExtractedEducation[];
  experience: ExtractedExperience[];
  summary: {
    currentTitle: string;
    currentCompany: string;
    yearsExperience: string;
    highestEducation: string;
    school: string;
    degree: string;
    major: string;
    graduationDate: string;
  };
  contact: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    city: string;
    region: string;
    country: string;
    linkedIn: string;
    github: string;
    website: string;
  };
  logs: ExtractionLogEntry[];
};

const DEGREE_PATTERNS = [
  { pattern: /\b(?:ph\.?d\.?|doctor\s+of\s+philosophy|doctorate)\b/i, label: "Doctorate" },
  { pattern: /\b(?:m\.?b\.?a\.?|master\s+of\s+business\s+administration)\b/i, label: "Master’s" },
  { pattern: /\b(?:m\.?s\.?|m\.?sc\.?|master\s+of\s+science|master\s+of\s+engineering|m\.?eng\.?|m\.?tech\.?|master\s+of\s+technology|mca|master\s+of\s+arts|m\.?a\.?|master(?:'s)?\s+degree)\b/i, label: "Master’s" },
  { pattern: /\b(?:b\.?s\.?|b\.?sc\.?|bachelor\s+of\s+science|bachelor\s+of\s+engineering|b\.?e\.?|b\.?tech\.?|bachelor\s+of\s+technology|bca|bba|bachelor\s+of\s+arts|b\.?a\.?|bachelor(?:'s)?\s+degree)\b/i, label: "Bachelor’s" },
  { pattern: /\b(?:associate(?:'s)?\s+degree|a\.?s\.?|a\.?a\.?|diploma)\b/i, label: "Associate" },
  { pattern: /\b(?:high\s+school\s+diploma|ged|secondary\s+school|12th|hsc)\b/i, label: "High School" },
];

const COMMON_MAJORS = [
  "Computer Science and Engineering",
  "Computer Science & Engineering",
  "Computer Science",
  "Software Engineering",
  "Information Technology",
  "Electrical and Electronics Engineering",
  "Electrical Engineering",
  "Electronics and Communication",
  "Computer Engineering",
  "Data Science",
  "Artificial Intelligence",
  "Machine Learning",
  "Mechanical Engineering",
  "Civil Engineering",
  "Chemical Engineering",
  "Biomedical Engineering",
  "Business Administration",
  "Finance",
  "Accounting",
  "Economics",
  "Marketing",
  "Mathematics",
  "Applied Mathematics",
  "Statistics",
  "Physics",
  "Chemistry",
  "Psychology",
  "Human-Computer Interaction",
];

const JOB_TITLE_KEYWORDS = [
  "engineer", "developer", "architect", "manager", "lead", "director", "designer",
  "analyst", "scientist", "specialist", "consultant", "intern", "associate", "officer",
  "administrator", "coordinator", "researcher", "programmer", "technician", "supervisor",
  "vp", "head of", "chief", "cto", "ceo", "cfo", "product manager",
  "project manager", "devops", "sre", "qa", "qa engineer", "full stack", "full-stack",
  "frontend", "backend", "software development engineer", "sde", "sde-1", "sde-2", "sde-3",
  "mts", "member of technical staff", "tech lead", "team lead", "engineering lead", "co-founder", "founder",
  "assistant", "fellow", "trainee", "working student", "freelance", "freelancer", "instructor",
  "mentor", "apprentice",
];

const COMPANY_SUFFIX_REGEX = /\b(?:inc(?:\.|\b)|llc(?:\.|\b)|corp(?:\.|\b|oration)|ltd(?:\.|\b|imited)|co(?:\.|\b|mpany)|technologies|technology|tech|labs|laboratories|solutions|systems|software|consulting|group|ventures|enterprises|media|interactive|studios|global|health|capital|financial|networks)\b/i;

export function extractFromResumeText(text: string): ResumeExtractionResult {
  const logs: ExtractionLogEntry[] = [];

  if (!text || !text.trim()) {
    logs.push({ category: "info", message: "Empty résumé text provided." });
    return {
      hasEducation: false,
      hasExperience: false,
      education: [],
      experience: [],
      summary: {
        currentTitle: "",
        currentCompany: "",
        yearsExperience: "",
        highestEducation: "",
        school: "",
        degree: "",
        major: "",
        graduationDate: "",
      },
      contact: {
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        city: "",
        region: "",
        country: "",
        linkedIn: "",
        github: "",
        website: "",
      },
      logs,
    };
  }

  const cleanText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawLines = cleanText.split("\n").map(l => l.trim()).filter(Boolean);
  logs.push({ category: "info", message: `Parsed ${rawLines.length} text lines from résumé document.` });

  // 1. Extract Contact Info
  const contact = extractContact(cleanText, rawLines, logs);

  // 2. Identify Section Boundaries
  const sections = identifySections(rawLines, logs);

  // 3. Extract Education
  const education = extractEducation(sections.educationText, cleanText, rawLines, logs);
  const hasEducation = education.length > 0 || checkHasEducationKeywords(cleanText);

  // 4. Extract Experience (with accurate company detection)
  const experience = extractExperience(sections.experienceText, cleanText, rawLines, logs);
  const hasExperience = experience.length > 0 || checkHasExperienceKeywords(cleanText);

  // 5. Compute Summaries
  let highestEducation = "";
  if (education.length > 0) {
    highestEducation = education[0].degree || "Bachelor’s";
  } else if (hasEducation) {
    for (const d of DEGREE_PATTERNS) {
      if (d.pattern.test(cleanText)) {
        highestEducation = d.label;
        break;
      }
    }
  }

  const primarySchool = education[0]?.school || "";
  const primaryDegree = education[0]?.degree || highestEducation || "";
  const primaryMajor = education[0]?.major || "";
  const primaryGrad = education[0]?.graduationDate || "";

  const currentRole = experience.find(e => e.isCurrent) || experience[0];
  const currentTitle = currentRole?.title || "";
  const currentCompany = currentRole?.company || "";
  const yearsExperience = estimateYearsExperience(cleanText, experience);

  logs.push({
    category: "info",
    message: `Final summary: Current Role: "${currentTitle}" at "${currentCompany}" (${yearsExperience} yrs) | Education: "${primaryDegree}" in "${primaryMajor}" at "${primarySchool}"`,
  });

  return {
    hasEducation,
    hasExperience,
    education,
    experience,
    summary: {
      currentTitle,
      currentCompany,
      yearsExperience,
      highestEducation: highestEducation || (hasEducation ? "Bachelor’s" : ""),
      school: primarySchool,
      degree: primaryDegree,
      major: primaryMajor,
      graduationDate: primaryGrad,
    },
    contact,
    logs,
  };
}

function extractContact(fullText: string, lines: string[], logs: ExtractionLogEntry[]): ResumeExtractionResult["contact"] {
  // Email
  const emailMatch = fullText.match(/\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/);
  const email = emailMatch ? emailMatch[1].toLowerCase() : "";

  // Phone (US and International)
  const phoneMatch = fullText.match(/(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{4}\b/);
  let phone = "";
  if (phoneMatch) {
    const digits = phoneMatch[0].replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15) {
      phone = phoneMatch[0].trim();
    }
  }

  // LinkedIn
  const linkedInMatch = fullText.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9_-]+)/i);
  const linkedIn = linkedInMatch ? `https://linkedin.com/in/${linkedInMatch[1]}` : "";

  // GitHub
  const githubMatch = fullText.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)/i);
  const github = githubMatch ? `https://github.com/${githubMatch[1]}` : "";

  // Personal website / portfolio
  let website = "";
  const webMatches = fullText.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.(?:dev|me|io|com|org|net|app|page|site)(?:\/[^\s,)]*)?)/gi);
  if (webMatches) {
    for (const rawUrl of webMatches) {
      if (!/linkedin\.com|github\.com|gmail\.com|yahoo\.com|outlook\.com|hotmail\.com|google\.com/i.test(rawUrl)) {
        website = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
        break;
      }
    }
  }

  // Name
  let firstName = "";
  let lastName = "";
  for (let i = 0; i < Math.min(4, lines.length); i++) {
    const line = lines[i].replace(/[|•·,].*$/, "").trim();
    if (
      line.length >= 2 &&
      line.length < 50 &&
      !line.includes("@") &&
      !line.includes("http") &&
      !/\d/.test(line) &&
      !/^(?:resume|curriculum\s+vitae|profile|summary|contact|phone|email)$/i.test(line)
    ) {
      const parts = line.split(/\s+/).filter(Boolean);
      if (parts.length >= 2 && parts.length <= 4) {
        firstName = parts[0];
        lastName = parts.slice(1).join(" ");
        break;
      }
    }
  }

  // Location
  let city = "";
  let region = "";
  let country = "";
  const locMatch = fullText.match(/\b([A-Z][a-zA-Z\s.-]+),\s*([A-Z]{2}|[A-Z][a-zA-Z\s]+)(?:,\s*([A-Z][a-zA-Z\s]+))?\b/);
  if (locMatch && !/university|college|school|institute/i.test(locMatch[1])) {
    city = locMatch[1].trim();
    region = locMatch[2].trim();
    country = locMatch[3]?.trim() || (region.length === 2 ? "United States" : "");
  }

  logs.push({ category: "info", message: `Contact detected: ${firstName} ${lastName} (${email || "no email"})` });

  return { firstName, lastName, email, phone, city, region, country, linkedIn, github, website };
}

function checkHasEducationKeywords(text: string): boolean {
  return /\b(?:education|academic|academics|degree|university|college|institute|bachelor|master|ph\.?d|b\.?s\.?|m\.?s\.?|b\.?tech|m\.?tech|gpa|cgpa)\b/i.test(text);
}

function checkHasExperienceKeywords(text: string): boolean {
  return /\b(?:experience|employment|work history|career|internship|responsibilities|engineered|developed|managed|led|worked as|employed)\b/i.test(text);
}

function identifySections(lines: string[], logs: ExtractionLogEntry[]): { educationText: string; experienceText: string } {
  const educationLines: string[] = [];
  const experienceLines: string[] = [];
  let currentSection: "none" | "education" | "experience" | "other" = "none";

  const isEducationHeader = (line: string) => {
    const clean = line.replace(/^[#*\-–—|•·\s]+|[#*\-–—|•·:\s]+$/g, "").trim().toLowerCase();
    return /^(?:education|academics?|academic\s+background|degrees?|qualifications?|educational\s+background|studies)(?:\s*(?:&|and|\/)\s*[a-z\s]+)?$/i.test(clean);
  };

  const isExperienceHeader = (line: string) => {
    const clean = line.replace(/^[#*\-–—|•·\s]+|[#*\-–—|•·:\s]+$/g, "").trim().toLowerCase();
    return /^(?:(?:work|professional|career|relevant|employment|industry|internship)?\s*experiences?|employment(?:\s+history)?|work\s+history|experience\s+and\s+projects|professional\s+(?:background|history)|career\s+history|internships?|positions?|roles)(?:\s*(?:&|and|\/)\s*[a-z\s]+)?$/i.test(clean);
  };

  const isOtherHeader = (line: string) => {
    const clean = line.replace(/^[#*\-–—|•·\s]+|[#*\-–—|•·:\s]+$/g, "").trim().toLowerCase();
    // Allows qualifiers such as "AI Projects", "Academic Projects" or "Publications & Recognition".
    return /^(?:[a-z/-]+\s+){0,2}(?:skills|projects|certifications|awards|publications|languages|summary|objective|volunteer(?:ing)?|patents|interests|achievements|honors|leadership|activities)(?:\s*(?:&|and|\/)\s*[a-z\s]+)?$/i.test(clean);
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 60) {
      if (isEducationHeader(trimmed)) {
        currentSection = "education";
        logs.push({ category: "section", message: `Education section header found: "${trimmed}"` });
        continue;
      }
      if (isExperienceHeader(trimmed)) {
        currentSection = "experience";
        logs.push({ category: "section", message: `Experience section header found: "${trimmed}"` });
        continue;
      }
      if (isOtherHeader(trimmed)) {
        currentSection = "other";
        continue;
      }
    }

    if (currentSection === "education") {
      educationLines.push(line);
    } else if (currentSection === "experience") {
      experienceLines.push(line);
    }
  }

  return {
    educationText: educationLines.join("\n"),
    experienceText: experienceLines.join("\n"),
  };
}

const US_STATE_CODES = new Set(
  ("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY").split(" "),
);
const LOCATION_REGIONS =
  "united states|usa|u\\.s\\.a?\\.?|us|india|canada|uk|united kingdom|england|germany|france|ireland|netherlands|spain|italy|singapore|japan|china|australia|uae|israel|mexico|brazil|poland|switzerland|sweden|remote|" +
  "alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|" +
  "telangana|andhra pradesh|karnataka|maharashtra|tamil nadu|kerala|delhi|gujarat|west bengal|uttar pradesh|haryana|punjab|rajasthan|ontario|british columbia|quebec|alberta";
const REGION_TAIL = new RegExp(`,\\s*(?:[A-Z]{2}(?:\\s+\\d{5})?|(?:${LOCATION_REGIONS}))\\.?$`, "i");
const PURE_LOCATION = new RegExp(`^([A-Z][A-Za-z.' -]{1,30}),\\s*(?:[A-Z]{2}|${LOCATION_REGIONS})$`, "i");

function isPureLocation(line: string): boolean {
  const match = line.match(PURE_LOCATION);
  if (!match) return false;
  const words = match[1].trim().split(/\s+/);
  return words.length === 1 || (words.length <= 3 && CITY_PREFIXES.has(words[0].toLowerCase()));
}
const WORKPLACE_TAIL = /(?:^|[\s,(|–—-]+)\(?(remote|hybrid|on-?site)\)?\.?$/i;
// First words of common multi-word city names ("San Francisco", "New York", "Santa Clara").
const CITY_PREFIXES = new Set(
  ("san santa los las new salt palo mountain redwood fort ft st st. saint des kansas jersey cedar grand ann el la long sioux iowa sunny menlo foster half south north east west white college oklahoma baton little colorado").split(" "),
);

/**
 * Splits a trailing location ("Seattle, WA", "Hyderabad, India", "Remote") off an employer or
 * school line. PDF text extraction joins right-aligned locations onto the same line with only a
 * space, so the city boundary is inferred from delimiters, the region token, and city prefixes.
 */
function splitLocation(raw: string): { name: string; location: string } {
  const text = raw.trim().replace(/\s*[-–—|•·,]\s*$/, "");
  if (!text) return { name: "", location: "" };

  const delimited = text.match(/^(.*\S)\s*(?:\||·|•|–|—|\s-\s|\s{2,})\s*([^|·•–—]+)$/);
  if (delimited) {
    const tail = delimited[2].trim();
    if (REGION_TAIL.test(tail) || /^(?:remote|hybrid|on-?site)$/i.test(tail) || new RegExp(`^(?:${LOCATION_REGIONS})$`, "i").test(tail)) {
      return { name: delimited[1].trim(), location: tail };
    }
  }

  const region = text.match(REGION_TAIL);
  if (region && region.index !== undefined) {
    const regionCode = region[0].replace(/^,\s*/, "").replace(/\s+\d{5}$/, "");
    if (regionCode.length === 2 && (regionCode !== regionCode.toUpperCase() || (!US_STATE_CODES.has(regionCode) && !/^(?:US|UK)$/.test(regionCode)))) {
      return { name: text, location: "" };
    }
    const before = text.slice(0, region.index).trim();
    const words = before.split(/\s+/);
    if (words.length <= 1) {
      return { name: before, location: regionCode };
    }
    let cityWords = 1;
    const last2 = words[words.length - 2]?.toLowerCase();
    const lastPair = words.slice(-2).join(" ").toLowerCase();
    const last3 = words[words.length - 3]?.toLowerCase();
    if (words.length >= 4 && last3 && CITY_PREFIXES.has(last3) && /^(?:lake|beach|park|valley)$/i.test(words[words.length - 2] ?? "")) cityWords = 3;
    else if (words.length >= 3 && ((last2 && CITY_PREFIXES.has(last2)) || new RegExp(`^(?:${LOCATION_REGIONS})$`, "i").test(lastPair))) cityWords = 2;
    const nameWords = words.slice(0, words.length - cityWords);
    const cityText = words.slice(words.length - cityWords).join(" ");
    if (/^[A-Z]/.test(cityText) && nameWords.length > 0 && !COMPANY_SUFFIX_REGEX.test(cityText)) {
      return {
        name: nameWords.join(" ").replace(/[\s,|–—-]+$/, ""),
        location: `${cityText}${region[0]}`.replace(/^[\s,]+/, ""),
      };
    }
  }

  const workplace = text.match(WORKPLACE_TAIL);
  if (workplace && workplace.index !== undefined && workplace.index > 0) {
    return { name: text.slice(0, workplace.index).trim(), location: workplace[1] };
  }

  return { name: text, location: "" };
}

/**
 * Removes location text from entry lines (keeping any date range in place) so employer and
 * school names are parsed without it. Returns the cleaned lines plus the location per line.
 */
function separateLocations(
  lines: string[],
  dateRegex: RegExp,
  logs: ExtractionLogEntry[],
  category: ExtractionLogEntry["category"],
): { lines: string[]; locations: string[] } {
  const locations: string[] = [];
  const cleaned = lines.map((line, idx) => {
    locations[idx] = "";
    if (/^[-•*·–—]/.test(line) || line.length > 110 || isPureLocation(line)) return line;
    const date = line.match(dateRegex);
    const withoutDate = date ? line.replace(date[0], " ").replace(/\s+/g, " ").trim() : line;
    const { name, location } = splitLocation(withoutDate);
    if (!location || !name) return line;
    locations[idx] = location;
    logs.push({ category, message: `Separated location "${location}" from "${name}"`, sourceLine: line });
    return date ? (line.indexOf(date[0]) === 0 ? `${date[0]} ${name}` : `${name} ${date[0]}`) : name;
  });
  return { lines: cleaned, locations };
}

function cleanCompanyName(raw: string): string {
  if (!raw) return "";
  let name = raw.trim();
  // Strip trailing dates, locations, or symbols
  name = name.replace(/\s*[-–—|•·]\s*$/, "");
  name = name.replace(/\s*\(.*?\)\s*$/, "");
  name = name.replace(/,\s*[A-Z]{2}(?:\s+\d{5})?$/, ""); // Strip ", CA" or ", CA 94105"
  name = name.replace(/,\s*(?:United States|USA|India|Remote|UK|Canada)$/i, "");
  // Strip workplace-type markers ("Remote", "(Hybrid)", "- On-site")
  name = name.replace(/[,\s]*\(?(?:remote|hybrid|on-?site|onsite)\)?\.?$/i, "");
  name = name.replace(/\s*[-–—|•·]\s*$/, "");
  // Strip a trailing ", City" tail (1-3 capitalized words that aren't a company suffix)
  const cityTail = name.match(/,\s*([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,2})$/);
  if (cityTail && !COMPANY_SUFFIX_REGEX.test(cityTail[1]) && !/\b(?:university|college|institute|school|academy|lab|center|centre)\b/i.test(cityTail[1])) {
    name = name.slice(0, cityTail.index).trim();
  }
  return name.trim();
}

function splitTitleAndCompany(line: string): { title: string; company: string } | null {
  // 1. "Title at Company" or "Title @ Company"
  const atMatch = line.match(/^(.+?)\s+(?:at|@)\s+([A-Za-z0-9&.\s'-]+?)(?:,\s*[A-Z]{2}|\s*\(|\s*[-–—|]|\s*$)/i);
  if (atMatch && atMatch[1].trim() && atMatch[2].trim()) {
    return { title: atMatch[1].trim(), company: cleanCompanyName(atMatch[2]) };
  }

  // 2. Delimiters: comma, hyphen, en-dash, em-dash, pipe, slash, bullet
  const parts = line.split(/\s*[-–—|/]\s*|,\s*(?=[A-Za-z])/).map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const isP0Title = JOB_TITLE_KEYWORDS.some(k => parts[0].toLowerCase().includes(k));
    const isP1Title = JOB_TITLE_KEYWORDS.some(k => parts[1].toLowerCase().includes(k));
    const isP0Company = COMPANY_SUFFIX_REGEX.test(parts[0]);
    const isP1Company = COMPANY_SUFFIX_REGEX.test(parts[1]);

    if (isP0Title && !isP1Title) {
      return { title: parts[0], company: cleanCompanyName(parts[1]) };
    } else if (!isP0Title && isP1Title) {
      return { title: parts[1], company: cleanCompanyName(parts[0]) };
    } else if (isP1Company && !isP0Company) {
      return { title: parts[0], company: cleanCompanyName(parts[1]) };
    } else if (isP0Company && !isP1Company) {
      return { title: parts[1], company: cleanCompanyName(parts[0]) };
    } else {
      return { title: parts[0], company: cleanCompanyName(parts[1]) };
    }
  }

  return null;
}

function extractEducation(
  sectionText: string,
  fullText: string,
  allLines: string[],
  logs: ExtractionLogEntry[]
): ExtractedEducation[] {
  const rawLines = sectionText ? sectionText.split("\n").map(l => l.trim()).filter(Boolean) : allLines;
  const items: ExtractedEducation[] = [];

  const schoolPattern = /\b(?:university|college|institute|polytechnic|school|academy|iit|nit|bits|campus|faculty)\b/i;
  const dateRegex = /\b(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*)?(?:19\d{2}|20\d{2})\b/i;
  const dateRegexGlobal = new RegExp(dateRegex.source, "gi");
  const linesToScan = separateLocations(
    rawLines.map(l => (schoolPattern.test(l) ? l : "")),
    dateRegex,
    logs,
    "institution",
  ).lines.map((l, idx) => l || rawLines[idx]);
  const gpaRegex = /\b(?:gpa|cgpa):?\s*([0-9]\.\d{1,2}(?:\s*\/\s*(?:4|10)(?:\.0)?)?)/i;

  let currentSchool = "";
  let currentDegree = "";
  let currentMajor = "";
  let currentGrad = "";
  let currentGpa = "";

  for (let i = 0; i < linesToScan.length; i++) {
    const line = linesToScan[i];

    // Check GPA
    const gpaMatch = line.match(gpaRegex);
    if (gpaMatch) {
      currentGpa = gpaMatch[1];
    }

    // Check School
    if (schoolPattern.test(line) && line.length < 100 && !line.toLowerCase().startsWith("high school")) {
      if (currentSchool && (currentDegree || currentMajor || currentGrad)) {
        const item: ExtractedEducation = {
          school: currentSchool,
          degree: currentDegree || "Bachelor’s",
          major: currentMajor,
          graduationDate: currentGrad,
          gpa: currentGpa,
        };
        items.push(item);
        logs.push({
          category: "institution",
          message: `Institution detected: "${item.school}" (${item.degree} in ${item.major || "degree"})`,
          sourceLine: line,
        });

        currentDegree = "";
        currentMajor = "";
        currentGrad = "";
        currentGpa = "";
      }
      currentSchool = line.replace(/,\s*[A-Z]{2}.*$/, "").replace(/[|•].*$/, "").trim();
      logs.push({ category: "institution", message: `Institution name parsed: "${currentSchool}"`, sourceLine: line });
    }

    // Check Degree
    for (const d of DEGREE_PATTERNS) {
      if (d.pattern.test(line)) {
        if (!currentDegree) currentDegree = d.label;
        break;
      }
    }

    // Check Major
    for (const m of COMMON_MAJORS) {
      if (new RegExp(`\\b${m}\\b`, "i").test(line)) {
        if (!currentMajor) currentMajor = m;
        break;
      }
    }

    // Check Graduation Date
    const dateMatch = line.match(dateRegex);
    if (dateMatch && (/\b(?:grad|class|expected|batch|\d{4})\b/i.test(line))) {
      const dates = line.match(dateRegexGlobal) ?? [dateMatch[0]];
      if (!currentGrad) currentGrad = /present|current/i.test(line) ? "Present" : dates[dates.length - 1];
    }
  }

  if (currentSchool || currentDegree || currentMajor) {
    const item: ExtractedEducation = {
      school: currentSchool || "University",
      degree: currentDegree || "Bachelor’s",
      major: currentMajor,
      graduationDate: currentGrad,
      gpa: currentGpa,
    };
    items.push(item);
    logs.push({
      category: "institution",
      message: `Institution detected: "${item.school}" (${item.degree} in ${item.major || "degree"})`,
    });
  }

  // Fallback if no school extracted
  if (items.length === 0 && checkHasEducationKeywords(fullText)) {
    let fallbackDegree = "";
    for (const d of DEGREE_PATTERNS) {
      if (d.pattern.test(fullText)) {
        fallbackDegree = d.label;
        break;
      }
    }

    let fallbackSchool = "";
    for (const line of allLines) {
      if (schoolPattern.test(line) && line.length < 90) {
        fallbackSchool = line.replace(/[|•].*$/, "").trim();
        break;
      }
    }

    let fallbackMajor = "";
    for (const m of COMMON_MAJORS) {
      if (new RegExp(`\\b${m}\\b`, "i").test(fullText)) {
        fallbackMajor = m;
        break;
      }
    }

    if (fallbackSchool || fallbackDegree || fallbackMajor) {
      const item: ExtractedEducation = {
        school: fallbackSchool || "University",
        degree: fallbackDegree || "Bachelor’s",
        major: fallbackMajor,
        graduationDate: "",
      };
      items.push(item);
      logs.push({
        category: "institution",
        message: `Fallback institution detected: "${item.school}" (${item.degree})`,
      });
    }
  }

  return items;
}

function extractExperience(
  sectionText: string,
  fullText: string,
  allLines: string[],
  logs: ExtractionLogEntry[]
): ExtractedExperience[] {
  const rawLines = sectionText ? sectionText.split("\n").map(l => l.trim()).filter(Boolean) : allLines;
  const items: ExtractedExperience[] = [];

  const dateRangeRegex = /\b(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*)?(?:\d{1,2}\/)?(19\d{2}|20\d{2})\s*(?:-|–|—|to)\s*(?:present|current|now|(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*)?(?:\d{1,2}\/)?(19\d{2}|20\d{2}))\b/i;
  const { lines: linesToScan, locations: lineLocations } = separateLocations(rawLines, dateRangeRegex, logs, "company");

  const cleanTitle = (value: string) =>
    value.replace(/^[-–—|•·,/.\s]+|[-–—|•·,/.\s]+$/g, "").trim();

  const isTitleLine = (line: string) =>
    !!line && JOB_TITLE_KEYWORDS.some(k => line.toLowerCase().includes(k));

  // Employer names are short and capitalized ("Stripe", "Bank of America"); sentence-case prose
  // such as "Built payment APIs" is kept as a highlight instead.
  const isNameCased = (line: string) => {
    const words = line.split(/\s+/);
    return words.length <= 8 && !/[!?;:]$/.test(line) && !/[a-z]{3,}\.$/.test(line) &&
      words.every(w => /^[A-Z0-9&(]/.test(w) || /^(?:of|and|the|for|de|la|at|in|&)$/.test(w));
  };

  const looksLikeCompanyLine = (line: string, idx: number) =>
    !!line &&
    line.length > 1 &&
    line.length < 80 &&
    !/^[-•*·–—]/.test(line) &&
    !dateRangeRegex.test(line) &&
    !/(19|20)\d{2}/.test(line) &&
    !isTitleLine(line) &&
    (COMPANY_SUFFIX_REGEX.test(line) || !!lineLocations[idx] || isNameCased(line));

  const SELF_EMPLOYED = /\b(?:independent|freelance|self[- ]employed|contractor|founder)\b/i;

  let currentItem: ExtractedExperience | null = null;
  let lastCompany = "";
  let lastCompanyWasHeading = false;
  const consumedIndices = new Set<number>();
  const rawBullets = new WeakSet<ExtractedExperience>();
  let lastLineWasHighlight = false;
  let currentCompanyWasHeading = false;

  for (let i = 0; i < linesToScan.length; i++) {
    if (consumedIndices.has(i)) continue;
    const line = linesToScan[i];
    const dateMatch = line.match(dateRangeRegex);

    if (dateMatch) {
      if (currentItem && (currentItem.title || currentItem.company)) {
        items.push(currentItem);
        if (currentItem.company && currentItem.company !== "Company") {
          lastCompany = currentItem.company;
          lastCompanyWasHeading = currentCompanyWasHeading;
        }
        logs.push({
          category: "company",
          message: `Company & role finalized: "${currentItem.company}" — "${currentItem.title}" (${currentItem.dateRange})`,
        });
      }

      const dateRange = dateMatch[0];
      const isCurrent = /present|current|now/i.test(dateRange);

      let title = "";
      let company = "";

      const sameLineWithoutDate = line.replace(dateMatch[0], "").trim();
      // Earlier lines with their own date range belong to the previous role.
      const prevLine1 = i > 0 && !consumedIndices.has(i - 1) && !dateRangeRegex.test(linesToScan[i - 1]) ? linesToScan[i - 1].trim() : "";
      const prevLine2 = prevLine1 && i > 1 && !consumedIndices.has(i - 2) && !dateRangeRegex.test(linesToScan[i - 2]) ? linesToScan[i - 2].trim() : "";
      const nextLine1 = i + 1 < linesToScan.length ? linesToScan[i + 1].trim() : "";
      const nextLine2 = i + 2 < linesToScan.length ? linesToScan[i + 2].trim() : "";

      // Check if title and company are on the same line
      if (sameLineWithoutDate.length > 3) {
        const split = splitTitleAndCompany(sameLineWithoutDate);
        if (split) {
          title = split.title;
          company = split.company;
        } else if (JOB_TITLE_KEYWORDS.some(k => sameLineWithoutDate.toLowerCase().includes(k))) {
          title = sameLineWithoutDate;
          if (prevLine1 && !prevLine1.match(dateRangeRegex) && prevLine1.length < 60 && !/^[-•*·]/.test(prevLine1)) {
            company = cleanCompanyName(prevLine1);
          }
        } else {
          company = cleanCompanyName(sameLineWithoutDate);
          if (prevLine1 && JOB_TITLE_KEYWORDS.some(k => prevLine1.toLowerCase().includes(k))) {
            title = prevLine1;
          } else if (nextLine1 && JOB_TITLE_KEYWORDS.some(k => nextLine1.toLowerCase().includes(k))) {
            title = nextLine1;
          }
        }
      }

      // Check previous lines if still unresolved
      if (!title || !company) {
        // Try splitTitleAndCompany on prevLine1
        if (prevLine1 && !prevLine1.match(dateRangeRegex) && !/^[-•*·]/.test(prevLine1)) {
          const split = splitTitleAndCompany(prevLine1);
          if (split) {
            title = split.title;
            company = split.company;
          }
        }
      }

      if (!title || !company) {
        const isPrev1Title = prevLine1 && !/^[-•*·–—]/.test(prevLine1) && JOB_TITLE_KEYWORDS.some(k => prevLine1.toLowerCase().includes(k));
        const isPrev2Title = prev2Title(prevLine2);

        if (isPrev1Title) {
          title = prevLine1;
          if (prevLine2 && !prevLine2.match(dateRangeRegex) && prevLine2.length < 60 && !/^[-•*·]/.test(prevLine2)) {
            company = cleanCompanyName(prevLine2);
          }
        } else if (isPrev2Title && prevLine1 && !/^[-•*·]/.test(prevLine1) && prevLine1.length < 60) {
          company = cleanCompanyName(prevLine1);
          title = prevLine2;
        } else if (prevLine1 && !/^[-•*·]/.test(prevLine1) && prevLine1.length < 60) {
          company = cleanCompanyName(prevLine1);
          title = prevLine2 && JOB_TITLE_KEYWORDS.some(k => prevLine2.toLowerCase().includes(k)) ? prevLine2 : "Role";
        }
      }

      if (!company) {
        // Look for any line with company indicators nearby
        for (const [candidate, idx] of [[prevLine1, i - 1], [prevLine2, i - 2], [nextLine1, i + 1]] as const) {
          if (candidate && COMPANY_SUFFIX_REGEX.test(candidate) && !JOB_TITLE_KEYWORDS.some(k => candidate.toLowerCase().includes(k))) {
            company = cleanCompanyName(candidate);
            if (idx === i + 1) consumedIndices.add(idx);
            break;
          }
        }
      }

      // Date-only line: title and/or company may sit on the following lines
      if (!title && isTitleLine(nextLine1) && !dateRangeRegex.test(nextLine1)) {
        title = nextLine1;
        consumedIndices.add(i + 1);
      }
      if (!company && !consumedIndices.has(i + 1) && looksLikeCompanyLine(nextLine1, i + 1)) {
        company = cleanCompanyName(nextLine1);
        consumedIndices.add(i + 1);
      }
      if (!company && consumedIndices.has(i + 1) && looksLikeCompanyLine(nextLine2, i + 2)) {
        company = cleanCompanyName(nextLine2);
        consumedIndices.add(i + 2);
      }

      if (!company && lastCompany && lastCompanyWasHeading && !SELF_EMPLOYED.test(title)) {
        // Roles grouped under one employer heading omit the repeated company line
        company = lastCompany;
        logs.push({
          category: "company",
          message: `No company line found near "${title || "role"}"; reused previous employer "${lastCompany}".`,
          sourceLine: line,
        });
      }

      currentCompanyWasHeading = !!company && [prevLine1, prevLine2].some(l => l && !dateRangeRegex.test(l) && cleanCompanyName(l) === company);
      if (!currentCompanyWasHeading && company && company === lastCompany) currentCompanyWasHeading = lastCompanyWasHeading;

      const locationIndex = [i, i + 1, i + 2, i - 1, i - 2].find(idx =>
        idx >= 0 && lineLocations[idx] && (idx >= i ? idx === i || consumedIndices.has(idx) : !consumedIndices.has(idx)),
      );

      currentItem = {
        title: cleanTitle(title) || "Role",
        company: company || "Company",
        dateRange,
        location: locationIndex !== undefined ? lineLocations[locationIndex] : undefined,
        isCurrent,
        highlights: [],
      };

      logs.push({
        category: "company",
        message: `Extracted company: "${currentItem.company}" with title: "${currentItem.title}"`,
        sourceLine: line,
      });

      continue;
    }

    if (currentItem && currentItem.company === "Company" && currentItem.highlights.length === 0 && looksLikeCompanyLine(line, i)) {
      currentItem.company = cleanCompanyName(line);
      if (!currentItem.location && lineLocations[i]) currentItem.location = lineLocations[i];
      logs.push({ category: "company", message: `Employer line found below the role: "${currentItem.company}"`, sourceLine: line });
      continue;
    }

    if (currentItem && !currentItem.location && currentItem.highlights.length === 0 &&
        isPureLocation(line)) {
      currentItem.location = line;
      continue;
    }

    // An employer heading directly above the next dated role is not a highlight of this one
    const nextHasDate = [i + 1, i + 2].some(idx => idx < linesToScan.length && dateRangeRegex.test(linesToScan[idx]));
    if (currentItem && nextHasDate && looksLikeCompanyLine(line, i) && !isTitleLine(line)) {
      continue;
    }

    if (currentItem) {
      const hasMarker = /^[-•*·–—]\s*/.test(line);
      const previous = currentItem.highlights[currentItem.highlights.length - 1];
      // PDF text wraps long bullets; an unmarked line continuing a sentence belongs to the bullet above.
      if (!hasMarker && previous && rawBullets.has(currentItem) && lastLineWasHighlight && (/^[a-z0-9(]/.test(line) || !/[.!?]$/.test(previous))) {
        currentItem.highlights[currentItem.highlights.length - 1] = `${previous} ${line}`;
        continue;
      }
      const isBullet = hasMarker || (line.length > 25 && !dateRangeRegex.test(line));
      if (hasMarker) rawBullets.add(currentItem);
      lastLineWasHighlight = isBullet && currentItem.highlights.length < 6;
      if (isBullet && currentItem.highlights.length < 6) {
        currentItem.highlights.push(line.replace(/^[-•*·–—]\s*/, "").trim());
      }
    }
  }

  if (currentItem && (currentItem.title || currentItem.company)) {
    items.push(currentItem);
    logs.push({
      category: "company",
      message: `Company & role finalized: "${currentItem.company}" — "${currentItem.title}" (${currentItem.dateRange})`,
    });
  }

  // Fallback if no date ranges were matched
  if (items.length === 0 && checkHasExperienceKeywords(fullText)) {
    for (const line of allLines) {
      if (JOB_TITLE_KEYWORDS.some(w => line.toLowerCase().includes(w)) && line.length < 70) {
        const split = splitTitleAndCompany(line);
        if (split) {
          items.push({
            title: split.title,
            company: split.company,
            dateRange: "",
            isCurrent: true,
            highlights: [],
          });
          logs.push({ category: "company", message: `Fallback company extracted: "${split.company}" for role "${split.title}"`, sourceLine: line });
        }
        if (items.length >= 3) break;
      }
    }
  }

  return items;
}

function prev2Title(line: string): boolean {
  return !!line && JOB_TITLE_KEYWORDS.some(k => line.toLowerCase().includes(k));
}

function estimateYearsExperience(fullText: string, experience: ExtractedExperience[]): string {
  const explicit = fullText.match(/(\d{1,2})\+?\s*years?(?:\s+of)?\s+experience/i);
  if (explicit) {
    return explicit[1];
  }

  const years: number[] = [];
  const yearMatches = fullText.matchAll(/\b(19[89]\d|20[0-2]\d)\b/g);
  for (const match of yearMatches) {
    years.push(parseInt(match[1], 10));
  }

  if (years.length >= 2) {
    const minYear = Math.min(...years);
    const maxYear = new Date().getFullYear();
    const span = maxYear - minYear;
    if (span >= 0 && span <= 45) {
      return String(span);
    }
  }

  if (experience.length > 0) {
    return String(Math.max(1, experience.length * 2));
  }

  return "0";
}
