import test from "node:test";
import assert from "node:assert/strict";
import { extractFromResumeText } from "../lib/resume-extractor.ts";

test("extracts both education and experience when present", () => {
  const sampleResume = `
John Doe
john.doe@example.com | (555) 123-4567 | San Francisco, CA
https://linkedin.com/in/johndoe | https://github.com/johndoe

PROFESSIONAL EXPERIENCE
Senior Software Engineer - Acme Corp
2021 - Present
• Designed scalable microservices in TypeScript and Node.js
• Led a team of 4 frontend engineers building React web apps

Software Engineer - TechStartup Inc
2018 - 2021
• Built real-time dashboard analytics with PostgreSQL and Redis
• Optimized database queries improving latency by 35%

EDUCATION
University of California, Berkeley
Bachelor of Science in Computer Science
Graduated: May 2018
GPA: 3.8 / 4.0
`;

  const result = extractFromResumeText(sampleResume);

  assert.equal(result.hasEducation, true, "Education should be detected");
  assert.equal(result.hasExperience, true, "Experience should be detected");
  assert.equal(result.contact.firstName, "John");
  assert.equal(result.contact.lastName, "Doe");
  assert.equal(result.contact.email, "john.doe@example.com");
  assert.equal(result.contact.linkedIn, "https://linkedin.com/in/johndoe");
  assert.equal(result.contact.github, "https://github.com/johndoe");

  assert.ok(result.education.length >= 1, "Should have at least 1 education item");
  assert.match(result.education[0].school, /Berkeley/i);
  assert.equal(result.education[0].degree, "Bachelor’s");
  assert.equal(result.education[0].major, "Computer Science");

  assert.ok(result.experience.length >= 1, "Should have experience items");
  assert.equal(result.summary.currentTitle, "Senior Software Engineer");
  assert.equal(result.summary.currentCompany, "Acme Corp");
  assert.ok(Number(result.summary.yearsExperience) > 0);
});

test("detects when education is missing", () => {
  const experienceOnly = `
Jane Smith
jane@company.com | 415-999-0000

EXPERIENCE
Lead Product Designer
DesignStudio LLC
2020 - Present
• Crafted complete design system and user flows
`;

  const result = extractFromResumeText(experienceOnly);
  assert.equal(result.hasExperience, true);
  assert.equal(result.hasEducation, false);
  assert.equal(result.education.length, 0);
});

test("detects when experience is missing (e.g. fresh graduate)", () => {
  const educationOnly = `
Alex Rivera
alex@university.edu

EDUCATION
Stanford University
Master of Science in Artificial Intelligence
Expected: 2026
GPA: 3.9

ACADEMIC PROJECTS
• Built transformer neural net from scratch
`;

  const result = extractFromResumeText(educationOnly);
  assert.equal(result.hasEducation, true);
  assert.equal(result.hasExperience, false);
  assert.match(result.education[0].school, /Stanford/i);
  assert.equal(result.education[0].degree, "Master’s");
});

test("extracts company on the line after title + dates", () => {
  const resume = `
John Doe
john@x.com

EXPERIENCE
Software Engineer | Jan 2020 - Present
Stripe
• Built payments infra

Senior Developer | 2018 - 2020
Datadog
• Monitoring tools
`;

  const result = extractFromResumeText(resume);

  assert.equal(result.experience.length, 2);
  assert.equal(result.experience[0].title, "Software Engineer");
  assert.equal(result.experience[0].company, "Stripe");
  assert.equal(result.experience[1].company, "Datadog");
  assert.equal(result.summary.currentCompany, "Stripe");
});

test("reuses the employer for consecutive roles at the same company", () => {
  const resume = `
Jane Doe
jane@x.com

EXPERIENCE
Stripe
Software Engineer | 2022 - Present
• Built payments
Software Engineer Intern | Jun 2020 - Sep 2020
• Internship work
`;

  const result = extractFromResumeText(resume);

  assert.equal(result.experience.length, 2);
  assert.equal(result.experience[0].company, "Stripe");
  assert.equal(result.experience[1].company, "Stripe");
});

