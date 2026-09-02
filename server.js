const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();
const catalog = require('./catalog');
const { summarizeUsers } = require('./adminRisk');
const { getPersistedState, persistState } = require('./data/mongoStore');

const hostname = '0.0.0.0';
const port = Number(process.env.PORT) || 3001;
const rootDir = __dirname;
const dataFile = path.join(rootDir, 'data', 'store.json');
const adminAccessKey = process.env.ADMIN_ACCESS_KEY || 'snortle-admin';
const users = new Map();
const sessions = new Map();
const botChallenges = new Map();
const STARTING_FREE_SNORTZ_COINS = 20;
const DEFAULT_MODEL_ID = catalog.models[0].space;
const DEFAULT_PLAN_ID = 'free';
const HOUR_IN_MS = 60 * 60 * 1000;
const SESSION_IDLE_TIMEOUT_MS = 7 * 24 * HOUR_IN_MS; // log out after 7 days of no activity

function getPlan(planId = DEFAULT_PLAN_ID) {
  return catalog.plans.find((plan) => plan.id === planId) || catalog.plans[0];
}

function canUseModel(planId, model) {
  return getPlan(planId).modelAccess >= catalog.modelAccess[model.tier];
}

async function loadStore() {
  try {
    const store = await getPersistedState();

    for (const user of store.users || []) {
      users.set(user.username, user);
    }

    for (const session of store.sessions || []) {
      sessions.set(session.token, session.data);
    }
  } catch (error) {
    console.error('Could not load saved data:', error.message);
  }
}

async function saveStore() {
  await persistState(users, sessions);
}

function getAuthenticatedSession(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const sessionToken = cookies.session;
  if (!sessionToken) return null;

  const sessionData = sessions.get(sessionToken);
  if (!sessionData) return null;

  const lastActivity = Number(sessionData.lastActivity || Date.now());
  if (Date.now() - lastActivity > SESSION_IDLE_TIMEOUT_MS) {
    sessions.delete(sessionToken);
    saveStore();
    return null;
  }

  sessionData.lastActivity = Date.now();
  return sessionData;
}

function getUserChats(username) {
  const user = users.get(username);
  if (!user) return null;
  if (!Array.isArray(user.chats)) user.chats = [];
  return user.chats;
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function hasStrongPassword(password) {
  return password.length >= 6 && /\d/.test(password) && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[^A-Za-z0-9]/.test(password);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function parseCookies(cookieHeader = '') {
  const cookies = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split('=');
    if (!name) return;
    cookies[name] = decodeURIComponent(rest.join('='));
  });

  return cookies;
}

function getWallets(user) {
  return {
    freeSnortzCoins: Number(user.freeSnortzCoins ?? user.snortzCoins ?? STARTING_FREE_SNORTZ_COINS),
    purchasedSnortzCoins: Number(user.purchasedSnortzCoins ?? 0)
  };
}

function refreshHourlyCoins(sessionData) {
  const user = users.get(sessionData.username);
  const plan = getPlan(sessionData.planId || user?.planId);
  sessionData.freeSnortzCoins = Number(sessionData.freeSnortzCoins ?? sessionData.snortzCoins ?? STARTING_FREE_SNORTZ_COINS);
  sessionData.purchasedSnortzCoins = Number(sessionData.purchasedSnortzCoins ?? 0);
  const lastGrant = Number(sessionData.lastFreeCoinGrant || user?.lastFreeCoinGrant || Date.now());
  const elapsedHours = Math.floor((Date.now() - lastGrant) / HOUR_IN_MS);

  sessionData.planId = plan.id;
  sessionData.lastFreeCoinGrant = elapsedHours > 0 ? lastGrant + elapsedHours * HOUR_IN_MS : lastGrant;

  if (elapsedHours > 0) {
    sessionData.freeSnortzCoins += elapsedHours * plan.hourlyFreeCoins;
  }

  const balanceBeforeClamp = sessionData.freeSnortzCoins;
  sessionData.freeSnortzCoins = Math.min(sessionData.freeSnortzCoins, plan.coinAllowance);

  if (elapsedHours > 0 || balanceBeforeClamp !== sessionData.freeSnortzCoins) {
    if (user) {
      user.freeSnortzCoins = sessionData.freeSnortzCoins;
      user.lastFreeCoinGrant = sessionData.lastFreeCoinGrant;
    }
    saveStore();
  }
}

