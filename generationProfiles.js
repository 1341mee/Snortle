const LEVELS = Object.freeze({
  randomness: Object.freeze([
    { top_k: 1, temperature: 0 },
    { top_k: 5, temperature: 0.2 },
    { top_k: 10, temperature: 0.3 },
    { top_k: 18, temperature: 0.4 },
    { top_k: 24, temperature: 0.5 },
    { top_k: 30, temperature: 0.6 },
    { top_k: 40, temperature: 0.7 },
    { top_k: 50, temperature: 0.8 },
    { top_k: 60, temperature: 0.9 },
    { top_k: 70, temperature: 0.95 },
    { top_k: 80, temperature: 1 }
  ]),
  responseLength: Object.freeze([64, 96, 128, 192, 256, 320, 384, 448, 512, 640, 768]),
  repetitionControl: Object.freeze([
    { repeat_penalty: 1, repeat_window: 32 },
    { repeat_penalty: 1.02, repeat_window: 48 },
    { repeat_penalty: 1.05, repeat_window: 64 },
    { repeat_penalty: 1.08, repeat_window: 80 },
    { repeat_penalty: 1.12, repeat_window: 96 },
    { repeat_penalty: 1.16, repeat_window: 128 },
    { repeat_penalty: 1.2, repeat_window: 160 },
    { repeat_penalty: 1.25, repeat_window: 192 },
    { repeat_penalty: 1.3, repeat_window: 256 },
    { repeat_penalty: 1.4, repeat_window: 320 },
    { repeat_penalty: 1.5, repeat_window: 384 }
  ])
});

const DEFAULT_PROFILE = Object.freeze({
  randomness: 5,
  responseLength: 2,
  repetitionControl: 2
});

function clampLevel(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(10, Math.round(numeric)));
}

function nearestIndex(values, score) {
  return values.reduce((best, value, index) => {
    const nextScore = score(value);
    return nextScore < best.score ? { index, score: nextScore } : best;
  }, { index: 0, score: Infinity }).index;
}

function normalizeProfile(saved = {}) {
  if (!saved || Object.keys(saved).length === 0) return { ...DEFAULT_PROFILE };

  if (['randomness', 'responseLength', 'repetitionControl'].some((key) => saved[key] !== undefined)) {
    return {
      randomness: clampLevel(saved.randomness, DEFAULT_PROFILE.randomness),
      responseLength: clampLevel(saved.responseLength, DEFAULT_PROFILE.responseLength),
      repetitionControl: clampLevel(saved.repetitionControl, DEFAULT_PROFILE.repetitionControl)
    };
  }

  const oldRandomness = LEVELS.randomness[nearestIndex(LEVELS.randomness, (value) => {
    const topKDelta = (Number(saved.top_k ?? 40) - value.top_k) / 80;
    const temperatureDelta = Number(saved.temperature ?? 0.8) - value.temperature;
    return topKDelta ** 2 + temperatureDelta ** 2;
  })];
  const oldRepetition = LEVELS.repetitionControl[nearestIndex(LEVELS.repetitionControl, (value) => {
    const penaltyDelta = (Number(saved.repeat_penalty ?? 1) - value.repeat_penalty) / 0.5;
    const windowDelta = (Number(saved.repeat_window ?? 64) - value.repeat_window) / 384;
    return penaltyDelta ** 2 + windowDelta ** 2;
  })];

  return {
    randomness: LEVELS.randomness.indexOf(oldRandomness),
    responseLength: nearestIndex(LEVELS.responseLength, (value) => Math.abs(Number(saved.max_tokens ?? 128) - value)),
    repetitionControl: LEVELS.repetitionControl.indexOf(oldRepetition)
  };
}

function toModelSettings(profile = DEFAULT_PROFILE) {
  const normalized = normalizeProfile(profile);
  return {
    ...LEVELS.randomness[normalized.randomness],
    max_tokens: LEVELS.responseLength[normalized.responseLength],
    ...LEVELS.repetitionControl[normalized.repetitionControl]
  };
}

const generationProfiles = { DEFAULT_PROFILE, LEVELS, normalizeProfile, toModelSettings };

if (typeof module === 'object' && module.exports) {
  module.exports = generationProfiles;
}

if (typeof window !== 'undefined') {
  window.GenerationProfiles = generationProfiles;
}
