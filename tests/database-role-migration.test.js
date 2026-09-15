const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const Database = require('../src/database');

const createLegacyDatabase = (dbPath) => new Promise((resolve, reject) => {
  const legacy = new sqlite3.Database(dbPath, (openError) => {
    if (openError) {
      reject(openError);
      return;
    }
    legacy.serialize(() => {
      legacy.run(
        `CREATE TABLE admin_users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        (schemaError) => {
          if (schemaError) {
            reject(schemaError);
            return;
          }
          legacy.run(
            'INSERT INTO admin_users (id, name, password_hash) VALUES (?, ?, ?), (?, ?, ?)',
            ['admin-id', 'admin', 'salt:hash', 'extra-id', 'Old Extra Admin', 'salt:hash'],
            (insertError) => {
              if (insertError) {
                reject(insertError);
                return;
              }
              legacy.close((closeError) => closeError ? reject(closeError) : resolve());
            }
          );
        }
      );
    });
  });
});

describe('admin role migration', () => {
  const dbPath = path.join(os.tmpdir(), `tt-league-role-migration-${process.pid}-${Date.now()}.db`);
  let database;

  beforeAll(async () => {
    await createLegacyDatabase(dbPath);
    process.env.DB_PATH = dbPath;
    database = new Database();
    await database.initialize();
  });

  afterAll(async () => {
    try {
      await database.close();
    } catch (error) {
      void error;
    }
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rmSync(dbPath + suffix, { force: true });
    }
  });

  test('keeps the admin account, resets its default password, and removes legacy additional admins', async () => {
    const users = await database.all('SELECT name, role, password_hash FROM admin_users ORDER BY name');
    expect(users).toHaveLength(1);
    expect(users[0].name).toBe('admin');
    expect(users[0].role).toBe('admin');

    const [salt, hash] = users[0].password_hash.split(':');
    expect(crypto.scryptSync('bndttadmin', salt, 64).toString('hex')).toBe(hash);
    expect(crypto.scryptSync('123', salt, 64).toString('hex')).not.toBe(hash);
  });

  test('keeps newly created stewards across later initializations', async () => {
    await database.run(
      'INSERT INTO admin_users (id, name, password_hash, role) VALUES (?, ?, ?, ?)',
      ['steward-id', 'New Steward', 'salt:hash', 'steward']
    );
    await database.close();
    await database.initialize();

    const users = await database.all('SELECT name, role FROM admin_users ORDER BY name');
    expect(users).toEqual([
      { name: 'New Steward', role: 'steward' },
      { name: 'admin', role: 'admin' },
    ]);
  });
});
