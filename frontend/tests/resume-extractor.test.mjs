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

test("handles empty or blank text gracefully", () => {
  const result = extractFromResumeText("");
  assert.equal(result.hasEducation, false);
  assert.equal(result.hasExperience, false);
  assert.equal(result.education.length, 0);
  assert.equal(result.experience.length, 0);
});
