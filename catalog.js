const MODEL_ACCESS = { free: 0, mid: 1, top: 2 };
const TEMPORARY_PLAN_SELECTOR_ENABLED = false;
const FREE_COIN_ALLOWANCE = 50;
const PLUS_COIN_ALLOWANCE = 100;
const PRO_COIN_ALLOWANCE = 500;

function buildPlan({ id, name, price, billing, modelAccess, hourlyFreeCoins, coinAllowance, accessLabel }) {
  return {
    id,
    name,
    price,
    billing,
    modelAccess,
    hourlyFreeCoins,
    coinAllowance,
    details: [
      accessLabel,
      `${coinAllowance} Snortz Coin allowance`,
      `${hourlyFreeCoins} Snortz Coins an hour`
    ]
  };
}

const catalog = {
  models: [
    { id: 'snortle-pancake-2-1', name: 'Snortle Pancake 2.1', space: 'Snortle-AI/Snortle-Pancake-2.1', tier: 'free', available: false, description: 'A more assistant-like conversational style compared to Snortle Pancake 2, but uses just as many snortz coins. Currently unavailable.' },
    { id: 'snortle-pancake-2', name: 'Snortle Pancake 2', space: 'Snortle-AI/Snortle-Pancake-2', tier: 'free', available: true, description: 'Upgraded pancake model with much more powerful thinking and generation. May use 3x more snortz coins average compared to Pancake 1.' },
    { id: 'snortle-pancake-1', name: 'Snortle Pancake 1', space: 'Snortle-AI/Snortle-Pancake-1', tier: 'free', available: true, description: 'Really fast test model, but generally not recommended to use.' },
  ],
  plans: [
    buildPlan({
      id: 'free',
      name: 'Free',
      price: 0,
      billing: 'month',
      modelAccess: MODEL_ACCESS.free,
      hourlyFreeCoins: 3,
      coinAllowance: FREE_COIN_ALLOWANCE,
      accessLabel: 'Access to free models'
    }),
    buildPlan({
      id: 'plus',
      name: 'Plus',
      price: 0.49,
      billing: 'month',
      modelAccess: MODEL_ACCESS.mid,
      hourlyFreeCoins: 5,
      coinAllowance: PLUS_COIN_ALLOWANCE,
      accessLabel: 'Access to free and mid-tier models'
    }),
    buildPlan({
      id: 'pro',
      name: 'Pro',
      price: 0.99,
      billing: 'month',
      modelAccess: MODEL_ACCESS.top,
      hourlyFreeCoins: 8,
      coinAllowance: PRO_COIN_ALLOWANCE,
      accessLabel: 'Access to all models (including top models)'
    })
  ],
  coinPackages: [
    { id: 'coins-1000', amount: 1000, price: 0.49 },
    { id: 'coins-3000', amount: 3000, price: 0.99 },
    { id: 'coins-10000', amount: 10000, price: 1.99 }
  ]
};

catalog.modelAccess = MODEL_ACCESS;
catalog.temporaryPlanSelectorEnabled = TEMPORARY_PLAN_SELECTOR_ENABLED;

module.exports = catalog;