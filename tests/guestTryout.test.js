const test = require('node:test');
const assert = require('node:assert/strict');
const countUserCharacters = require('../views/text-length');
const {
  FixedWindowRateLimiter,
  GUEST_SESSION_TTL_MS,
  GUEST_STARTING_COINS,
  allowGuestSessionRequest,
  calculateGenerationCost,
  createGuestTryoutManager,
  hashGuestToken
} = require('../guestTryout');

function createMockClient(events) {
  let cancelled = false;
  return {
    client: {
      submit() {
        return {
          async *[Symbol.asyncIterator]() {
            for (const event of events) {
              yield event;
              if (cancelled) return;
            }
          },
          cancel() {
            cancelled = true;
          }
        };
      },
      close() {}
    },
    wasCancelled: () => cancelled
  };
}

test('guest sessions keep their remaining allowance when the page is refreshed', async () => {
  const sessions = new Map();
  let saves = 0;
  const manager = createGuestTryoutManager({ sessions, save: async () => { saves += 1; } });
  const firstVisit = await manager.getOrCreate('');
  const reloadedSessions = new Map(JSON.parse(JSON.stringify([...sessions.entries()])));
  const refreshedManager = createGuestTryoutManager({ sessions: reloadedSessions, save: async () => { saves += 1; } });
  const refreshedVisit = await refreshedManager.getOrCreate(firstVisit.token);

  assert.equal(firstVisit.remainingCoins, GUEST_STARTING_COINS);
  assert.deepEqual(refreshedVisit, firstVisit);
  assert.equal(sessions.size, 1);
  assert.equal([...sessions.keys()][0], hashGuestToken(firstVisit.token));
  assert.ok(saves >= 1);
});

test('malformed or expired guest tokens receive a new bounded session', async () => {
  const currentTime = 50 * GUEST_SESSION_TTL_MS;
  const sessions = new Map();
  const manager = createGuestTryoutManager({ sessions, save: async () => {}, now: () => currentTime });
  const malformedSession = await manager.getOrCreate('not-a-valid-token');
  assert.equal(malformedSession.remainingCoins, GUEST_STARTING_COINS);

  const expiredSessions = new Map();
  const expiredToken = 'a'.repeat(64);
  expiredSessions.set(hashGuestToken(expiredToken), {
    remainingCoins: 0,
    createdAt: currentTime - GUEST_SESSION_TTL_MS - 1,
    lastUsedAt: currentTime - GUEST_SESSION_TTL_MS - 1
  });
  const expiredManager = createGuestTryoutManager({ sessions: expiredSessions, save: async () => {}, now: () => currentTime });
  const expiredSession = await expiredManager.getOrCreate(expiredToken);

  assert.equal(malformedSession.remainingCoins, GUEST_STARTING_COINS);
  assert.equal(expiredSession.remainingCoins, GUEST_STARTING_COINS);
  assert.notEqual(expiredSession.token, expiredToken);
  assert.equal(expiredSessions.size, 1);
});

test('guest generation debits observed cumulative cost and cancels at the allowance limit', async () => {
  const sessions = new Map();
  const mock = createMockClient([
    { type: 'data', data: [{ output: 'A partial answer', think_time: 30, gen_token_count: 0 }] },
    { type: 'data', data: [{ output: 'A longer answer', think_time: 60, gen_token_count: 800 }] }
  ]);
  const manager = createGuestTryoutManager({
    sessions,
    save: async () => {},
    connectClient: async () => mock.client
  });
  const guest = await manager.getOrCreate('');
  const progress = [];
  const result = await manager.generate({
    token: guest.token,
    prompt: 'Test prompt',
    onEvent: async (event) => progress.push(event)
  });

  assert.equal(progress.length, 2);
  assert.equal(progress[0].remainingCoins, 2);
  assert.equal(progress[1].remainingCoins, 0);
  assert.equal(progress[1].exhausted, true);
  assert.equal(result.exhausted, true);
  assert.equal(result.output, 'A longer answer');
  assert.equal(mock.wasCancelled(), true);
  assert.equal(sessions.get(hashGuestToken(guest.token)).remainingCoins, 0);
});

