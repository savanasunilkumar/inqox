import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceSignIn, verifySignInCode, resendSignInCode, checkAuthResult } from '../lib/custom-auth-flow.ts';

function flow(status, first = [], second = []) {
  const calls = [];
  const ok = async (name) => { calls.push(name); return { error: null }; };
  const resource = {
    status, supportedFirstFactors: first.map(strategy => ({ strategy })),
    supportedSecondFactors: second.map(strategy => ({ strategy })),
    finalize: async ({ navigate }) => { calls.push('finalize'); await navigate({ session: { currentTask: null }, decorateUrl: url => url }); return { error: null }; },
    emailCode: { sendCode: () => ok('send-first-email'), verifyCode: () => ok('verify-first-email') },
    mfa: { sendEmailCode: () => ok('send-mfa-email'), sendPhoneCode: () => ok('send-mfa-phone'), verifyEmailCode: () => ok('verify-mfa-email'), verifyPhoneCode: () => ok('verify-mfa-phone'), verifyTOTP: () => ok('verify-totp'), verifyBackupCode: () => ok('verify-backup') },
    resetPasswordEmailCode: { sendCode: () => ok('send-reset'), verifyCode: async () => { calls.push('verify-reset'); resource.status = 'needs_new_password'; return { error: null }; } },
  };
  return { resource, calls };
}
const noNavigation = () => { throw new Error('Must not navigate before verification'); };
test('password accounts remain at password without creating a session', async () => {
  const { resource, calls } = flow('needs_first_factor', ['password']);
  assert.equal(await advanceSignIn(resource, noNavigation), 'password');
  assert.deepEqual(calls, []);
});
test('passwordless accounts request their configured email factor', async () => {
  const { resource, calls } = flow('needs_first_factor', ['email_code']);
  assert.equal(await advanceSignIn(resource, noNavigation), 'email-code');
  assert.deepEqual(calls, ['send-first-email']);
});
test('device trust requires the second factor instead of finalizing after a password', async () => {
  const { resource, calls } = flow('needs_client_trust', [], ['email_code']);
  assert.equal(await advanceSignIn(resource, noNavigation), 'mfa-email');
  assert.deepEqual(calls, ['send-mfa-email']);
});
test('TOTP and backup factors require verification without sending an unrelated code', async () => {
  for (const [strategy, step] of [['totp', 'mfa-totp'], ['backup_code', 'mfa-backup']]) {
    const { resource, calls } = flow('needs_second_factor', [], [strategy]);
    assert.equal(await advanceSignIn(resource, noNavigation), step);
    assert.deepEqual(calls, []);
  }
});
test('invalid verification code never finalizes or navigates', async () => {
  const { resource, calls } = flow('needs_client_trust', [], ['email_code']);
  resource.mfa.verifyEmailCode = async () => ({ error: { message: 'Incorrect code' } });
  await assert.rejects(verifySignInCode(resource, 'mfa-email', '000000', noNavigation), /Incorrect code/);
  assert.deepEqual(calls, []);
});
test('verified codes finalize only once Clerk reports complete', async () => {
  const { resource, calls } = flow('needs_client_trust', [], ['email_code']);
  resource.mfa.verifyEmailCode = async () => { resource.status = 'complete'; return { error: null }; };
  let navigated = false;
  assert.equal(await verifySignInCode(resource, 'mfa-email', '123456', () => { navigated = true; }), 'complete');
  assert.equal(navigated, true); assert.deepEqual(calls, ['finalize']);
});
test('password reset verification requires a new password before session creation', async () => {
  const { resource, calls } = flow('needs_first_factor');
  assert.equal(await verifySignInCode(resource, 'reset-code', '123456', noNavigation), 'new-password');
  assert.deepEqual(calls, ['verify-reset']);
});
test('resending an MFA code preserves its factor', async () => {
  const { resource, calls } = flow('needs_second_factor', [], ['phone_code']);
  await resendSignInCode(resource, 'mfa-phone'); assert.deepEqual(calls, ['send-mfa-phone']);
});
test('unsupported verification and security challenges fail closed', async () => {
  for (const status of ['needs_protect_check', 'needs_second_factor']) {
    const { resource, calls } = flow(status);
    await assert.rejects(advanceSignIn(resource, noNavigation)); assert.deepEqual(calls, []);
  }
});
test('Clerk errors are shown and successful results pass', () => {
  assert.throws(() => checkAuthResult({ error: { errors: [{ longMessage: 'Please check your code.' }] } }), /Please check your code/);
  assert.doesNotThrow(() => checkAuthResult({ error: null }));
});
