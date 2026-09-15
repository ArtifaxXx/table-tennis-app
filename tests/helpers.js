const os = require('os');
const path = require('path');
const fs = require('fs');

/**
 * Boots the Express app against a fresh temporary SQLite database.
 * Each test file gets its own module registry, so every call to this
 * helper yields an isolated app + database pair.
 *
 * Returns { app, db, dbPath, cleanup }.
 */
async function createTestApp(suiteName) {
  const dbPath = path.join(
    os.tmpdir(),
    `tt-league-test-${suiteName}-${process.pid}-${Date.now()}.db`
  );
  process.env.DB_PATH = dbPath;

  const app = require('../src/index');
  await app.ready;

  const db = app.db;

  const cleanup = async () => {
    try {
      await db.close();
    } catch (e) {
      // ignore
    }
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.rmSync(dbPath + suffix, { force: true });
      } catch (e) {
        // ignore
      }
    }
  };

  return { app, db, dbPath, cleanup };
}

const ADMIN = { name: 'admin', password: 'bndttadmin' };

function adminHeaders(overrides = {}) {
  return {
    'X-Admin-Name': overrides.name || ADMIN.name,
    'X-Admin-Password': overrides.password || ADMIN.password,
  };
}

module.exports = { createTestApp, adminHeaders, ADMIN };
