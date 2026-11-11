const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../catalog');

test('Snortle Pancake 2 is the default catalog model', () => {
  assert.equal(catalog.models[0].space, 'Snortle-AI/Snortle-Pancake-2');
});

test('Snortle Pancake 2.1 is listed as unavailable with its assistant-style description', () => {
  const model = catalog.models.find((entry) => entry.id === 'snortle-pancake-2-1');

  assert.ok(model);
  assert.equal(model.available, false);
  assert.match(model.description, /more assistant-like/i);
});