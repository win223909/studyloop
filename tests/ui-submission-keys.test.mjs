import test from 'node:test';
import assert from 'node:assert/strict';
import { createSubmissionKeys } from '../src/submission-keys.js';

test('multipart retries retain keys, while edited material or a newly selected file gets a fresh key', () => {
  const keys = createSubmissionKeys();
  const file = new File(['course material'], 'chapter.txt', { type: 'text/plain' });
  const form = (title, selected = file) => {
    const body = new FormData();
    body.set('topic', 'Fractions');
    body.set('sourceTitle', title);
    body.set('file', selected);
    return body;
  };
  const first = keys.prepare('/api/plans', form('Chapter 1'));
  assert.equal(keys.prepare('/api/plans', form('Chapter 1')).key, first.key);
  const revised = keys.prepare('/api/plans', form('Chapter 2'));
  assert.notEqual(revised.key, first.key);
  keys.complete('/api/plans', first);
  assert.equal(keys.prepare('/api/plans', form('Chapter 2')).key, revised.key);
  const reselected = keys.prepare(
    '/api/plans',
    form('Chapter 2', new File(['changed'], 'chapter.txt')),
  );
  assert.notEqual(reselected.key, revised.key);
});

test('answer ordering is irrelevant; completed submissions and different routes get fresh keys', () => {
  const keys = createSubmissionKeys();
  const path = '/api/courses/example/attempts';
  const first = keys.prepare(path, { answers: { b: 'unknown', a: 0 } });
  const same = keys.prepare(path, { answers: { a: 0, b: 'unknown' } });
  assert.equal(same.key, first.key);
  assert.notEqual(
    keys.prepare('/api/courses/other/attempts', { answers: { a: 0, b: 'unknown' } }).key,
    first.key,
  );
  keys.complete(path, same);
  assert.notEqual(keys.prepare(path, { answers: { a: 0, b: 'unknown' } }).key, first.key);
});
