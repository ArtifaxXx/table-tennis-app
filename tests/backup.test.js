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

    const event = await db.get(
      "SELECT actor, action FROM activity_logs WHERE action = 'download_database_backup' ORDER BY id DESC LIMIT 1"
    );
    expect(event).toEqual({ actor: 'admin', action: 'download_database_backup' });
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
