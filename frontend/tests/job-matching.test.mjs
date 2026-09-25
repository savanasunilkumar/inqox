import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateFromProfile, parseYears } from '../lib/job-matching.ts';

const base = {
  fields: {
    currentTitle: 'Software Engineer',
    yearsExperience: '3 years',
    workCountry: 'United States',
    sponsorshipNow: 'No',
    sponsorshipFuture: 'Yes',
    workPreference: 'Hybrid',
  },
  customAnswers: [],
  experienceHistory: [
    { company: 'Stripe', title: 'Software Engineer', dateRange: '2022 - Present', highlights: ['Built APIs in Go and PostgreSQL'] },
    { company: 'Iowa State', title: 'Graduate Research Assistant', dateRange: '2020 - 2022', highlights: [] },
  ],
  resume: { name: 'r.pdf', size: 1, uploadedAt: '', key: 'k', text: 'Python, React' },
  updatedAt: null,
};

test('candidateFromProfile collects unique titles, résumé text and eligibility', () => {
  const candidate = candidateFromProfile(base);
  assert.deepEqual(candidate.titles, ['Software Engineer', 'Graduate Research Assistant']);
  assert.match(candidate.text, /Python, React/);
  assert.match(candidate.text, /Go and PostgreSQL/);
  assert.equal(candidate.yearsExperience, 3);
  assert.equal(candidate.workCountry, 'United States');
  assert.equal(candidate.needsSponsorship, true);
  assert.equal(candidate.remoteOnly, false);
});

test('candidateFromProfile tolerates a sparse profile', () => {
  const candidate = candidateFromProfile({ fields: { workPreference: 'Remote' }, customAnswers: [], resume: null, updatedAt: null });
  assert.deepEqual(candidate.titles, []);
  assert.equal(candidate.yearsExperience, null);
  assert.equal(candidate.workCountry, null);
  assert.equal(candidate.remoteOnly, true);
});

test('parseYears reads the first number', () => {
  assert.equal(parseYears('5+'), 5);
  assert.equal(parseYears('1.5 years'), 1.5);
  assert.equal(parseYears('none'), null);
});
