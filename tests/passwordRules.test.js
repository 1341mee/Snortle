const test = require('node:test');
const assert = require('node:assert/strict');
const { getPasswordError } = require('../passwordRules');

test('passwords require at least seven characters', () => {
  assert.match(getPasswordError('abc123'), /at least 7/);
  assert.equal(getPasswordError('abc123!'), null);
});

test('rejects passwords made from one repeated character', () => {
  assert.match(getPasswordError('aaaaaaa'), /repeated character/);
  assert.match(getPasswordError('7777777'), /repeated character/);
});

test('rejects ascending and descending character sequences', () => {
  assert.match(getPasswordError('abcdefg'), /counting-up or counting-down/);
  assert.match(getPasswordError('7654321'), /counting-up or counting-down/);
  assert.match(getPasswordError('ABCDEFG'), /counting-up or counting-down/);
});

test('rejects common password words including the requested typo', () => {
  assert.match(getPasswordError('MyPassword123'), /password/);
  assert.match(getPasswordError('PASWORD88'), /pasword/);
});

test('rejects the username as the password without regard to case', () => {
  assert.match(getPasswordError('JamieCopilot', 'jamiecopilot'), /username/);
  assert.equal(getPasswordError('Jamie2026!', 'Jamie'), null);
});
