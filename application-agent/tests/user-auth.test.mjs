import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportSPKI, SignJWT } from 'jose';
import { createClerkClient } from '@clerk/backend';
import { authenticateUser } from '../src/user-auth.ts';
import { importLegacyProfile } from '../src/legacy-profile.ts';

const { privateKey, publicKey } = await generateKeyPair('RS256');
const env = {
  CLERK_SECRET_KEY: 'sk_test_unit',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_' + Buffer.from('test.clerk.accounts.dev$').toString('base64'),
  CLERK_AUTHORIZED_PARTIES: 'http://127.0.0.1:3000',
};
const client = createClerkClient({ secretKey: env.CLERK_SECRET_KEY, publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, jwtKey: await exportSPKI(publicKey), telemetry: { disabled: true } });
async function token(overrides = {}, key = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ iss: 'https://test.clerk.accounts.dev', sub: 'user_Alice', sid: 'sess_Alice', azp: 'http://127.0.0.1:3000', iat: now, nbf: now - 1, exp: now + 60, v: 2, ...overrides }).setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'unit' }).sign(key);
}
function request(value, extra = {}) {
  return new Request('https://agent.example/profile', { headers: { ...(value ? { 'X-Clerk-Session-Token': value } : {}), ...extra } });
}
test('valid signed sessions get distinct stable owner namespaces', async () => {
  const alice = await authenticateUser(request(await token(), { 'X-User-ID': 'user_Bob', 'X-Owner': 'private-owner' }), env, client);
  const bob = await authenticateUser(request(await token({ sub: 'user_Bob', sid: 'sess_Bob' })), env, client);
  assert.equal(alice.userId, 'user_Alice');
  assert.notEqual(alice.owner, bob.owner);
  assert.notEqual(alice.owner, 'private-owner');
  assert.equal(alice.owner, (await authenticateUser(request(await token()), env, client)).owner);
});
for (const [name, claims] of Object.entries({ expired: { exp: 1 }, future: { nbf: 9999999999 }, wrongOrigin: { azp: 'https://attacker.example' }, missingOrigin: { azp: undefined }, wrongIssuer: { iss: 'https://attacker.example' }, missingSession: { sid: undefined }, pending: { sts: 'pending' }, unsafeUserId: { sub: '../private-owner' } })) {
  test(`rejects ${name} session`, async () => assert.equal(await authenticateUser(request(await token(claims)), env, client), null));
}
test('rejects missing, malformed and forged credentials', async () => {
  assert.equal(await authenticateUser(request(), env, client), null);
  assert.equal(await authenticateUser(request('invalid'), env, client), null);
  const other = await generateKeyPair('RS256');
  assert.equal(await authenticateUser(request(await token({}, other.privateKey)), env, client), null);
});

class Bucket {
  data = new Map();
  async head(key) { return this.data.has(key) ? {} : null; }
  async get(key) {
    if (!this.data.has(key)) return null;
    const value = this.data.get(key);
    return { json: async () => JSON.parse(value), body: value };
  }
  async put(key, value, options = {}) {
    if (options.onlyIf && this.data.has(key)) return null;
    this.data.set(key, value); return {};
  }
}
function migrationSetup(email = 'owner@example.com', status = 'verified') {
  const bucket = new Bucket();
  bucket.data.set('private-owner/profile.json', JSON.stringify({ fields: { email: 'owner@example.com', firstName: 'Original' }, customAnswers: [], resume: { key: 'private-owner/resumes/original.pdf', name: 'resume.pdf' } }));
  bucket.data.set('private-owner/resumes/original.pdf', '%PDF-backup');
  return { bucket, clerk: { users: { getUser: async () => ({ emailAddresses: [{ emailAddress: email, verification: { status } }] }) } } };
}
test('legacy profile only imports for matching verified email, preserving backup', async () => {
  for (const [email, status] of [['someone@example.com', 'verified'], ['owner@example.com', 'unverified']]) {
    const { bucket, clerk } = migrationSetup(email, status);
    await importLegacyProfile(bucket, 'clerk-owner', 'user_Alice', clerk);
    assert.equal(await bucket.head('clerk-owner/profile.json'), null);
    assert.equal(await bucket.head('private-owner/clerk-owner.json'), null);
  }
  const { bucket, clerk } = migrationSetup();
  await Promise.all([importLegacyProfile(bucket, 'clerk-owner', 'user_Alice', clerk), importLegacyProfile(bucket, 'clerk-owner', 'user_Alice', clerk)]);
  const migrated = await (await bucket.get('clerk-owner/profile.json')).json();
  assert.equal(migrated.resume.key, 'clerk-owner/resumes/imported-legacy.pdf');
  assert.ok(await bucket.head(migrated.resume.key));
  assert.ok(await bucket.head('private-owner/resumes/original.pdf'));
  assert.ok(await bucket.head('private-owner/profile.json'));
});
test('legacy import never replaces an existing user profile or another owner claim', async () => {
  const { bucket, clerk } = migrationSetup();
  await bucket.put('clerk-owner/profile.json', '{"fields":{"firstName":"Edited"}}');
  await importLegacyProfile(bucket, 'clerk-owner', 'user_Alice', clerk);
  assert.equal((await (await bucket.get('clerk-owner/profile.json')).json()).fields.firstName, 'Edited');
  await bucket.put('private-owner/clerk-owner.json', '{"owner":"someone-else"}');
  await importLegacyProfile(bucket, 'clerk-other', 'user_Bob', clerk);
  assert.equal(await bucket.head('clerk-other/profile.json'), null);
});
