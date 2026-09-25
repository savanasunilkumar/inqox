import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) {
      try {
        return next(`${specifier}.ts`, context);
      } catch {
        return next(specifier, context);
      }
    }
    return next(specifier, context);
  },
});
const { profileRequest } = await import('../src/profile.ts');

function pdf(lines) {
  const escape = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const stream = `BT /F1 11 Tf 14 TL 50 760 Td ${lines.map((l) => `(${escape(l)}) '`).join(' ')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const offset = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

function bucket() {
  const store = new Map();
  return {
    store,
    async get(key) {
      if (!store.has(key)) return null;
      const value = store.get(key);
      return { json: async () => JSON.parse(value), body: value };
    },
    async put(key, value) {
      store.set(key, typeof value === 'string' ? value : new Uint8Array(value));
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

const call = (env, method, path, body, headers = {}) =>
  profileRequest(new Request(`https://agent.example${path}`, { method, body, headers }), env, 'owner-1');
const upload = (env, lines) => call(env, 'PUT', '/profile/resume', pdf(lines), { 'Content-Type': 'application/pdf', 'X-File-Name': 'resume.pdf' });

const first = [
  'Jane Doe',
  'jane@example.com | (515) 555-0100',
  'EXPERIENCE',
  'Software Engineer Jan 2022 - Dec 2023',
  'Stripe San Francisco, CA',
  '- Built payment APIs in Go',
  'EDUCATION',
  'Iowa State University Ames, IA',
  'Bachelor of Science in Computer Science Aug 2017 - May 2021',
];
const second = [
  'Jane Doe',
  'jane.doe@newmail.com | (515) 555-0100',
  'EXPERIENCE',
  'Senior Engineer Jan 2024 - Present',
  'Vercel San Francisco, CA',
  '- Led the edge runtime team',
  'EDUCATION',
  'Stanford University Stanford, CA',
  'Master of Science in Computer Science Aug 2021 - May 2023',
];

test('replacing a résumé refreshes experience, education and résumé fields', async () => {
  const env = { PROFILES: bucket() };
  const one = await (await upload(env, first)).json();
  assert.equal(one.experienceHistory[0].company, 'Stripe');
  assert.equal(one.educationHistory[0].school, 'Iowa State University');
  assert.equal(one.fields.email, 'jane@example.com');

  const saved = await call(env, 'PUT', '/profile', JSON.stringify({ fields: { ...one.fields, phone: '5155550199' }, customAnswers: [], experienceHistory: one.experienceHistory, educationHistory: one.educationHistory }));
  assert.equal(saved.status, 200);

  const two = await (await upload(env, second)).json();
  assert.deepEqual(two.experienceHistory.map((e) => e.company), ['Vercel']);
  assert.deepEqual(two.educationHistory.map((e) => e.school), ['Stanford University']);
  assert.equal(two.fields.email, 'jane.doe@newmail.com');
  assert.equal([...env.PROFILES.store.keys()].filter((k) => k.includes('/resumes/')).length, 1);
});

test('profile saves persist edited experience and education', async () => {
  const env = { PROFILES: bucket() };
  await upload(env, first);
  const experience = [{ company: 'Acme', title: 'Engineer', dateRange: '2020 - 2021', highlights: ['Shipped'], isCurrent: false }];
  const response = await call(env, 'PUT', '/profile', JSON.stringify({ fields: { firstName: 'Jane' }, experienceHistory: experience, educationHistory: [] }));
  assert.equal(response.status, 200);
  const stored = await (await call(env, 'GET', '/profile')).json();
  assert.deepEqual(stored.experienceHistory, experience);
  assert.deepEqual(stored.educationHistory, []);
});

test('malformed experience entries are rejected', async () => {
  const env = { PROFILES: bucket() };
  for (const experienceHistory of [[{ company: 'Acme' }], [{ company: 1, title: '', dateRange: '', highlights: [] }], ['text']]) {
    const response = await call(env, 'PUT', '/profile', JSON.stringify({ fields: {}, experienceHistory }));
    assert.equal(response.status, 400);
  }
});
