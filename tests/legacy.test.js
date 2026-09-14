const request = require('supertest');
const { createTestApp, adminHeaders } = require('./helpers');

let app;
let cleanup;
let player1;
let player2;

beforeAll(async () => {
  ({ app, cleanup } = await createTestApp('legacy'));

  const p1 = await request(app)
    .post('/api/players')
    .set(adminHeaders())
    .send({ name: 'Alice', skill_level: 2 });
  const p2 = await request(app)
    .post('/api/players')
    .set(adminHeaders())
    .send({ name: 'Bob', skill_level: 4 });
  player1 = p1.body.id;
  player2 = p2.body.id;
});

afterAll(async () => {
  await cleanup();
});

describe('legacy player matches', () => {
  let matchId;

  test('create a scheduled match without scores', async () => {
    const res = await request(app)
      .post('/api/matches')
      .set(adminHeaders())
      .send({ player1_id: player1, player2_id: player2 });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('scheduled');
    expect(res.body.winner_id).toBeNull();
    matchId = res.body.id;
  });

  test('create a completed match derives the winner', async () => {
    const res = await request(app)
      .post('/api/matches')
      .set(adminHeaders())
      .send({
        player1_id: player1,
        player2_id: player2,
        player1_score: 3,
        player2_score: 1,
        match_date: '2026-01-10',
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('completed');
    expect(res.body.winner_id).toBe(player1);
  });

  test('rejects a match between the same player', async () => {
    const res = await request(app)
      .post('/api/matches')
      .set(adminHeaders())
      .send({ player1_id: player1, player2_id: player1 });
    expect(res.status).toBe(400);
  });

  test('rejects unknown players', async () => {
    const res = await request(app)
      .post('/api/matches')
      .set(adminHeaders())
      .send({ player1_id: player1, player2_id: 'ghost' });
    expect(res.status).toBe(400);
  });

  test('get a single match', async () => {
    const res = await request(app).get(`/api/matches/${matchId}`);
    expect(res.status).toBe(200);
    expect(res.body.player1_name).toBe('Alice');
  });

  test('update match scores recomputes the winner', async () => {
    const res = await request(app)
      .put(`/api/matches/${matchId}`)
      .set(adminHeaders())
      .send({
        player1_score: 1,
        player2_score: 3,
        match_date: '2026-01-12',
        status: 'completed',
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.winner_id).toBe(player2);
  });
});

describe('legacy standings and statistics', () => {
  test('standings rank by points', async () => {
    const res = await request(app).get('/api/standings');
    expect(res.status).toBe(200);
    const alice = res.body.find((p) => p.name === 'Alice');
    const bob = res.body.find((p) => p.name === 'Bob');
    expect(alice.wins).toBe(1);
    expect(alice.points).toBe(3);
    expect(bob.wins).toBe(1); // won the updated match
    expect(res.body[0].rank).toBe(1);
  });

  test('statistics aggregates counts', async () => {
    const res = await request(app).get('/api/statistics');
    expect(res.status).toBe(200);
    expect(res.body.totalPlayers).toBe(2);
    expect(res.body.totalMatches).toBe(2);
  });
});

describe('not-found and validation paths', () => {
  test('GET /api/players/:id returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/players/nope');
    expect(res.status).toBe(404);
  });

  test('GET /api/teams/:id returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/teams/nope');
    expect(res.status).toBe(404);
  });

  test('GET /api/fixtures/:id returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/fixtures/nope');
    expect(res.status).toBe(404);
  });

  test('GET /api/matches/:id returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/matches/nope');
    expect(res.status).toBe(404);
  });

  test('POST /api/players requires a name', async () => {
    const res = await request(app)
      .post('/api/players')
      .set(adminHeaders())
      .send({ skill_level: 2 });
    expect(res.status).toBe(400);
  });

  test('PUT /api/players/:id updates fields', async () => {
    const res = await request(app)
      .put(`/api/players/${player1}`)
      .set(adminHeaders())
      .send({ name: 'Alice Updated', skill_level: 5 });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Alice Updated');
    expect(res.body.skill_level).toBe(5);
  });
});

describe('schedule and seed guards', () => {
  test('GET /api/schedule generates a round-robin', async () => {
    const res = await request(app).get('/api/schedule').set(adminHeaders());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].matches).toHaveLength(1);
  });

  test('GET /api/schedule requires admin', async () => {
    const res = await request(app).get('/api/schedule');
    expect(res.status).toBe(403);
  });

  test('seed endpoints require the seed token when configured', async () => {
    process.env.SEED_TOKEN = 'test-seed-token';
    try {
      const noToken = await request(app)
        .post('/api/admin/seed')
        .set(adminHeaders());
      expect(noToken.status).toBe(403);

      const badToken = await request(app)
        .post('/api/admin/seed')
        .set(adminHeaders())
        .set('X-Seed-Token', 'wrong');
      expect(badToken.status).toBe(403);
    } finally {
      delete process.env.SEED_TOKEN;
    }
  });
});

describe('player delete', () => {
  test('soft-deleted player disappears from reads', async () => {
    const created = await request(app)
      .post('/api/players')
      .set(adminHeaders())
      .send({ name: 'Temp Player', skill_level: 1 });
    expect(created.status).toBe(201);

    const del = await request(app)
      .delete(`/api/players/${created.body.id}`)
      .set(adminHeaders());
    expect(del.status).toBe(204);

    const gone = await request(app).get(`/api/players/${created.body.id}`);
    expect(gone.status).toBe(404);

    const list = await request(app).get('/api/players');
    expect(list.body.find((p) => p.id === created.body.id)).toBeUndefined();
  });
});
