import test from 'node:test';
import assert from 'node:assert/strict';
import { profileCompletion, profileRouteAllowed, requiredProfileFields } from '../frontend/lib/profile-completion.ts';
function completedProfile() {
  return {
    fields: { ...Object.fromEntries(requiredProfileFields.map(key => [key, 'Not applicable'])),
      email: 'candidate@example.com', yearsExperience: '0', availableDate: '2026-10-01',
      authorizedToWork: 'No', sponsorshipNow: 'Yes', sponsorshipFuture: 'Yes', relocation: 'No',
      workPreference: 'Flexible', salaryPeriod: 'Year' },
    resume: { key: 'test/resume.pdf', size: 100, text: 'Test résumé text' },
  };
}
test('new accounts stay locked with every required answer missing', () => {
  const status = profileCompletion(null);
  assert.equal(status.complete, false); assert.equal(status.completed, 0);
  assert.equal(status.missing.length, status.total);
});
test('No answers and zero experience count; optional disclosures and links can remain blank', () => {
  assert.equal(profileCompletion(completedProfile()).complete, true);
});
test('missing sponsorship, empty strings and malformed choices keep the workspace locked', () => {
  for (const [key, value] of [['sponsorshipNow', ''], ['firstName', '  '], ['authorizedToWork', 'maybe'], ['email', 'invalid'], ['yearsExperience', '-1'], ['availableDate', 'tomorrow']]) {
    const profile = completedProfile(); profile.fields[key] = value;
    const status = profileCompletion(profile);
    assert.equal(status.complete, false); assert.ok(status.missing.includes(key));
  }
});
test('removing a résumé relocks a completed profile', () => {
  const profile = completedProfile(); profile.resume = null;
  assert.deepEqual(profileCompletion(profile).missing, ['resume']);
});
test('a client supplied completion flag cannot unlock missing saved data', () => {
  assert.equal(profileCompletion({ fields: {}, resume: null, complete: true }).complete, false);
});
test('only Profile and Settings remain reachable before completion, including direct URLs', () => {
  for (const path of ['/dashboard', '/job-board', '/inbox', '/tracker', '/application', '/job-board/saved', '/settings/anything']) {
    assert.equal(profileRouteAllowed(path, false), false);
    assert.equal(profileRouteAllowed(path, true), true);
  }
  assert.equal(profileRouteAllowed('/profile', false), true);
  assert.equal(profileRouteAllowed('/settings', false), true);
});
