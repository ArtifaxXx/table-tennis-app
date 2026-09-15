const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const Database = require('./database');
const PlayerManager = require('./models/player');
const MatchManager = require('./models/match');
const LeagueManager = require('./models/league');
const TeamManager = require('./models/team');
const NewsManager = require('./models/news');
const FixtureManager = require('./models/fixture');
const TeamLeagueManager = require('./models/teamLeague');
const TeamSeasonManager = require('./models/teamSeason');
const TeamSeasonDivisionManager = require('./models/teamSeasonDivision');
const { seedDatabase } = require('./seed');
const { populateRealData } = require('./realData');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;
let isSeeding = false;
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// name + password pair -> canonical admin name (or null for invalid credentials)
const adminCredentialCache = new Map();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(String(password), salt, 64).toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [salt, hex] = String(stored || '').split(':');
  if (!salt || !hex) return false;
  const expected = Buffer.from(hex, 'hex');
  const actual = crypto.scryptSync(String(password), salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, try again later' },
});

const trackLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});
let visitorLogDate = new Date().toISOString().slice(0, 10);
const visitorLogCache = new Set();

// Middleware
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  const originalEnd = res.end;
  res.end = function (...args) {
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;
    try {
      if (!res.headersSent) {
        res.setHeader('X-Server-Time-Ms', ms.toFixed(2));
      }
    } catch (e) {
      // ignore
    }
    return originalEnd.apply(this, args);
  };
  next();
});

app.use((req, res, next) => {
  if (req.path && req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

app.use(async (req, res, next) => {
  try {
    req.role = 'viewer';
    req.actorName = null;

    const headerName = req.get('X-Admin-Name');
    const password = req.get('X-Admin-Password');
    const name = headerName ? headerName.trim().slice(0, 60) : '';
    if (!name || !password) return next();

    const cacheKey = JSON.stringify([name, password]);
    let identity = adminCredentialCache.get(cacheKey);
    if (identity === undefined) {
      const user = await db.get(
        'SELECT name, password_hash, role FROM admin_users WHERE active = 1 AND lower(name) = lower(?)',
        [name]
      );
      identity = user && verifyPassword(password, user.password_hash)
        ? { name: user.name, role: user.role }
        : null;
      adminCredentialCache.set(cacheKey, identity);
    }
    if (identity) {
      req.role = identity.role;
      req.actorName = identity.name;
    }
    return next();
  } catch (error) {
    return next(error);
  }
});

app.use(helmet());
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use((req, res, next) => {
  if (!shouldLogVisit(req)) return next();
  const dateKey = resetVisitorLogCacheIfNeeded();
  const visitorKey = `${dateKey}:${req.ip}:${req.get('user-agent') || ''}`;
  if (visitorLogCache.has(visitorKey)) return next();
  visitorLogCache.add(visitorKey);
  void logActivity({
    eventType: 'visit',
    action: 'page_view',
    entity: 'site',
    details: { path: req.originalUrl },
    req,
  });
  return next();
});

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/') || !WRITE_METHODS.has(req.method)) return next();
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const meta = parseEntityFromPath(req.path);
    if (!meta) return;
    const action = meta.actionSuffix ? `${req.method}:${meta.actionSuffix}` : req.method;
    void logActivity({
      eventType: 'edit',
      action,
      entity: meta.entity,
      entityId: meta.entityId,
      details: { path: req.originalUrl, role: req.role },
      req,
    });
  });
  return next();
});

// Initialize database
const db = new Database();
const playerManager = new PlayerManager(db);
const matchManager = new MatchManager(db);
const leagueManager = new LeagueManager(db);
const teamManager = new TeamManager(db);
const newsManager = new NewsManager(db);
const fixtureManager = new FixtureManager(db);
const teamLeagueManager = new TeamLeagueManager(db);
const teamSeasonManager = new TeamSeasonManager(db);
const teamSeasonDivisionManager = new TeamSeasonDivisionManager(db);

function resetVisitorLogCacheIfNeeded() {
  const nextDate = new Date().toISOString().slice(0, 10);
  if (nextDate !== visitorLogDate) {
    visitorLogDate = nextDate;
    visitorLogCache.clear();
  }
  return visitorLogDate;
}

function shouldLogVisit(req) {
  if (req.method !== 'GET') return false;
  if (req.path && req.path.startsWith('/api/')) return false;
  const accept = req.get('accept') || '';
  const extension = path.extname(req.path || '');
  if (extension && !accept.includes('text/html')) return false;
  return accept.includes('text/html') || !extension;
}

