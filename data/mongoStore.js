const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');
require('dotenv').config();

const dataFile = path.join(__dirname, 'store.json');
let mongoUri = process.env.MONGODB_URI || process.env.MONGODB_URL || process.env.MONGODB_DATABASE_URL || null;
let mongoClient = null;
let mongoDb = null;
let memoryServer = null;

async function startMemoryMongoIfNeeded() {
  if (mongoUri) return mongoUri;

  if (!memoryServer) {
    memoryServer = await MongoMemoryServer.create();
    mongoUri = memoryServer.getUri('snortle');
  }

  return mongoUri;
}

async function getMongoClient() {
  if (!mongoClient) {
    const uri = await startMemoryMongoIfNeeded();
    mongoClient = new MongoClient(uri, {
      family: 4,
      connectTimeoutMS: 15000,
      serverSelectionTimeoutMS: 15000,
      maxPoolSize: 10
    });
  }
  return mongoClient;
}

function readLocalStore() {
  try {
    const store = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    return {
      users: Array.isArray(store.users) ? store.users : [],
      sessions: Array.isArray(store.sessions) ? store.sessions : []
    };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('Could not read local store.json, starting fresh.', error.message);
    }
    return { users: [], sessions: [] };
  }
}

function writeLocalStore(users, sessions) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify({
    users: [...users.values()],
    sessions: [...sessions.entries()].map(([token, data]) => ({ token, data }))
  }, null, 2));
}

async function connectToMongo() {
  if (mongoDb) return mongoDb;

  try {
    const client = await getMongoClient();
    await client.connect();
    const dbName = new URL(mongoUri).pathname.replace(/^\//, '') || 'snortle';
    mongoDb = client.db(dbName);
    await mongoDb.collection('app_state').createIndex({ _id: 1 });
    return mongoDb;
  } catch (error) {
    console.warn('MongoDB connection failed. Falling back to local JSON store.', error.message);
    mongoDb = null;
    return null;
  }
}

async function getPersistedState() {
  const db = await connectToMongo();
  if (!db) return readLocalStore();

  try {
    const collection = db.collection('app_state');
    const doc = await collection.findOne({ _id: 'app_state' });
    if (doc && doc.state) {
      return {
        users: Array.isArray(doc.state.users) ? doc.state.users : [],
        sessions: Array.isArray(doc.state.sessions) ? doc.state.sessions : []
      };
    }
  } catch (error) {
    console.warn('MongoDB state read failed. Falling back to local JSON store.', error.message);
  }

  return readLocalStore();
}

async function persistState(users, sessions) {
  const db = await connectToMongo();
  const payload = {
    users: [...users.values()],
    sessions: [...sessions.entries()].map(([token, data]) => ({ token, data }))
  };

  if (!db) {
    writeLocalStore(users, sessions);
    return;
  }

  try {
    const collection = db.collection('app_state');
    await collection.updateOne(
      { _id: 'app_state' },
      { $set: { state: payload, updatedAt: new Date() } },
      { upsert: true }
    );
  } catch (error) {
    console.warn('MongoDB write failed. Falling back to local JSON store.', error.message);
    writeLocalStore(users, sessions);
  }
}

module.exports = {
  mongoUri: () => mongoUri,
  connectToMongo,
  getPersistedState,
  persistState,
  readLocalStore,
  writeLocalStore,
  startMemoryMongoIfNeeded
};
