const request = require('supertest');
const { createTestApp, adminHeaders } = require('./helpers');

let app;
let cleanup;

beforeAll(async () => {
  ({ app, cleanup } = await createTestApp('api'));
});

afterAll(async () => {
  await cleanup();
});

describe('public API surface', () => {
  const readEndpoints = [
    '/api/news',
    '/api/players',
    '/api/teams',
    '/api/fixtures',
    '/api/team-seasons',
    '/api/team-standings',
    '/api/player-rankings',
    '/api/dashboard',
    '/api/matches',
    '/api/standings',
  ];

  for (const endpoint of readEndpoints) {
    test(`GET ${endpoint} responds 200`, async () => {
      const res = await request(app).get(endpoint);
      expect(res.status).toBe(200);
    });
  }

  test('GET /api/auth/role works without credentials', async () => {
    const res = await request(app).get('/api/auth/role');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('viewer');
  });

  test('API responses are not cached', async () => {
    const res = await request(app).get('/api/news');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('news CRUD as admin', () => {
  let newsId;

  test('create', async () => {
    const res = await request(app)
      .post('/api/news')
      .set(adminHeaders())
      .send({ title: 'Test announcement', body: 'Hello league' });
    expect(res.status).toBe(201);
    newsId = res.body.id;
    expect(newsId).toBeTruthy();
  });

  test('list shows the new item', async () => {
    const res = await request(app).get('/api/news');
    const item = res.body.find((n) => n.id === newsId);
    expect(item).toBeTruthy();
    expect(item.title).toBe('Test announcement');
  });

  test('pin then unpin', async () => {
    const pin = await request(app)
      .post(`/api/news/${newsId}/pin`)
      .set(adminHeaders());
    expect(pin.status).toBe(200);

    const list = await request(app).get('/api/news');
    expect(list.body.find((n) => n.id === newsId).pinned).toBeTruthy();

    const unpin = await request(app)
      .post(`/api/news/${newsId}/unpin`)
      .set(adminHeaders());
    expect(unpin.status).toBe(200);
  });

  test('edit', async () => {
    const res = await request(app)
      .put(`/api/news/${newsId}`)
      .set(adminHeaders())
      .send({ title: 'Updated title', body: 'Hello league' });
    expect(res.status).toBe(200);

    const list = await request(app).get('/api/news');
    expect(list.body.find((n) => n.id === newsId).title).toBe('Updated title');
  });

  test('delete', async () => {
    const res = await request(app)
      .delete(`/api/news/${newsId}`)
      .set(adminHeaders());
    expect(res.status).toBe(204);

    const list = await request(app).get('/api/news');
    expect(list.body.find((n) => n.id === newsId)).toBeUndefined();
  });
});

describe('players and teams CRUD as admin', () => {
  test('create and delete a player', async () => {
    const create = await request(app)
      .post('/api/players')
      .set(adminHeaders())
      .send({ name: 'Test Player', skill_level: 3 });
    expect(create.status).toBe(201);
    const id = create.body.id;
    expect(id).toBeTruthy();

    const list = await request(app).get('/api/players');
    expect(list.body.find((p) => p.id === id)).toBeTruthy();

    const del = await request(app).delete(`/api/players/${id}`).set(adminHeaders());
    expect(del.status).toBe(204);
  });

  test('create and delete a team', async () => {
    const create = await request(app)
      .post('/api/teams')
      .set(adminHeaders())
      .send({ name: 'Test Club' });
    expect(create.status).toBe(201);
    const id = create.body.id;
    expect(id).toBeTruthy();

    const del = await request(app).delete(`/api/teams/${id}`).set(adminHeaders());
    expect(del.status).toBe(204);
  });
});
