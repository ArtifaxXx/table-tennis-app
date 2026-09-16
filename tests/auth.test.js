const request = require('supertest');
const { createTestApp, adminHeaders, ADMIN } = require('./helpers');

describe('auth and steward accounts', () => {
  let app;
  let cleanup;

  beforeAll(async () => {
    ({ app, cleanup } = await createTestApp('auth'));
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('login', () => {
    test('accepts the bootstrapped admin account', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ name: ADMIN.name, password: ADMIN.password });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ role: 'admin', name: 'admin', id: expect.any(String) });
    });

    test('uses the new default password instead of the legacy default', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ name: ADMIN.name, password: '123' });
      expect(res.status).toBe(401);
      expect(res.body.role).toBe('viewer');
    });

    test('rejects a wrong password with 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ name: ADMIN.name, password: 'nope' });
      expect(res.status).toBe(401);
      expect(res.body.role).toBe('viewer');
    });

    test('rejects an unknown name with 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ name: 'ghost', password: 'whatever' });
      expect(res.status).toBe(401);
    });

    test('never returns password hashes', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ name: ADMIN.name, password: ADMIN.password });
      expect(JSON.stringify(res.body)).not.toMatch(/hash|password/i);
    });
  });

  describe('role resolution', () => {
    test('defaults to viewer with no credentials', async () => {
      const res = await request(app).get('/api/auth/role');
      expect(res.body.role).toBe('viewer');
    });

    test('admin headers resolve role and canonical name', async () => {
      const res = await request(app).get('/api/auth/role').set(adminHeaders());
      expect(res.body).toEqual({ role: 'admin', name: 'admin', id: expect.any(String) });
    });

    test('name matching is case-insensitive and returns canonical casing', async () => {
      const res = await request(app)
        .get('/api/auth/role')
        .set(adminHeaders({ name: 'ADMIN' }));
      expect(res.body).toEqual({ role: 'admin', name: 'admin', id: expect.any(String) });
    });

    test('wrong password falls back to viewer', async () => {
      const res = await request(app)
        .get('/api/auth/role')
        .set(adminHeaders({ password: 'bad' }));
      expect(res.body.role).toBe('viewer');
    });

    test('password alone is not enough (name required)', async () => {
      const res = await request(app)
        .get('/api/auth/role')
        .set('X-Admin-Password', ADMIN.password);
      expect(res.body.role).toBe('viewer');
    });
  });

  describe('authorization', () => {
    test('write endpoints reject viewers', async () => {
      const res = await request(app).post('/api/news').send({ title: 't', body: 'b' });
      expect(res.status).toBe(403);
    });

    test('admin-only endpoints reject viewers', async () => {
      const res = await request(app).get('/api/admin/users');
      expect(res.status).toBe(403);
    });
  });

  describe('steward management', () => {
    test('admin can create a steward and the steward can log in', async () => {
      const create = await request(app)
        .post('/api/admin/users')
        .set(adminHeaders())
        .send({ name: 'Ref Steward', password: 'pw12345', role: 'admin' });
      expect(create.status).toBe(200);
      expect(create.body.role).toBe('steward');

      const login = await request(app)
        .post('/api/auth/login')
        .send({ name: 'ref steward', password: 'pw12345' });
      expect(login.status).toBe(200);
      expect(login.body).toEqual({ role: 'steward', name: 'Ref Steward', id: expect.any(String) });
    });

    test('duplicate names are rejected', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set(adminHeaders())
        .send({ name: 'ref steward', password: 'pw12345' });
      expect(res.status).toBe(400);
    });

    test('short passwords are rejected', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set(adminHeaders())
        .send({ name: 'weak', password: 'ab' });
      expect(res.status).toBe(400);
    });

    test('list returns accounts without password hashes', async () => {
      const res = await request(app).get('/api/admin/users').set(adminHeaders());
      expect(res.status).toBe(200);
      const names = res.body.map((u) => u.name);
      expect(names).toEqual(expect.arrayContaining(['admin', 'Ref Steward']));
      expect(res.body.find((u) => u.name === 'admin').role).toBe('admin');
      expect(res.body.find((u) => u.name === 'Ref Steward').role).toBe('steward');
      for (const u of res.body) {
        expect(u.password_hash).toBeUndefined();
        expect(u.password).toBeUndefined();
      }
    });

    test('password reset invalidates old password and accepts new one', async () => {
      const list = await request(app).get('/api/admin/users').set(adminHeaders());
      const target = list.body.find((u) => u.name === 'Ref Steward');

      const reset = await request(app)
        .put(`/api/admin/users/${target.id}`)
        .set(adminHeaders())
        .send({ password: 'brandnew1' });
      expect(reset.status).toBe(200);

      const oldLogin = await request(app)
        .post('/api/auth/login')
        .send({ name: 'Ref Steward', password: 'pw12345' });
      expect(oldLogin.status).toBe(401);

      const newLogin = await request(app)
        .post('/api/auth/login')
        .send({ name: 'Ref Steward', password: 'brandnew1' });
      expect(newLogin.status).toBe(200);
    });

    test('an admin cannot delete their own account', async () => {
      const list = await request(app).get('/api/admin/users').set(adminHeaders());
      const self = list.body.find((u) => u.name === 'admin');
      const res = await request(app)
        .delete(`/api/admin/users/${self.id}`)
        .set(adminHeaders());
      expect(res.status).toBe(400);
    });

    test('a steward can be deleted', async () => {
      const list = await request(app).get('/api/admin/users').set(adminHeaders());
      const target = list.body.find((u) => u.name === 'Ref Steward');
      const res = await request(app)
        .delete(`/api/admin/users/${target.id}`)
        .set(adminHeaders());
      expect(res.status).toBe(200);

      const login = await request(app)
        .post('/api/auth/login')
        .send({ name: 'Ref Steward', password: 'brandnew1' });
      expect(login.status).toBe(401);
    });

    test('the admin account cannot be deleted', async () => {
      const list = await request(app).get('/api/admin/users').set(adminHeaders());
      expect(list.body).toHaveLength(1);
      // self-delete guard fires first for 'admin'; both guards make it undeletable
      const res = await request(app)
        .delete(`/api/admin/users/${list.body[0].id}`)
        .set(adminHeaders());
      expect(res.status).toBe(400);
    });
  });

  describe('change own password', () => {
    test('admin can rotate their own password', async () => {
      const res = await request(app)
        .put('/api/auth/admin-password')
        .set(adminHeaders())
        .send({ newPassword: 'rotated1' });
      expect(res.status).toBe(200);

      const oldHeaders = await request(app).get('/api/auth/role').set(adminHeaders());
      expect(oldHeaders.body.role).toBe('viewer');

      const newHeaders = await request(app)
        .get('/api/auth/role')
        .set(adminHeaders({ password: 'rotated1' }));
      expect(newHeaders.body).toEqual({ role: 'admin', name: 'admin', id: expect.any(String) });
    });
  });

  describe('rate limiting', () => {
    test('login endpoint returns rate limit headers', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set(adminHeaders({ password: 'rotated1' }))
        .send({ name: 'admin', password: 'rotated1' });
      expect(res.headers['ratelimit-limit']).toBeDefined();
    });
  });
});
