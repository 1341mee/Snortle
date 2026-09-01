const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeUsers, getRiskLevel } = require('../adminRisk');

test('flags suspicious wallet and chat volume', () => {
  const result = summarizeUsers([
    {
      username: 'alice',
      freeSnortzCoins: 250,
      purchasedSnortzCoins: 50,
      planId: 'free',
      chats: Array.from({ length: 18 }, (_, i) => ({ id: `chat-${i}` })),
      createdAt: '2026-08-31T00:00:00.000Z'
    },
    {
      username: 'bob',
      freeSnortzCoins: 40,
      purchasedSnortzCoins: 20,
      planId: 'plus',
      chats: Array.from({ length: 4 }, (_, i) => ({ id: `chat-${i}` })),
      createdAt: '2026-08-31T00:00:00.000Z'
    }
  ]);

  assert.equal(result[0].riskLevel, 'high');
  assert.equal(result[1].riskLevel, 'low');
  assert.equal(getRiskLevel(250, 'free', 18), 'high');
});