test('exhausted guests cannot start another generation', async () => {
  const sessions = new Map();
  let connected = false;
  const manager = createGuestTryoutManager({
    sessions,
    save: async () => {},
    connectClient: async () => {
      connected = true;
      return createMockClient([]).client;
    }
  });
  const guest = await manager.getOrCreate('');
  sessions.get(hashGuestToken(guest.token)).remainingCoins = 0;

  await assert.rejects(
    manager.generate({ token: guest.token, prompt: 'More', onEvent: async () => {} }),
    (error) => error.exhausted === true
  );
  assert.equal(connected, false);
});

test('tryout rejects messages over 5000 characters before connecting to the model', async () => {
  const sessions = new Map();
  let connected = false;
  const manager = createGuestTryoutManager({
    sessions,
    save: async () => {},
    connectClient: async () => {
      connected = true;
      return createMockClient([]).client;
    }
  });
  const guest = await manager.getOrCreate('');

  await assert.rejects(
    manager.generate({ token: guest.token, prompt: 'x'.repeat(5001), onEvent: async () => {} }),
    (error) => error.statusCode === 400 && error.message.includes('5,000')
  );
  assert.equal(connected, false);
});

test('character limits count Thai combining sequences and joined emoji as visible characters', () => {
  assert.equal(countUserCharacters('ก็'.repeat(100)), 100);
  assert.equal(countUserCharacters('👨‍👩‍👧‍👦'.repeat(20)), 20);
});

test('tryout allows 5000 Thai graphemes and rejects 5001', async () => {
  const sessions = new Map();
  let connectCount = 0;
  const mock = createMockClient([
    { type: 'data', data: [{ output: 'ok', think_time: 0, gen_token_count: 0 }] }
  ]);
  const manager = createGuestTryoutManager({
    sessions,
    save: async () => {},
    connectClient: async () => {
      connectCount += 1;
      return mock.client;
    }
  });
  const guest = await manager.getOrCreate('');

  await manager.generate({ token: guest.token, prompt: 'ก็'.repeat(5000), onEvent: async () => {} });
  await assert.rejects(
    manager.generate({ token: guest.token, prompt: 'ก็'.repeat(5001), onEvent: async () => {} }),
    (error) => error.statusCode === 400
  );
  assert.equal(connectCount, 1);
});

test('tryout persistence contains quota metadata but never the prompt or response', async () => {
  const sessions = new Map();
  const mock = createMockClient([
    { type: 'data', data: [{ output: 'private response', think_time: 1, gen_token_count: 1 }] }
  ]);
  const manager = createGuestTryoutManager({
    sessions,
    save: async () => {},
    connectClient: async () => mock.client
  });
  const guest = await manager.getOrCreate('');
  await manager.generate({ token: guest.token, prompt: 'private prompt', onEvent: async () => {} });
  const stored = JSON.stringify([...sessions.entries()]);

  assert.equal(stored.includes('private prompt'), false);
  assert.equal(stored.includes('private response'), false);
});

test('generation rate limiter enforces its window then resets', () => {
  let currentTime = 1000;
  const limiter = new FixedWindowRateLimiter({ limit: 2, windowMs: 1000, now: () => currentTime });

  assert.equal(limiter.take('ip'), true);
  assert.equal(limiter.take('ip'), true);
  assert.equal(limiter.take('ip'), false);
  currentTime += 1000;
  assert.equal(limiter.take('ip'), true);
});

test('refreshing a known guest session does not consume the new-session limit', () => {
  const limiter = new FixedWindowRateLimiter({ limit: 1, windowMs: 1000, now: () => 1000 });

  assert.equal(allowGuestSessionRequest({ known: false, address: 'shared-ip', creationLimiter: limiter }), true);
  assert.equal(allowGuestSessionRequest({ known: false, address: 'shared-ip', creationLimiter: limiter }), false);
  for (let refresh = 0; refresh < 25; refresh += 1) {
    assert.equal(allowGuestSessionRequest({ known: true, address: 'shared-ip', creationLimiter: limiter }), true);
  }
  assert.equal(allowGuestSessionRequest({ known: false, address: 'shared-ip', creationLimiter: limiter }), false);
});

test('generation cost uses the account coin formula and ignores negative metrics', () => {
  assert.equal(calculateGenerationCost({ think_time: 30, gen_token_count: 750 }), 2);
  assert.equal(calculateGenerationCost({ think_time: -30, gen_token_count: -1 }), 0);
});