function parseEntityFromPath(pathname) {
  const trimmed = pathname.replace(/^\/api\//, '');
  if (!trimmed) return null;
  const [entity, entityId, actionSuffix] = trimmed.split('/');
  if (!entity || entity === 'auth' || entity === 'track') return null;
  return {
    entity,
    entityId: entityId || null,
    actionSuffix: actionSuffix || null,
  };
}

async function logActivity({ eventType, action, entity, entityId, details, req, actor }) {
  try {
    const payload = details ? JSON.stringify(details) : null;
    const actorName = actor || req?.actorName || req?.role || null;
    await db.run(
      `INSERT INTO activity_logs (event_type, action, actor, entity, entity_id, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventType,
        action || null,
        actorName,
        entity || null,
        entityId || null,
        payload,
        req?.ip || null,
        req?.get('user-agent') || null,
      ]
    );
  } catch (error) {
    console.warn('Activity log failed:', error.message);
  }
}

async function resolveTeamSeasonId(req) {
  if (req.query && req.query.seasonId) return req.query.seasonId;
  if (req.body && req.body.team_season_id) return req.body.team_season_id;
  const active = await teamSeasonManager.getActiveSeason();
  return active ? active.id : null;
}

async function resolveDivisionId(req, teamSeasonId) {
  if (req.query && req.query.divisionId) return req.query.divisionId;
  if (req.body && req.body.division_id) return req.body.division_id;
  if (req.body && req.body.divisionId) return req.body.divisionId;

  if (!teamSeasonId) return null;
  const d = await teamSeasonDivisionManager.getDefaultDivisionForSeason(teamSeasonId);
  return d ? d.id : null;
}

function requireAdmin(req, res, next) {
  if (req.role === 'admin') return next();
  return res.status(403).json({ error: 'Admin access required' });
}

function requireEditor(req, res, next) {
  if (req.role === 'admin' || req.role === 'steward') return next();
  return res.status(403).json({ error: 'Steward or admin access required' });
}

function requireSeedToken(req, res, next) {
  const expected = process.env.SEED_TOKEN;
  if (!expected) return next();

  const token = req.get('X-Seed-Token');
  if (!token || token !== expected) {
    return res.status(403).json({ error: 'Invalid seed token' });
  }
  return next();
}

// API Routes
app.get('/api/auth/role', async (req, res) => {
  res.json({ role: req.role || 'viewer', name: req.role !== 'viewer' ? req.actorName : null });
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const name = req.body && typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 60) : '';
    const password = req.body && typeof req.body.password === 'string' ? req.body.password : '';
    const user = name && password
      ? await db.get(
          'SELECT name, password_hash, role FROM admin_users WHERE active = 1 AND lower(name) = lower(?)',
          [name]
        )
      : null;
    const ok = !!(user && verifyPassword(password, user.password_hash));

    await logActivity({
      eventType: 'auth',
      action: ok ? 'login' : 'login_failed',
      entity: 'auth',
      details: { name: name || null },
      req,
      actor: ok ? user.name : name || 'viewer',
    });

    if (!ok) return res.status(401).json({ role: 'viewer' });
    adminCredentialCache.set(JSON.stringify([name, password]), { name: user.name, role: user.role });
    return res.json({ role: user.role, name: user.name });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  const name = req.body && typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 60) : '';
  await logActivity({
    eventType: 'auth',
    action: 'logout',
    entity: 'auth',
    req,
    actor: name || req.actorName || req.role,
  });
  res.json({ ok: true });
});

app.post('/api/track', trackLimiter, async (req, res) => {
  const pagePath = req.body && typeof req.body.path === 'string' ? req.body.path.slice(0, 300) : null;
  if (pagePath && pagePath.startsWith('/') && !pagePath.startsWith('//')) {
    const dateKey = resetVisitorLogCacheIfNeeded();
    const visitorKey = `${dateKey}:${req.ip}:${req.get('user-agent') || ''}:${pagePath}`;
    if (!visitorLogCache.has(visitorKey)) {
      visitorLogCache.add(visitorKey);
      void logActivity({
        eventType: 'visit',
        action: 'page_view',
        entity: 'site',
        details: { path: pagePath },
        req,
      });
    }
  }
  res.json({ ok: true });
});

app.get('/api/admin/activity-logs', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const where = [];
    const params = [];

    if (req.query.eventType) {
      where.push('event_type = ?');
      params.push(req.query.eventType);
    }
    if (req.query.entity) {
      where.push('entity = ?');
      params.push(req.query.entity);
    }
    if (req.query.actor) {
      where.push('actor = ?');
      params.push(req.query.actor);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await db.all(
      `SELECT id, event_type, action, actor, entity, entity_id, details, ip_address, user_agent, created_at
       FROM activity_logs ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json(
      rows.map((row) => ({
        ...row,
        details: row.details ? JSON.parse(row.details) : null,
      }))
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/auth/admin-password', requireEditor, async (req, res) => {
  try {
    const nextPassword = req.body && typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
    if (!nextPassword || !nextPassword.trim()) {
      throw new Error('newPassword is required');
    }
    if (nextPassword.trim().length < 3) {
      throw new Error('Password must be at least 3 characters');
    }
    if (!req.actorName) {
      throw new Error('No privileged account associated with this session');
    }

    await db.run(
      'UPDATE admin_users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?',
      [hashPassword(nextPassword.trim()), req.actorName]
    );
    adminCredentialCache.clear();

    await logActivity({
      eventType: 'auth',
      action: 'password_change',
      entity: 'auth',
      req,
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const rows = await db.all(
      'SELECT id, name, role, created_at FROM admin_users WHERE active = 1 ORDER BY role, name'
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const name = req.body && typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 60) : '';
    const password = req.body && typeof req.body.password === 'string' ? req.body.password.trim() : '';
    if (!name) throw new Error('name is required');
    if (password.length < 3) throw new Error('Password must be at least 3 characters');

    const existing = await db.get('SELECT id FROM admin_users WHERE lower(name) = lower(?)', [name]);
    if (existing) throw new Error('An account with that name already exists');

    await db.run(
      'INSERT INTO admin_users (id, name, password_hash, role) VALUES (?, ?, ?, ?)',
      [uuidv4(), name, hashPassword(password), 'steward']
    );
    adminCredentialCache.clear();
    await logActivity({
      eventType: 'edit',
      action: 'create_steward',
      entity: 'admin_users',
      details: { name, role: 'steward' },
      req,
    });
    res.json({ ok: true, role: 'steward' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const password = req.body && typeof req.body.password === 'string' ? req.body.password.trim() : '';
    if (password.length < 3) throw new Error('Password must be at least 3 characters');

    const target = await db.get("SELECT id, name FROM admin_users WHERE id = ? AND role = 'steward'", [req.params.id]);
    if (!target) throw new Error('Steward not found');

    await db.run(
      'UPDATE admin_users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [hashPassword(password), target.id]
    );
    adminCredentialCache.clear();
    await logActivity({
      eventType: 'edit',
      action: 'reset_steward_password',
      entity: 'admin_users',
      entityId: target.id,
      details: { name: target.name },
      req,
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const target = await db.get("SELECT id, name FROM admin_users WHERE id = ? AND role = 'steward'", [req.params.id]);
    if (!target) throw new Error('Steward not found');

    await db.run('DELETE FROM admin_users WHERE id = ?', [target.id]);
    adminCredentialCache.clear();
    await logActivity({
      eventType: 'edit',
      action: 'delete_steward',
      entity: 'admin_users',
      entityId: target.id,
      details: { name: target.name },
      req,
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/admin/database-backup', requireEditor, async (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `league-backup-${timestamp}.db`;
  const backupPath = path.join(os.tmpdir(), `${crypto.randomUUID()}-${filename}`);

  try {
    await logActivity({
      eventType: 'admin',
      action: 'download_database_backup',
      entity: 'database',
      req,
    });
    await db.backup(backupPath);
    res.download(backupPath, filename, (error) => {
      fs.rm(backupPath, { force: true }, () => {});
      if (error && !res.headersSent) {
        res.status(500).json({ error: error.message });
      }
    });
  } catch (error) {
    fs.rm(backupPath, { force: true }, () => {});
    res.status(500).json({ error: error.message });
  }
});

app.post(
  '/api/admin/database-restore',
  requireAdmin,
  express.raw({ type: 'application/octet-stream', limit: '50mb' }),
  async (req, res) => {
    if (isSeeding) {
      return res.status(409).json({ error: 'Database operation already in progress' });
    }

    const uploadPath = path.join(os.tmpdir(), `${crypto.randomUUID()}-restore-upload.db`);
    const rollbackPath = path.join(os.tmpdir(), `${crypto.randomUUID()}-restore-rollback.db`);
    const databasePath = db.dbPath || path.join(__dirname, '../data/league.db');
    const walPath = `${databasePath}-wal`;
    const shmPath = `${databasePath}-shm`;
    let databaseClosed = false;
    let rollbackReady = false;
    isSeeding = true;

    try {
      if (!Buffer.isBuffer(req.body) || req.body.length < 16 || req.body.subarray(0, 16).toString() !== 'SQLite format 3\u0000') {
        const error = new Error('Select a valid SQLite database backup');
        error.statusCode = 400;
        throw error;
      }

      fs.writeFileSync(uploadPath, req.body);
      const validation = await db.validateBackup(uploadPath, req.actorName);
      const password = req.get('X-Admin-Password') || '';
      if (!validation.admin || !verifyPassword(password, validation.admin.password_hash)) {
        const error = new Error('Your current admin credentials must exist in the selected backup');
        error.statusCode = 400;
        throw error;
      }

      await db.close();
      databaseClosed = true;
      fs.copyFileSync(databasePath, rollbackPath);
      rollbackReady = true;
      fs.copyFileSync(uploadPath, databasePath);
      if (fs.existsSync(walPath)) fs.rmSync(walPath);
      if (fs.existsSync(shmPath)) fs.rmSync(shmPath);
      await db.initialize();
      databaseClosed = false;
      adminCredentialCache.clear();

      await logActivity({
        eventType: 'admin',
        action: 'restore_database_backup',
        entity: 'database',
        details: { size: req.body.length },
        req,
      });
      fs.rmSync(rollbackPath, { force: true });
      rollbackReady = false;
      res.json({ ok: true });
    } catch (error) {
      if (databaseClosed) {
        try {
          await db.close();
        } catch (closeError) {
          void closeError;
        }
        try {
          if (rollbackReady) fs.copyFileSync(rollbackPath, databasePath);
          if (fs.existsSync(walPath)) fs.rmSync(walPath);
          if (fs.existsSync(shmPath)) fs.rmSync(shmPath);
          await db.initialize();
          databaseClosed = false;
        } catch (recoveryError) {
          console.error('Database restore recovery failed:', recoveryError);
        }
      }
      res.status(error.statusCode || 500).json({ error: error.message });
    } finally {
      fs.rmSync(uploadPath, { force: true });
      if (!databaseClosed) fs.rmSync(rollbackPath, { force: true });
      isSeeding = false;
    }
  }
);

app.post('/api/admin/restore-prem-snapshot', requireAdmin, async (req, res) => {
  if (isSeeding) {
    return res.status(409).json({ error: 'Seed already in progress' });
  }

  isSeeding = true;
  try {
    let preservedNews = [];
    let preservedPinnedId = null;
    try {
      preservedNews = await newsManager.getAllNews();
      preservedPinnedId = preservedNews.find((item) => item.pinned)?.id || null;
    } catch (error) {
      console.warn('Unable to preserve news before restore:', error.message);
      preservedNews = [];
    }

    const dbPath = db.dbPath || path.join(__dirname, '../data/league.db');
    const dataDir = path.dirname(dbPath);
    const candidateSnapshotDirs = [
      process.env.PREM_SNAPSHOT_DIR ? path.resolve(process.env.PREM_SNAPSHOT_DIR) : null,
      path.join(process.cwd(), 'seed-snapshots', 'prem-division'),
      path.join(dataDir, 'seed-snapshots', 'prem-division'),
      path.join(__dirname, '../data/seed-snapshots/prem-division'),
      path.join(process.cwd(), 'data', 'seed-snapshots', 'prem-division'),
    ].filter(Boolean);

    const snapshotDir = candidateSnapshotDirs.find((dir) => fs.existsSync(path.join(dir, 'league.db')))
      || candidateSnapshotDirs[0];
    const srcDb = path.join(snapshotDir, 'league.db');
    const srcWal = path.join(snapshotDir, 'league.db-wal');
    const srcShm = path.join(snapshotDir, 'league.db-shm');
    const destDb = path.join(dataDir, 'league.db');
    const destWal = path.join(dataDir, 'league.db-wal');
    const destShm = path.join(dataDir, 'league.db-shm');

    if (!fs.existsSync(srcDb)) {
      throw new Error(
        `Premier Division snapshot not found. Looked in: ${candidateSnapshotDirs.join(', ')}. ` +
          'Run npm run save-prem-snapshot or set PREM_SNAPSHOT_DIR.'
      );
    }

    await db.close();

    fs.copyFileSync(srcDb, destDb);

    const walCopied = fs.existsSync(srcWal) ? (fs.copyFileSync(srcWal, destWal), true) : false;
    const shmCopied = fs.existsSync(srcShm) ? (fs.copyFileSync(srcShm, destShm), true) : false;

    if (!walCopied && fs.existsSync(destWal)) fs.rmSync(destWal);
    if (!shmCopied && fs.existsSync(destShm)) fs.rmSync(destShm);

    await db.initialize();

    if (preservedNews.length > 0) {
      for (const item of preservedNews) {
        await db.run(
          `INSERT OR IGNORE INTO news (id, title, body, pinned, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            item.id,
            item.title,
            item.body,
            item.pinned ? 1 : 0,
            item.created_at,
            item.updated_at || item.created_at,
          ]
        );
      }

      if (preservedPinnedId) {
        await db.run('UPDATE news SET pinned = 0');
        await db.run('UPDATE news SET pinned = 1 WHERE id = ?', [preservedPinnedId]);
      }
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    isSeeding = false;
  }
});

app.post('/api/admin/populate-real', requireEditor, requireSeedToken, async (req, res) => {
  if (isSeeding) {
    return res.status(409).json({ error: 'Seed already in progress' });
  }

  isSeeding = true;
  try {
    console.log('Admin real-data populate started');
    const popDb = new Database();
    await popDb.initialize();
    try {
      const seasonName = req.body && typeof req.body.seasonName === 'string' ? req.body.seasonName : null;
      const result = await populateRealData(popDb, { seasonName });
      res.json(result);
    } finally {
      await popDb.close();
    }
    console.log('Admin real-data populate completed');
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    isSeeding = false;
  }
});

app.post('/api/admin/seed', requireEditor, requireSeedToken, async (req, res) => {
  if (isSeeding) {
    return res.status(409).json({ error: 'Seed already in progress' });
  }

  isSeeding = true;
  try {
    console.log('Admin seed started');
    const seedDb = new Database();
    await seedDb.initialize();
    try {
      await seedDatabase(seedDb);
    } finally {
      await seedDb.close();
    }
    console.log('Admin seed completed');
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    isSeeding = false;
  }
});

app.get('/api/news', async (req, res) => {
  try {
    const news = await newsManager.getAllNews();
    res.json(news);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/news', requireEditor, async (req, res) => {
  try {
    const item = await newsManager.createNews(req.body);
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/news/:id', requireEditor, async (req, res) => {
  try {
    const item = await newsManager.updateNews(req.params.id, req.body);
    res.json(item);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/news/:id', requireEditor, async (req, res) => {
  try {
    await newsManager.deleteNews(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/news/:id/pin', requireEditor, async (req, res) => {
  try {
    await newsManager.pinNews(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/news/:id/unpin', requireEditor, async (req, res) => {
  try {
    await newsManager.unpinNews(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/players', async (req, res) => {
  try {
    const players = await playerManager.getAllPlayers();
    res.json(players);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/players', requireEditor, async (req, res) => {
  try {
    const player = await playerManager.createPlayer(req.body);
    res.status(201).json(player);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/players/:id', async (req, res) => {
  try {
    const player = await playerManager.getPlayerById(req.params.id);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    res.json(player);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/players/:id', requireEditor, async (req, res) => {
  try {
    const player = await playerManager.updatePlayer(req.params.id, req.body);
    res.json(player);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/players/:id', requireEditor, async (req, res) => {
  try {
    await playerManager.deletePlayer(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Team League Routes
app.get('/api/team-seasons', async (req, res) => {
  try {
    const seasons = await teamSeasonManager.getAllSeasons();
    res.json(seasons);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/team-seasons/active', async (req, res) => {
  try {
    const season = await teamSeasonManager.getActiveSeason();
    res.json(season || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/team-seasons', requireAdmin, async (req, res) => {
  try {
    const season = await teamSeasonManager.createSeason(req.body);
    res.status(201).json(season);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/team-seasons/:id/start', requireAdmin, async (req, res) => {
  try {
    const season = await teamSeasonManager.startSeason(req.params.id);
    res.json(season);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/team-seasons/:id/stop', requireAdmin, async (req, res) => {
  try {
    const season = await teamSeasonManager.stopSeason(req.params.id);
    res.json(season);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/team-seasons/:id/reopen', requireAdmin, async (req, res) => {
  try {
    const season = await teamSeasonManager.reopenSeason(req.params.id);
    res.json(season);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/team-seasons/:id', requireAdmin, async (req, res) => {
  try {
    const result = await teamSeasonManager.deleteSeason(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/teams', async (req, res) => {
  try {
    const includeInactive = req.query && (req.query.includeInactive === '1' || req.query.includeInactive === 'true');
    const teams = await teamManager.getAllTeams({ includeInactive });
    res.json(teams);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/teams', requireEditor, async (req, res) => {
  try {
    const team = await teamManager.createTeam(req.body);
    res.status(201).json(team);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/teams/:id', async (req, res) => {
  try {
    const team = await teamManager.getTeamById(req.params.id);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }
    res.json(team);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/teams/:id', requireEditor, async (req, res) => {
  try {
    const team = await teamManager.updateTeam(req.params.id, req.body);
    res.json(team);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/teams/:id', requireEditor, async (req, res) => {
  try {
    await teamManager.deleteTeam(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/teams/:id/roster', requireEditor, async (req, res) => {
  try {
    const roster = await teamManager.setTeamRoster(req.params.id, req.body);
    res.json(roster);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/team-seasons/:seasonId/divisions', async (req, res) => {
  try {
    const divisions = await teamSeasonDivisionManager.getDivisionsBySeason(req.params.seasonId);
    res.json(divisions);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/team-seasons/:seasonId/divisions', requireEditor, async (req, res) => {
  try {
    const division = await teamSeasonDivisionManager.createDivision(req.params.seasonId, req.body);
    res.status(201).json(division);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/divisions/:divisionId', requireEditor, async (req, res) => {
  try {
    const division = await teamSeasonDivisionManager.updateDivision(req.params.divisionId, req.body);
    res.json(division);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/divisions/:divisionId', requireEditor, async (req, res) => {
  try {
    const result = await teamSeasonDivisionManager.deleteDivision(req.params.divisionId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/divisions/:divisionId/teams', async (req, res) => {
  try {
    const teams = await teamSeasonDivisionManager.getDivisionTeams(req.params.divisionId);
    res.json(teams);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/divisions/:divisionId/teams', requireEditor, async (req, res) => {
  try {
    const teams = await teamSeasonDivisionManager.setDivisionTeams(req.params.divisionId, req.body.teamIds);
    res.json(teams);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/fixtures', async (req, res) => {
  try {
    const seasonId = await resolveTeamSeasonId(req);
    const divisionId = await resolveDivisionId(req, seasonId);
    const fixtures = seasonId ? await fixtureManager.getAllFixtures(seasonId, divisionId) : [];
    res.json(fixtures);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/fixtures/counts-by-season', async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT ts.id as team_season_id,
              COUNT(f.id) as fixture_count
       FROM team_seasons ts
       LEFT JOIN fixtures f ON f.team_season_id = ts.id
       GROUP BY ts.id`,
      []
    );

    const counts = {};
    for (const r of rows) {
      counts[r.team_season_id] = r.fixture_count;
    }
    res.json(counts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/fixtures', requireEditor, async (req, res) => {
  try {
    const team_season_id = await resolveTeamSeasonId(req);
    if (!team_season_id) {
      throw new Error('No active season. Create and start a season first.');
    }

    const division_id = await resolveDivisionId(req, team_season_id);
    if (!division_id) {
      throw new Error('division_id is required');
    }

    const fixture = await fixtureManager.createFixture({
      ...req.body,
      team_season_id,
      division_id,
    });
    res.status(201).json(fixture);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/fixtures/:id', async (req, res) => {
  try {
    const fixture = await fixtureManager.getFixtureById(req.params.id);
    if (!fixture) {
      return res.status(404).json({ error: 'Fixture not found' });
    }
    res.json(fixture);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/fixtures/:id', requireEditor, async (req, res) => {
  try {
    const { match_date } = req.body;
    if (!match_date) {
      throw new Error('match_date is required');
    }
    const updated = await fixtureManager.updateFixtureDate(req.params.id, match_date);
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/fixtures/generate-schedule/preview', requireEditor, async (req, res) => {
  try {
    const team_season_id = (req.body && req.body.team_season_id) ? req.body.team_season_id : null;
    if (!team_season_id) {
      throw new Error('team_season_id is required');
    }

    const season = await teamSeasonManager.getSeasonById(team_season_id);
    if (!season) {
      throw new Error('Season not found');
    }

    const scheduleStartDate = (req.body && req.body.schedule_start_date) ? req.body.schedule_start_date : season.schedule_start_date;
    const scheduleEndDate = (req.body && req.body.schedule_end_date) ? req.body.schedule_end_date : season.schedule_end_date;

    const warnings = [];
    if (!scheduleStartDate || !scheduleEndDate) {
      warnings.push('Season schedule window is not set (start/end dates).');
    }

    const divisions = await teamSeasonDivisionManager.getDivisionsBySeason(team_season_id);
    if (!divisions || divisions.length === 0) {
      warnings.push('No divisions configured for this season.');
    }

    const perDivision = [];
    let totalFixtures = 0;
    let totalCupFixtures = 0;

    for (const d of (divisions || [])) {
      const teamIds = await teamSeasonDivisionManager.getTeamIdsForDivision(d.id);
      const teamCount = Array.isArray(teamIds) ? teamIds.length : 0;

      // Double round robin: each pair plays twice => n*(n-1)
      const fixtureCount = teamCount >= 2 ? (teamCount * (teamCount - 1)) : 0;
      const cupFixtureCount = teamCount >= 2 ? (teamCount - 1) : 0;
      if (teamCount < 2) {
        warnings.push(`Division "${d.name}" has fewer than 2 teams and will be skipped.`);
      }

      totalFixtures += fixtureCount + cupFixtureCount;
      totalCupFixtures += cupFixtureCount;
      perDivision.push({
        division_id: d.id,
        division_name: d.name,
        team_count: teamCount,
        fixture_count: fixtureCount,
        cup_fixture_count: cupFixtureCount,
        total_fixture_count: fixtureCount + cupFixtureCount,
      });
    }

    if (totalFixtures === 0) {
      warnings.push('No fixtures would be generated. Ensure each division has at least 2 teams.');
    }

    res.json({
      team_season_id,
      schedule_start_date: scheduleStartDate || null,
      schedule_end_date: scheduleEndDate || null,
      divisions: perDivision,
      total_fixtures: totalFixtures,
      total_cup_fixtures: totalCupFixtures,
      warnings,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/fixtures/generate-schedule', requireEditor, async (req, res) => {
  try {
    const team_season_id = (req.body && req.body.team_season_id) ? req.body.team_season_id : null;
    if (!team_season_id) {
      throw new Error('team_season_id is required');
    }

    const season = await teamSeasonManager.getSeasonById(team_season_id);
    if (!season) {
      throw new Error('Season not found');
    }

    const scheduleStartDate = (req.body && req.body.schedule_start_date) ? req.body.schedule_start_date : season.schedule_start_date;
    const scheduleEndDate = (req.body && req.body.schedule_end_date) ? req.body.schedule_end_date : season.schedule_end_date;
    if (!scheduleStartDate || !scheduleEndDate) {
      throw new Error('Season schedule window is not set. Provide schedule_start_date and schedule_end_date.');
    }

    const divisions = await teamSeasonDivisionManager.getDivisionsBySeason(team_season_id);
    if (!divisions || divisions.length === 0) {
      throw new Error('No divisions configured for this season');
    }

    const allFixtures = [];
    for (const d of divisions) {
      const teamIds = await teamSeasonDivisionManager.getTeamIdsForDivision(d.id);
      if (!teamIds || teamIds.length < 2) {
        continue;
      }
      const fixtures = await fixtureManager.generateDoubleRoundRobinSchedule({
        ...(req.body || {}),
        team_season_id,
        division_id: d.id,
        teamIds,
        schedule_start_date: scheduleStartDate,
        schedule_end_date: scheduleEndDate,
      });
      allFixtures.push(...fixtures);

      // Also generate a cup draw + fixtures for this division.
      await fixtureManager.generateDivisionCup({
        ...(req.body || {}),
        team_season_id,
        division_id: d.id,
        teamIds,
        schedule_start_date: scheduleStartDate,
        schedule_end_date: scheduleEndDate,
      });
    }

    if (allFixtures.length === 0) {
      throw new Error('No fixtures generated. Ensure each division has at least 2 teams.');
    }

    await teamSeasonManager.setSeasonReady(team_season_id);
    res.json(allFixtures);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/cups/division', async (req, res) => {
  try {
    const seasonId = await resolveTeamSeasonId(req);
    const divisionId = await resolveDivisionId(req, seasonId);
    if (!seasonId || !divisionId) {
      return res.json(null);
    }
    const cup = await fixtureManager.getDivisionCup(seasonId, divisionId);
    res.json(cup);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/fixtures/:id/lineups/:side', requireEditor, async (req, res) => {
  try {
    await fixtureManager.setLineup(req.params.id, req.params.side, req.body.playerIds);
    const fixture = await fixtureManager.getFixtureById(req.params.id);
    res.json(fixture);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/fixtures/:id/matches/:matchNumber/games', requireEditor, async (req, res) => {
  try {
    const fixture = await fixtureManager.setMatchGames(req.params.id, parseInt(req.params.matchNumber, 10), req.body.games);
    res.json(fixture);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/fixtures/:id/matches/games', requireEditor, async (req, res) => {
  try {
    const fixture = await fixtureManager.setFixtureMatchGames(req.params.id, req.body.matches);
    res.json(fixture);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/fixtures/:id/forfeit', requireEditor, async (req, res) => {
  try {
    const winner_team_id = req.body && req.body.winner_team_id ? req.body.winner_team_id : null;
    if (!winner_team_id) {
      throw new Error('winner_team_id is required');
    }
    const fixture = await fixtureManager.forfeitFixture(req.params.id, winner_team_id);
    res.json(fixture);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/team-standings', async (req, res) => {
  try {
    const seasonId = await resolveTeamSeasonId(req);
    const divisionId = await resolveDivisionId(req, seasonId);
    const standings = await teamLeagueManager.getStandings(seasonId, divisionId);
    res.json(standings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/player-rankings', async (req, res) => {
  try {
    const seasonId = await resolveTeamSeasonId(req);
    const divisionId = await resolveDivisionId(req, seasonId);
    const rankings = await teamLeagueManager.getPlayerRankings(seasonId, divisionId);
    res.json(rankings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const explicitSeasonId = req.query && req.query.seasonId ? req.query.seasonId : null;
    const rawDivisionId = req.query && req.query.divisionId ? req.query.divisionId : null;
    const explicitDivisionId = rawDivisionId === 'all' ? null : rawDivisionId;
    let season = null;

    if (!explicitSeasonId && explicitDivisionId) {
      const d = await teamSeasonDivisionManager.getDivisionById(explicitDivisionId);
      if (d) {
        season = await teamSeasonManager.getSeasonById(d.team_season_id);
      }
    }

    if (!season && explicitSeasonId) {
      season = await teamSeasonManager.getSeasonById(explicitSeasonId);
    } else if (!season) {
      season = await teamSeasonManager.getActiveSeason();
      if (!season) {
        season = await teamSeasonManager.getLatestCompletedSeason();
      }
    }

    const divisionId = rawDivisionId === 'all'
      ? null
      : (explicitDivisionId || (season ? await resolveDivisionId(req, season.id) : null));

    const division = divisionId ? await teamSeasonDivisionManager.getDivisionById(divisionId) : null;

    const stats = await teamLeagueManager.getDashboardStatistics(season?.id, divisionId);
    res.json({
      ...stats,
      currentSeason: season ? { id: season.id, name: season.name, status: season.status } : null,
      currentDivision: divisionId ? { id: divisionId, name: division?.name || null } : null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/matches', async (req, res) => {
  try {
    const matches = await matchManager.getAllMatches();
    res.json(matches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/matches', requireEditor, async (req, res) => {
  try {
    const match = await matchManager.createMatch(req.body);
    res.status(201).json(match);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/matches/:id', async (req, res) => {
  try {
    const match = await matchManager.getMatchById(req.params.id);
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }
    res.json(match);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/matches/:id', requireEditor, async (req, res) => {
  try {
    const match = await matchManager.updateMatch(req.params.id, req.body);
    res.json(match);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/standings', async (req, res) => {
  try {
    const standings = await leagueManager.getStandings();
    res.json(standings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/statistics', async (req, res) => {
  try {
    const statistics = await leagueManager.getStatistics();
    res.json(statistics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/schedule', requireEditor, async (req, res) => {
  try {
    const schedule = await leagueManager.generateSchedule();
    res.json(schedule);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve static files from React app (production only)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

// Initialize database. The exported promise lets tests wait for readiness;
// the HTTP listener only starts when this file is run directly.
const ready = db.initialize().then(() => {
  console.log('Database initialized successfully');
});

if (require.main === module) {
  ready
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Table Tennis League API running on port ${PORT}`);
      });
    })
    .catch((error) => {
      console.error('Failed to start server:', error);
      process.exit(1);
    });
}

module.exports = app;
module.exports.ready = ready;
module.exports.db = db;
