import test from 'node:test';
import assert from 'node:assert/strict';
import { hasJobBoardPreviewAccess, isJobBoardRoute } from '../lib/job-board-access.ts';

test('hasJobBoardPreviewAccess grants access to savanasuneelkumar@gmail.com by string', () => {
  assert.equal(hasJobBoardPreviewAccess('savanasuneelkumar@gmail.com'), true);
  assert.equal(hasJobBoardPreviewAccess('SAVANASUNEELKUMAR@GMAIL.COM'), true);
  assert.equal(hasJobBoardPreviewAccess('  savanasuneelkumar@gmail.com  '), true);
});

test('hasJobBoardPreviewAccess grants access to owner account ID', () => {
  assert.equal(hasJobBoardPreviewAccess('user_3JkI1R3z4G6TD1RBfvl6tqJTHkg'), true);
});

test('hasJobBoardPreviewAccess grants access via Clerk User object', () => {
  assert.equal(
    hasJobBoardPreviewAccess({
      id: 'user_random123',
      primaryEmailAddress: { emailAddress: 'savanasuneelkumar@gmail.com' },
    }),
    true
  );

  assert.equal(
    hasJobBoardPreviewAccess({
      id: 'user_random123',
      primaryEmailAddress: null,
      emailAddresses: [{ emailAddress: 'savanasuneelkumar@gmail.com' }],
    }),
    true
  );

  assert.equal(
    hasJobBoardPreviewAccess({
      id: 'user_3JkI1R3z4G6TD1RBfvl6tqJTHkg',
      primaryEmailAddress: { emailAddress: 'other@example.com' },
    }),
    true
  );
});

test('hasJobBoardPreviewAccess denies unknown users or emails', () => {
  assert.equal(hasJobBoardPreviewAccess('unknown@example.com'), false);
  assert.equal(hasJobBoardPreviewAccess('user_unknown999'), false);
  assert.equal(hasJobBoardPreviewAccess(null), false);
  assert.equal(hasJobBoardPreviewAccess(undefined), false);
  assert.equal(
    hasJobBoardPreviewAccess({
      id: 'user_other',
      primaryEmailAddress: { emailAddress: 'other@example.com' },
    }),
    false
  );
});

test('isJobBoardRoute identifies job board paths', () => {
  assert.equal(isJobBoardRoute('/job-board'), true);
  assert.equal(isJobBoardRoute('/job-board/'), true);
  assert.equal(isJobBoardRoute('/job-board/123'), true);
  assert.equal(isJobBoardRoute('/dashboard'), false);
  assert.equal(isJobBoardRoute('/inbox'), false);
  assert.equal(isJobBoardRoute('/profile'), false);
});
