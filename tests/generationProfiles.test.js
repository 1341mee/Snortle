const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_PROFILE, normalizeProfile, toModelSettings } = require('../generationProfiles');

test('level 0 is greedy and level 5 matches the requested balanced randomness', () => {
  assert.deepEqual(toModelSettings({ randomness: 0, responseLength: 2, repetitionControl: 0 }), {
    top_k: 1,
    temperature: 0,
    max_tokens: 128,
    repeat_penalty: 1,
    repeat_window: 32
  });
  assert.deepEqual(toModelSettings({ randomness: 5, responseLength: 2, repetitionControl: 2 }), {
    top_k: 30,
    temperature: 0.6,
    max_tokens: 128,
    repeat_penalty: 1.05,
    repeat_window: 64
  });
});

test('level 10 uses broad randomness, longest response, and strongest repetition control', () => {
  assert.deepEqual(toModelSettings({ randomness: 10, responseLength: 10, repetitionControl: 10 }), {
    top_k: 80,
    temperature: 1,
    max_tokens: 768,
    repeat_penalty: 1.5,
    repeat_window: 384
  });
});

test('normalizes saved levels and clamps out-of-range values', () => {
  assert.deepEqual(normalizeProfile({ randomness: 12, responseLength: -1, repetitionControl: 4.7 }), {
    randomness: 10,
    responseLength: 0,
    repetitionControl: 5
  });
});

test('migrates prior raw model settings to the nearest level preset', () => {
  assert.deepEqual(normalizeProfile({
    top_k: 30,
    temperature: 0.6,
    max_tokens: 128,
    repeat_penalty: 1.05,
    repeat_window: 64
  }), {
    randomness: 5,
    responseLength: 2,
    repetitionControl: 2
  });
});

test('returns the default friendly profile for empty or invalid saved data', () => {
  assert.deepEqual(normalizeProfile({}), DEFAULT_PROFILE);
  assert.deepEqual(normalizeProfile({ randomness: 'invalid' }), DEFAULT_PROFILE);
});
