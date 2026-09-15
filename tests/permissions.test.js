const request = require('supertest');
const { createTestApp, adminHeaders } = require('./helpers');

const STEWARD = { name: 'League Steward', password: 'steward-password' };

const stewardHeaders = (password = STEWARD.password) => ({
  'X-Admin-Name': STEWARD.name,
  'X-Admin-Password': password,
});

const binaryParser = (res, callback) => {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

describe('steward permissions', () => {
  let app;
  let cleanup;

  beforeAll(async () => {
    ({ app, cleanup } = await createTestApp('permissions'));
    const created = await request(app)
      .post('/api/admin/users')
      .set(adminHeaders())
      .send({ ...STEWARD, role: 'admin' });
    expect(created.status).toBe(200);
    expect(created.body.role).toBe('steward');
  });

  afterAll(async () => {
    await cleanup();
  });

  test('steward login and role resolution return the steward role', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send(STEWARD);
    expect(login.status).toBe(200);
    expect(login.body).toEqual({ role: 'steward', name: STEWARD.name });

    const role = await request(app)
      .get('/api/auth/role')
      .set(stewardHeaders());
    expect(role.body).toEqual({ role: 'steward', name: STEWARD.name });
  });

  test('steward can perform ordinary administrative edits', async () => {
    const news = await request(app)
      .post('/api/news')
      .set(stewardHeaders())
      .send({ title: 'Steward announcement', body: 'Created by a steward' });
    expect(news.status).toBe(201);

    const team = await request(app)
      .post('/api/teams')
      .set(stewardHeaders())
      .send({ name: 'Steward Team' });
    expect(team.status).toBe(201);
  });

  test('steward can read activity logs and download backups', async () => {
    const logs = await request(app)
      .get('/api/admin/activity-logs')
      .set(stewardHeaders());
    expect(logs.status).toBe(200);

    const backup = await request(app)
      .get('/api/admin/database-backup')
      .set(stewardHeaders())
      .buffer(true)
      .parse(binaryParser);
    expect(backup.status).toBe(200);
    expect(backup.body.subarray(0, 16).toString()).toBe('SQLite format 3\u0000');
  });

  test('steward cannot manage steward accounts', async () => {
    const list = await request(app)
      .get('/api/admin/users')
      .set(stewardHeaders());
    expect(list.status).toBe(403);

    const create = await request(app)
      .post('/api/admin/users')
      .set(stewardHeaders())
      .send({ name: 'Another Steward', password: 'another-password' });
    expect(create.status).toBe(403);

    const reset = await request(app)
      .put('/api/admin/users/example')
      .set(stewardHeaders())
      .send({ password: 'replacement-password' });
    expect(reset.status).toBe(403);

    const remove = await request(app)
      .delete('/api/admin/users/example')
      .set(stewardHeaders());
    expect(remove.status).toBe(403);
  });

  test('steward cannot restore either database source', async () => {
    const backupRestore = await request(app)
      .post('/api/admin/database-restore')
      .set(stewardHeaders());
    expect(backupRestore.status).toBe(403);

    const premierRestore = await request(app)
      .post('/api/admin/restore-prem-snapshot')
      .set(stewardHeaders());
    expect(premierRestore.status).toBe(403);
  });

  test('steward cannot perform any season lifecycle action', async () => {
    const create = await request(app)
      .post('/api/team-seasons')
      .set(stewardHeaders())
      .send({
        name: 'Forbidden Season',
        schedule_start_date: '2027-01-01',
        schedule_end_date: '2027-06-01',
      });
    expect(create.status).toBe(403);

    for (const action of ['start', 'stop', 'reopen']) {
      const res = await request(app)
        .post(`/api/team-seasons/example/${action}`)
        .set(stewardHeaders());
      expect(res.status).toBe(403);
    }

    const remove = await request(app)
      .delete('/api/team-seasons/example')
      .set(stewardHeaders());
    expect(remove.status).toBe(403);
  });

  test('steward can change their own password without gaining admin access', async () => {
    const nextPassword = 'new-steward-password';
    const change = await request(app)
      .put('/api/auth/admin-password')
      .set(stewardHeaders())
      .send({ newPassword: nextPassword });
    expect(change.status).toBe(200);

    const role = await request(app)
      .get('/api/auth/role')
      .set(stewardHeaders(nextPassword));
    expect(role.body).toEqual({ role: 'steward', name: STEWARD.name });
  });
});
