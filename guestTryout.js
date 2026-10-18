const crypto = require('crypto');
const countUserCharacters = require('./views/text-length');

const GUEST_STARTING_COINS = 3;
const GUEST_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_GUEST_SESSIONS = 100000;
const MODEL_ID = 'Snortle-AI/Snortle-Pancake-1';

function hashGuestToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function calculateGenerationCost(data) {
  const thinkingSeconds = Math.max(0, Number(data?.think_time) || 0);
  const generatedTokens = Math.max(0, Number(data?.gen_token_count) || 0);
  return thinkingSeconds / 30 + generatedTokens / 750;
}

function allowGuestSessionRequest({ known, address, creationLimiter }) {
  return known || creationLimiter.take(address);
}

function createGuestTryoutManager({ sessions, save, connectClient, now = Date.now }) {
  const activeSessions = new Set();

  function pruneSessions() {
    const cutoff = now() - GUEST_SESSION_TTL_MS;
    for (const [key, session] of sessions) {
      if (Number(session.lastUsedAt || session.createdAt) < cutoff) sessions.delete(key);
    }

    if (sessions.size > MAX_GUEST_SESSIONS) {
      const oldest = [...sessions.entries()]
        .sort((left, right) => Number(left[1].lastUsedAt || left[1].createdAt) - Number(right[1].lastUsedAt || right[1].createdAt))
        .slice(0, sessions.size - MAX_GUEST_SESSIONS);
      oldest.forEach(([key]) => sessions.delete(key));
    }
  }

  async function getOrCreate(token) {
    pruneSessions();
    const currentTime = now();
    let sessionToken = typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) ? token : '';
    let key = sessionToken ? hashGuestToken(sessionToken) : '';
    let session = key ? sessions.get(key) : null;

    if (!session) {
      sessionToken = crypto.randomBytes(32).toString('hex');
      key = hashGuestToken(sessionToken);
      session = {
        remainingCoins: GUEST_STARTING_COINS,
        createdAt: currentTime,
        lastUsedAt: currentTime
      };
      sessions.set(key, session);
      await save();
    } else {
      session.lastUsedAt = currentTime;
    }

    return {
      token: sessionToken,
      remainingCoins: Math.max(0, Number(session.remainingCoins) || 0)
    };
  }

  async function generate({ token, prompt, signal, onEvent }) {
    if (typeof prompt !== 'string' || !prompt.trim()) {
      throw Object.assign(new Error('Enter a message to try Snortle.'), { statusCode: 400 });
    }
    if (countUserCharacters(prompt) > 5000) {
      throw Object.assign(new Error('Messages must be 5,000 characters or fewer.'), { statusCode: 400 });
    }

    const key = hashGuestToken(token || '');
    const session = sessions.get(key);
    if (!session) throw Object.assign(new Error('Tryout session expired. Refresh to start a new tryout.'), { statusCode: 401 });
    if (activeSessions.has(key)) {
      throw Object.assign(new Error('Wait for the current answer to finish.'), { statusCode: 429 });
    }
    if (Number(session.remainingCoins) <= 0) {
      throw Object.assign(new Error('Your 3 Snortz Coin tryout is used up. Sign up or log in to keep chatting.'), { statusCode: 429, exhausted: true });
    }

    activeSessions.add(key);
    session.lastUsedAt = now();
    let modelClient;
    let submission;
    let chargedCost = 0;
    let latestData = null;
    let exhausted = false;
    let lastPersistedCoins = Number(session.remainingCoins);
    const cancelSubmission = () => {
      try { submission?.cancel(); } catch {}
    };

    if (signal) signal.addEventListener('abort', cancelSubmission, { once: true });

    try {
      modelClient = await connectClient(MODEL_ID);
      if (signal?.aborted) throw Object.assign(new Error('Tryout request was cancelled.'), { statusCode: 499 });

      submission = modelClient.submit('/predict', {
        prompt: prompt.trim(),
        session_id: `guest-${key.slice(0, 24)}`,
        max_tokens: 128,
        top_k: 40,
        temperature: 0.8,
        repeat_penalty: 1,
        repeat_window: 64
      });

      for await (const event of submission) {
        if (signal?.aborted) break;
        if (event.type === 'status') continue;
        const data = event.data && event.data[0];
        if (!data) continue;
        latestData = data;

        const observedCost = calculateGenerationCost(data);
        const additionalCost = Math.max(0, observedCost - chargedCost);
        if (additionalCost > 0) {
          const available = Math.max(0, Number(session.remainingCoins) || 0);
          session.remainingCoins = Math.max(0, available - Math.min(available, additionalCost));
          chargedCost += additionalCost;
          if (lastPersistedCoins - session.remainingCoins >= 0.05 || session.remainingCoins <= 0) {
            await save();
            lastPersistedCoins = session.remainingCoins;
          }
        }

        exhausted = Number(session.remainingCoins) <= 0;
        await onEvent({
          output: typeof data.output === 'string' ? data.output : '',
          remainingCoins: Number(session.remainingCoins.toFixed(3)),
          exhausted
        });

        if (exhausted) {
          cancelSubmission();
          break;
        }
      }

      if (!latestData) throw new Error('No response received from the model. Please try again.');
      return {
        output: typeof latestData.output === 'string' ? latestData.output : '',
        remainingCoins: Number(session.remainingCoins.toFixed(3)),
        exhausted
      };
    } finally {
      if (signal) signal.removeEventListener('abort', cancelSubmission);
      activeSessions.delete(key);
      if (Number(session.remainingCoins) !== lastPersistedCoins) await save();
    }
  }

  return { getOrCreate, generate };
}

class FixedWindowRateLimiter {
  constructor({ limit, windowMs, now = Date.now }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.entries = new Map();
    this.operations = 0;
  }

  take(key) {
    const currentTime = this.now();
    this.operations += 1;
    if (this.operations % 256 === 0) {
      for (const [entryKey, entry] of this.entries) {
        if (currentTime - entry.startedAt >= this.windowMs) this.entries.delete(entryKey);
      }
    }
    const entry = this.entries.get(key);
    if (!entry || currentTime - entry.startedAt >= this.windowMs) {
      this.entries.set(key, { startedAt: currentTime, count: 1 });
      return true;
    }
    if (entry.count >= this.limit) return false;
    entry.count += 1;
    return true;
  }
}

module.exports = {
  GUEST_SESSION_TTL_MS,
  GUEST_STARTING_COINS,
  FixedWindowRateLimiter,
  allowGuestSessionRequest,
  calculateGenerationCost,
  createGuestTryoutManager,
  hashGuestToken
};
