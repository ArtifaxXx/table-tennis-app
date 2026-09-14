const request = require('supertest');
const { createTestApp, adminHeaders, ADMIN } = require('./helpers');

async function latestLog(db) {
  return db.get('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 1');
}

describe('activity logging', () => {
  let app;
  let db;
  let cleanup;

  beforeAll(async () => {
    ({ app, db, cleanup } = await createTestApp('logging'));
  });

  afterAll(async () => {
    await cleanup();
  });

  test('track beacon logs a page view', async () => {
    const res = await request(app)
      .post('/api/track')
      .set('User-Agent', 'jest-test-agent')
      .send({ path: '/fixtures' });
    expect(res.status).toBe(200);

    const row = await latestLog(db);
    expect(row.event_type).toBe('visit');
    expect(row.action).toBe('page_view');
    expect(JSON.parse(row.details).path).toBe('/fixtures');
    expect(row.ip_address).toBeTruthy();
    expect(row.user_agent).toBe('jest-test-agent');
  });

  test('same path per visitor is deduplicated within the day', async () => {
    await request(app).post('/api/track').send({ path: '/teams' });
    const afterFirst = await db.get('SELECT COUNT(*) AS c FROM activity_logs');
    await request(app).post('/api/track').send({ path: '/teams' });
    const afterSecond = await db.get('SELECT COUNT(*) AS c FROM activity_logs');
    expect(afterSecond.c).toBe(afterFirst.c);
  });

  test('track ignores non-path values', async () => {
    const before = await db.get('SELECT COUNT(*) AS c FROM activity_logs');
    await request(app).post('/api/track').send({ path: 'javascript:alert(1)' });
    await request(app).post('/api/track').send({ path: '//evil.example' });
    const after = await db.get('SELECT COUNT(*) AS c FROM activity_logs');
    expect(after.c).toBe(before.c);
  });

  test('successful admin writes are logged with the actor name', async () => {
    const res = await request(app)
      .post('/api/news')
      .set(adminHeaders())
      .send({ title: 'Logging test', body: 'body' });
    expect(res.status).toBe(201);

    const row = await latestLog(db);
    expect(row.event_type).toBe('edit');
    expect(row.entity).toBe('news');
    expect(row.actor).toBe('admin');
  });

  test('failed writes are not logged as edits', async () => {
    const before = await db.get(
      "SELECT COUNT(*) AS c FROM activity_logs WHERE event_type = 'edit'"
    );
    await request(app).post('/api/news').send({ title: 'x', body: 'y' }); // 403 as viewer
    const after = await db.get(
      "SELECT COUNT(*) AS c FROM activity_logs WHERE event_type = 'edit'"
    );
    expect(after.c).toBe(before.c);
  });

  test('login attempts are logged as auth events', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ name: 'Someone', password: 'bad' });

    const row = await latestLog(db);
    expect(row.event_type).toBe('auth');
    expect(row.action).toBe('login_failed');
    expect(row.actor).toBe('Someone');
  });

  test('password is never written to the log', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ name: ADMIN.name, password: ADMIN.password });

    const row = await latestLog(db);
    expect(JSON.stringify(row)).not.toContain(ADMIN.password);
  });

  describe('activity-logs endpoint', () => {
    test('requires admin', async () => {
      const res = await request(app).get('/api/admin/activity-logs');
      expect(res.status).toBe(403);
    });

    test('returns parsed rows for admins', async () => {
      const res = await request(app)
        .get('/api/admin/activity-logs?limit=50')
        .set(adminHeaders());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      const row = res.body.find((r) => r.event_type === 'auth');
      expect(typeof row.details).toBe('object');
    });

    test('supports eventType and actor filters', async () => {
      const res = await request(app)
        .get('/api/admin/activity-logs?eventType=auth&actor=Someone')
        .set(adminHeaders());
      expect(res.status).toBe(200);
      for (const row of res.body) {
        expect(row.event_type).toBe('auth');
        expect(row.actor).toBe('Someone');
      }
    });
  });
});