function createSession(username, freeSnortzCoins = STARTING_FREE_SNORTZ_COINS, purchasedSnortzCoins = 0, planId = DEFAULT_PLAN_ID, lastFreeCoinGrant = Date.now()) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username, freeSnortzCoins, purchasedSnortzCoins, planId, lastFreeCoinGrant, lastActivity: Date.now() });
  saveStore();
  return token;
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

loadStore().catch((error) => {
  console.error('Initial store load failed:', error.message);
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${hostname}:${port}`);

  if (req.method === 'GET' && url.pathname === '/api/bot-check') {
    const answer = crypto.randomInt(1, 21);
    const token = crypto.randomBytes(24).toString('hex');
    botChallenges.set(token, answer);
    return sendJson(res, 200, { token, min: 0, max: 20, answer });
  }

  if (req.method === 'POST' && url.pathname === '/api/signup') {
    const { username, password, botCheckAnswer, botCheckToken } = await parseBody(req);

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return sendJson(res, 400, { success: false, message: 'Username and password are required.' });
    }

    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3) {
      return sendJson(res, 400, { success: false, message: 'Username must be at least 3 characters.' });
    }

    if (!hasStrongPassword(password)) {
      return sendJson(res, 400, { success: false, message: 'Password must be at least 6 characters and include a number, lowercase letter, uppercase letter, and punctuation mark.' });
    }

    const expectedBotAnswer = botChallenges.get(botCheckToken);
    botChallenges.delete(botCheckToken);
    if (expectedBotAnswer === undefined || Number(botCheckAnswer) !== expectedBotAnswer) {
      return sendJson(res, 400, { success: false, message: 'Bot check failed. Please move the slider to the requested number.' });
    }

    if (users.has(trimmedUsername)) {
      return sendJson(res, 409, { success: false, message: 'This username already exists.' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);

    users.set(trimmedUsername, {
      username: trimmedUsername,
      passwordHash,
      salt,
      freeSnortzCoins: STARTING_FREE_SNORTZ_COINS,
      purchasedSnortzCoins: 0,
      chats: [],
      planId: DEFAULT_PLAN_ID,
      lastFreeCoinGrant: Date.now()
    });
    saveStore();

    const newSessionToken = createSession(trimmedUsername, STARTING_FREE_SNORTZ_COINS, 2, DEFAULT_PLAN_ID);
    res.setHeader('Set-Cookie', `session=${newSessionToken}; Path=/; HttpOnly; SameSite=Lax`);
    return sendJson(res, 201, { success: true, message: 'Account created successfully.' });
  }

  if (req.method === 'POST' && url.pathname === '/api/login') {
    const { username, password } = await parseBody(req);

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return sendJson(res, 400, { success: false, message: 'Username and password are required.' });
    }

    const trimmedUsername = username.trim();
    const user = users.get(trimmedUsername);

    if (!user) {
      return sendJson(res, 401, { success: false, message: 'Invalid username or password.' });
    }

    const hashedPassword = hashPassword(password, user.salt);
    const expectedHash = Buffer.from(user.passwordHash, 'hex');
    const actualHash = Buffer.from(hashedPassword, 'hex');

    const isValid = expectedHash.length === actualHash.length && crypto.timingSafeEqual(expectedHash, actualHash);

    if (!isValid) {
      return sendJson(res, 401, { success: false, message: 'Invalid username or password.' });
    }

    const wallets = getWallets(user);
    user.freeSnortzCoins = wallets.freeSnortzCoins;
    user.purchasedSnortzCoins = wallets.purchasedSnortzCoins;
    const newSessionToken = createSession(trimmedUsername, wallets.freeSnortzCoins, wallets.purchasedSnortzCoins, user.planId || DEFAULT_PLAN_ID, user.lastFreeCoinGrant || Date.now());
    res.setHeader('Set-Cookie', `session=${newSessionToken}; Path=/; HttpOnly; SameSite=Lax`);
    return sendJson(res, 200, { success: true, message: 'Logged in successfully.' });
  }

  if (req.method === 'GET' && url.pathname === '/api/session-status') {
    const sessionData = getAuthenticatedSession(req);
    const isLoggedIn = !!sessionData;
    if (sessionData) refreshHourlyCoins(sessionData);
    const plan = sessionData ? getPlan(sessionData.planId) : getPlan();

    return sendJson(res, 200, {
      loggedIn: isLoggedIn,
      username: isLoggedIn ? sessionData.username : null,
      freeSnortzCoins: isLoggedIn ? sessionData.freeSnortzCoins : 0,
      purchasedSnortzCoins: isLoggedIn ? sessionData.purchasedSnortzCoins : 0,
      snortzCoins: isLoggedIn ? sessionData.freeSnortzCoins + sessionData.purchasedSnortzCoins : 0,
      planId: isLoggedIn ? plan.id : null,
      hourlyFreeCoins: isLoggedIn ? plan.hourlyFreeCoins : 0,
      temporaryPlanSelectorEnabled: isLoggedIn && (sessionData.username === 'admin' || !!catalog.temporaryPlanSelectorEnabled),
      nextFreeCoinGrant: isLoggedIn ? sessionData.lastFreeCoinGrant + HOUR_IN_MS : null
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/catalog') {
    return sendJson(res, 200, catalog);
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/users') {
    const adminKey = url.searchParams.get('key');
    if (!adminKey || adminKey !== adminAccessKey) {
      return sendJson(res, 403, { success: false, message: 'Admin access denied.' });
    }

    const accountList = [...users.values()].map((user) => ({
      username: user.username,
      planId: user.planId || 'free',
      freeSnortzCoins: Number(user.freeSnortzCoins || 0),
      purchasedSnortzCoins: Number(user.purchasedSnortzCoins || 0),
      chatCount: Array.isArray(user.chats) ? user.chats.length : 0,
      createdAt: user.createdAt || null,
      suspicious: summarizeUsers([user])[0].suspicious
    }));

    return sendJson(res, 200, {
      success: true,
      users: accountList,
      summary: {
        totalUsers: accountList.length,
        suspiciousUsers: accountList.filter((user) => user.suspicious).length
      }
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/set-plan') {
    const sessionData = getAuthenticatedSession(req);
    if (!sessionData) return sendJson(res, 401, { success: false, message: 'You must be logged in.' });
    if (sessionData.username !== 'admin' && !catalog.temporaryPlanSelectorEnabled) {
      return sendJson(res, 403, { success: false, message: 'Temporary plan selection is disabled.' });
    }
    refreshHourlyCoins(sessionData);
    const { planId } = await parseBody(req);
    const plan = getPlan(planId);
    if (plan.id !== planId) return sendJson(res, 400, { success: false, message: 'Unknown plan.' });
    sessionData.planId = plan.id;
    sessionData.lastFreeCoinGrant = Date.now();
    const user = users.get(sessionData.username);
    if (user) {
      user.planId = plan.id;
      user.lastFreeCoinGrant = sessionData.lastFreeCoinGrant;
    }
    saveStore();
    return sendJson(res, 200, { success: true, planId: plan.id, hourlyFreeCoins: plan.hourlyFreeCoins });
  }

  if (req.method === 'GET' && url.pathname === '/api/chats') {
    const sessionData = getAuthenticatedSession(req);
    if (!sessionData) return sendJson(res, 401, { success: false, message: 'You must be logged in.' });

    const chats = getUserChats(sessionData.username) || [];
    return sendJson(res, 200, {
      chats: chats
        .filter((chat) => chat.title !== 'New chat' || (Array.isArray(chat.messages) && chat.messages.length > 0))
        .map((chat) => {
          const model = catalog.models.find((entry) => entry.space === chat.modelId) || catalog.models[0];
          return {
            id: chat.id,
            title: chat.title,
            modelId: model.space,
            disabled: !canUseModel(sessionData.planId || DEFAULT_PLAN_ID, model),
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt
          };
        })
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/chats') {
    const sessionData = getAuthenticatedSession(req);
    if (!sessionData) return sendJson(res, 401, { success: false, message: 'You must be logged in.' });

    const chats = getUserChats(sessionData.username);
    const now = new Date().toISOString();
    const body = await parseBody(req);
    const selectedModel = catalog.models.find((model) => model.space === body.modelId);
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return sendJson(res, 400, { success: false, message: 'Chat name is required.' });
    const planId = sessionData.planId || DEFAULT_PLAN_ID;
    if (selectedModel && !canUseModel(planId, selectedModel)) {
      return sendJson(res, 403, { success: false, message: 'Your current plan does not unlock this model.' });
    }
    const chat = {
      id: crypto.randomUUID(),
      title: title.slice(0, 80),
      modelId: selectedModel ? selectedModel.space : DEFAULT_MODEL_ID,
      messages: [],
      createdAt: now,
      updatedAt: now
    };
    chats.unshift(chat);
    saveStore();
    return sendJson(res, 201, { success: true, chat });
  }

  const chatMatch = url.pathname.match(/^\/api\/chats\/([^/]+)$/);
  if (req.method === 'GET' && chatMatch) {
    const sessionData = getAuthenticatedSession(req);
    if (!sessionData) return sendJson(res, 401, { success: false, message: 'You must be logged in.' });

    const chat = (getUserChats(sessionData.username) || []).find((entry) => entry.id === chatMatch[1]);
    if (!chat) return sendJson(res, 404, { success: false, message: 'Chat not found.' });
    const model = catalog.models.find((entry) => entry.space === chat.modelId) || catalog.models[0];
    const disabled = !canUseModel(sessionData.planId || DEFAULT_PLAN_ID, model);
    return sendJson(res, 200, { chat: { ...chat, disabled } });
  }

  if (req.method === 'POST' && chatMatch) {
    const sessionData = getAuthenticatedSession(req);
    if (!sessionData) return sendJson(res, 401, { success: false, message: 'You must be logged in.' });

    const chat = (getUserChats(sessionData.username) || []).find((entry) => entry.id === chatMatch[1]);
    if (!chat) return sendJson(res, 404, { success: false, message: 'Chat not found.' });

    const body = await parseBody(req);
    const { messages } = body;
    if (!Array.isArray(messages)) return sendJson(res, 400, { success: false, message: 'Messages must be an array.' });
    chat.messages = messages
      .filter((message) => message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string')
      .map((message) => message.role === 'assistant'
        ? {
            role: message.role,
            content: message.content,
            thinkTime: Number(message.thinkTime),
            generationTime: Number(message.generationTime),
            generatedTokens: Number(message.generatedTokens),
            totalTime: Number(message.totalTime),
            spent: Number(message.spent)
          }
        : { role: message.role, content: message.content });
    chat.updatedAt = new Date().toISOString();
    saveStore();
    return sendJson(res, 200, { success: true, chat });
  }

  if (req.method === 'DELETE' && chatMatch) {
    const sessionData = getAuthenticatedSession(req);
    if (!sessionData) return sendJson(res, 401, { success: false, message: 'You must be logged in.' });

    const chats = getUserChats(sessionData.username) || [];
    const chatIndex = chats.findIndex((entry) => entry.id === chatMatch[1]);
    if (chatIndex === -1) return sendJson(res, 404, { success: false, message: 'Chat not found.' });
    chats.splice(chatIndex, 1);
    saveStore();
    return sendJson(res, 200, { success: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/update-coins') {
    const sessionData = getAuthenticatedSession(req);

    if (!sessionData) {
      return sendJson(res, 401, { success: false, message: 'You must be logged in.' });
    }

    const body = await parseBody(req);
    const hasWalletValues = body.freeSnortzCoins !== undefined || body.purchasedSnortzCoins !== undefined;
    const nextFreeBalance = Number(hasWalletValues ? body.freeSnortzCoins : body.snortzCoins);
    const nextPurchasedBalance = Number(hasWalletValues ? body.purchasedSnortzCoins : 0);
    if (!Number.isFinite(nextFreeBalance) || nextFreeBalance < 0 || !Number.isFinite(nextPurchasedBalance) || nextPurchasedBalance < 0) {
      return sendJson(res, 400, { success: false, message: 'Invalid coin balance.' });
    }

    const roundedFreeBalance = Math.round(nextFreeBalance * 1000) / 1000;
    const roundedPurchasedBalance = Math.round(nextPurchasedBalance * 1000) / 1000;
    const plan = getPlan(sessionData.planId);
    const cappedFreeBalance = Math.min(roundedFreeBalance, plan.coinAllowance);
    sessionData.freeSnortzCoins = cappedFreeBalance;
    sessionData.purchasedSnortzCoins = roundedPurchasedBalance;
    const user = users.get(sessionData.username);
    if (user) {
      user.freeSnortzCoins = cappedFreeBalance;
      user.purchasedSnortzCoins = roundedPurchasedBalance;
    }
    saveStore();

    return sendJson(res, 200, {
      success: true,
      freeSnortzCoins: cappedFreeBalance,
      purchasedSnortzCoins: roundedPurchasedBalance,
      snortzCoins: cappedFreeBalance + roundedPurchasedBalance
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const cookies = parseCookies(req.headers.cookie || '');
    if (cookies.session) {
      sessions.delete(cookies.session);
      saveStore();
    }
    res.setHeader('Set-Cookie', 'session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
    return sendJson(res, 200, { success: true, message: 'Logged out.' });
  }

  if (req.method === 'POST' && url.pathname === '/api/delete-account') {
    const sessionData = getAuthenticatedSession(req);
    if (!sessionData) {
      return sendJson(res, 401, { success: false, message: 'You must be logged in.' });
    }

    const username = sessionData.username;
    users.delete(username);

    const cookies = parseCookies(req.headers.cookie || '');
    if (cookies.session) {
      sessions.delete(cookies.session);
    }
    saveStore();

    res.setHeader('Set-Cookie', 'session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
    return sendJson(res, 200, { success: true, message: 'Account deleted.' });
  }

  if (url.pathname === '/index.html') {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  if (url.pathname === '/views/chat.html') {
    res.writeHead(302, { Location: '/chat' });
    res.end();
    return;
  }

  if (url.pathname === '/views/terms.html') {
    res.writeHead(302, { Location: '/terms' });
    res.end();
    return;
  }

  let requestPath = url.pathname === '/' ? '/index.html' : url.pathname;
  if (url.pathname === '/chat') {
    requestPath = '/views/chat.html';
  }
  if (url.pathname === '/plans') {
    requestPath = '/views/plans.html';
  }
  if (url.pathname === '/admin') {
    requestPath = '/views/admin.html';
  }
  if (url.pathname === '/terms') {
    requestPath = '/views/terms.html';
  }
  if (url.pathname === '/plans.html') {
    res.writeHead(302, { Location: '/plans' });
    res.end();
    return;
  }
  if (url.pathname === '/terms.html') {
    res.writeHead(302, { Location: '/terms' });
    res.end();
    return;
  }

  const safePath = path.normalize(requestPath).replace(/^\.+[\\/]+/, '');
  const filePath = path.join(rootDir, safePath);

  if (!filePath.startsWith(rootDir)) {
    return sendJson(res, 403, { success: false, message: 'Forbidden' });
  }

  if (filePath.endsWith('chat.html') || filePath.endsWith('views/chat.html') || url.pathname === '/chat') {
    if (!getAuthenticatedSession(req)) {
      res.writeHead(302, { Location: '/' });
      res.end();
      return;
    }
  }

  if (filePath.endsWith('plans.html') || filePath.endsWith('views/plans.html') || url.pathname === '/plans') {
    if (!getAuthenticatedSession(req)) {
      res.writeHead(302, { Location: '/' });
      res.end();
      return;
    }
  }

  if (filePath.endsWith('admin.html') || url.pathname === '/admin') {
    const adminKey = url.searchParams.get('key');
    if (!adminKey || adminKey !== adminAccessKey) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Admin access denied.');
      return;
    }
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
      }

      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('500 Internal Server Error');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(port, hostname, () => {
  console.log(`Snortle landing page running at http://${hostname}:${port}`);
});