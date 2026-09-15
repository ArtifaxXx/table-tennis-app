const request = require('supertest');
const { createTestApp, adminHeaders } = require('./helpers');

const binaryParser = (res, callback) => {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

describe('database backup and snapshot restore', () => {
  let app;
  let db;
  let cleanup;
  let backupBuffer;

  beforeAll(async () => {
    ({ app, db, cleanup } = await createTestApp('backup'));
  });

  afterAll(async () => {
    delete process.env.SEED_TOKEN;
    await cleanup();
  });

  test('backup download requires admin access', async () => {
    const res = await request(app).get('/api/admin/database-backup');
    expect(res.status).toBe(403);
  });

  test('admin can download a valid SQLite backup', async () => {
    const res = await request(app)
      .get('/api/admin/database-backup')
      .set(adminHeaders())
      .buffer(true)
      .parse(binaryParser);

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="league-backup-.*\.db"/);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.subarray(0, 16).toString()).toBe('SQLite format 3\u0000');
    backupBuffer = res.body;

    const event = await db.get(
      "SELECT actor, action FROM activity_logs WHERE action = 'download_database_backup' ORDER BY id DESC LIMIT 1"
    );
    expect(event).toEqual({ actor: 'admin', action: 'download_database_backup' });
  });

  test('backup restore requires admin access', async () => {
    const res = await request(app).post('/api/admin/database-restore');
    expect(res.status).toBe(403);
  });

  test('backup restore rejects invalid files without affecting the live database', async () => {
    const res = await request(app)
      .post('/api/admin/database-restore')
      .set(adminHeaders())
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('not a sqlite database'));
    expect(res.status).toBe(400);

    const row = await db.get('SELECT COUNT(*) AS count FROM admin_users');
    expect(row.count).toBeGreaterThan(0);
  });

  test('backup restore prevents the current administrator from being locked out', async () => {
    const changedPassword = 'changed-after-backup';
    const change = await request(app)
      .put('/api/auth/admin-password')
      .set(adminHeaders())
      .send({ newPassword: changedPassword });
    expect(change.status).toBe(200);

    const res = await request(app)
      .post('/api/admin/database-restore')
      .set(adminHeaders({ password: changedPassword }))
      .set('Content-Type', 'application/octet-stream')
      .send(backupBuffer);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/current admin credentials/i);

    const restorePassword = await request(app)
      .put('/api/auth/admin-password')
      .set(adminHeaders({ password: changedPassword }))
      .send({ newPassword: 'bndttadmin' });
    expect(restorePassword.status).toBe(200);
  });

  test('admin can restore a downloaded backup and replace newer data', async () => {
    const created = await request(app)
      .post('/api/news')
      .set(adminHeaders())
      .send({ title: 'Created after backup', body: 'This should be removed by restore' });
    expect(created.status).toBe(201);

    const res = await request(app)
      .post('/api/admin/database-restore')
      .set(adminHeaders())
      .set('Content-Type', 'application/octet-stream')
      .send(backupBuffer);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const news = await request(app).get('/api/news');
    expect(news.body.find((item) => item.title === 'Created after backup')).toBeUndefined();

    const event = await db.get(
      "SELECT actor, action FROM activity_logs WHERE action = 'restore_database_backup' ORDER BY id DESC LIMIT 1"
    );
    expect(event).toEqual({ actor: 'admin', action: 'restore_database_backup' });
  });

  test('snapshot restore no longer requires a seed token', async () => {
    process.env.SEED_TOKEN = 'configured-but-not-required-for-restore';
    const res = await request(app)
      .post('/api/admin/restore-prem-snapshot')
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