test("strips city and workplace markers from company names", () => {
  const resume = `
Sam Roe
sam@x.com

EXPERIENCE
Vercel, San Francisco
Frontend Engineer
Mar 2021 - Present
• Web apps

Acme Corp - Remote
Backend Engineer | 2019 - 2021
• APIs
`;

  const result = extractFromResumeText(resume);

  assert.equal(result.experience.length, 2);
  assert.equal(result.experience[0].company, "Vercel");
  assert.equal(result.experience[1].company, "Acme Corp");
});

test("resolves title and company on lines after a date-only line", () => {
  const resume = `
Kai Zen
kai@x.com

EXPERIENCE
Jan 2021 - Present
Software Engineer
Stripe
• Built things
`;

  const result = extractFromResumeText(resume);

  assert.equal(result.experience.length, 1);
  assert.equal(result.experience[0].title, "Software Engineer");
  assert.equal(result.experience[0].company, "Stripe");
});

test("detects an internships section as experience", () => {
  const resume = `
Rae Io
rae@x.com

INTERNSHIPS
Software Engineer Intern | May 2023 - Aug 2023
Nvidia
• GPU kernels
`;

  const result = extractFromResumeText(resume);

  assert.equal(result.hasExperience, true);
  assert.equal(result.experience[0].company, "Nvidia");
});

test("handles empty or blank text gracefully", () => {
  const result = extractFromResumeText("");
  assert.equal(result.hasEducation, false);
  assert.equal(result.hasExperience, false);
  assert.equal(result.education.length, 0);
  assert.equal(result.experience.length, 0);
});

test("separates right-aligned locations joined onto employer and school lines", () => {
  const resume = `
Sam Lee
sam@x.com

EXPERIENCE
Stripe San Francisco, CA
Software Engineer Jan 2022 - Present
• Built payments infrastructure
Tata Consultancy Services | Hyderabad, India Jun 2018 - Jul 2020
Systems Engineer
• Maintained banking apps
Palo Alto Networks Santa Clara, CA 2017 - 2018
Security Analyst
Google LLC, Mountain View, CA
Product Manager Intern May 2016 - Aug 2016

EDUCATION
Iowa State University Ames, IA
Master of Science in Computer Science Aug 2020 - May 2022
`;

  const result = extractFromResumeText(resume);
  const roles = result.experience.map(e => [e.company, e.title, e.location]);

  assert.deepEqual(roles, [
    ["Stripe", "Software Engineer", "San Francisco, CA"],
    ["Tata Consultancy Services", "Systems Engineer", "Hyderabad, India"],
    ["Palo Alto Networks", "Security Analyst", "Santa Clara, CA"],
    ["Google LLC", "Product Manager Intern", "Mountain View, CA"],
  ]);
  assert.equal(result.education[0].school, "Iowa State University");
  assert.equal(result.education[0].graduationDate, "May 2022");
  assert.ok(result.logs.some(l => l.message.includes('Separated location "Santa Clara, CA"')));
});

test("keeps company names that end in a suffix or two-letter word", () => {
  const resume = `
EXPERIENCE
Software Engineer | Jan 2020 - Present
Acme, Co
• Built things
`;

  const result = extractFromResumeText(resume);
  assert.equal(result.experience[0].company, "Acme, Co");
});

test("ignores job-title keywords inside bullet points when locating the title", () => {
  const resume = `
EXPERIENCE
Data Analyst | Stripe | Jan 2021 - Present
• Mentored an intern on payments tooling
Backend Developer | Jan 2019 - Dec 2020
Square
`;

  const result = extractFromResumeText(resume);
  assert.equal(result.experience[1].title, "Backend Developer");
  assert.equal(result.experience[1].company, "Square");
});
