const request = require('supertest');
const { createTestApp, adminHeaders } = require('./helpers');

const createSeason = async (app, name, start = '2027-01-04', end = '2027-06-30') => {
  const season = await request(app)
    .post('/api/team-seasons')
    .set(adminHeaders())
    .send({ name, schedule_start_date: start, schedule_end_date: end });
  const divisions = await request(app).get(`/api/team-seasons/${season.body.id}/divisions`);
  return { season: season.body, division: divisions.body[0] };
};

const createTeam = async (app, name) => {
  const team = await request(app)
    .post('/api/teams')
    .set(adminHeaders())
    .send({ name });
  return team.body;
};

const createPlayersAndRoster = async (app, teamId, prefix) => {
  const ids = [];
  for (let i = 1; i <= 3; i++) {
    const res = await request(app)
      .post('/api/players')
      .set(adminHeaders())
      .send({ name: `${prefix} P${i}` });
    ids.push(res.body.id);
  }
  await request(app)
    .put(`/api/teams/${teamId}/roster`)
    .set(adminHeaders())
    .send({ main: ids, subs: [] });
  return ids;
};

const assignTeams = (app, divisionId, teamIds) =>
  request(app)
    .put(`/api/divisions/${divisionId}/teams`)
    .set(adminHeaders())
    .send({ teamIds });

const generate = (app, seasonId) =>
  request(app)
    .post('/api/fixtures/generate-schedule')
    .set(adminHeaders())
    .send({ team_season_id: seasonId });

const startSeason = (app, seasonId) =>
  request(app).post(`/api/team-seasons/${seasonId}/start`).set(adminHeaders());

const cupMatches = (db, seasonId) =>
  db.all(
    `SELECT m.*
     FROM division_cup_matches m
     JOIN division_cups c ON c.id = m.cup_id
     WHERE c.team_season_id = ?
     ORDER BY m.round_number, m.match_number`,
    [seasonId]
  );

const WINNING_GAMES = [
  { home_points: 11, away_points: 5 },
  { home_points: 11, away_points: 6 },
  { home_points: 11, away_points: 7 },
];

const scoreMatch = (app, fixtureId, matchNumber, games = WINNING_GAMES) =>
  request(app)
    .put(`/api/fixtures/${fixtureId}/matches/${matchNumber}/games`)
    .set(adminHeaders())
    .send({ games });

// One app + database for the whole file: each createTestApp call returns the
// same cached module, and closing it early breaks later describes.
let app;
let db;
let cleanup;

beforeAll(async () => {
  ({ app, db, cleanup } = await createTestApp('regression'));
});

afterAll(async () => {
  await cleanup();
});

describe('transaction serialization', () => {
  beforeAll(async () => {
    await db.run('CREATE TABLE IF NOT EXISTS txn_probe (id TEXT)');
  });

  test('nested transaction failure rolls back only the inner block', async () => {
    await db.transaction(async () => {
      await db.run("INSERT INTO txn_probe (id) VALUES ('outer')");
      await expect(
        db.transaction(async () => {
          await db.run("INSERT INTO txn_probe (id) VALUES ('inner')");
          throw new Error('inner boom');
        })
      ).rejects.toThrow('inner boom');
    });

    const rows = await db.all('SELECT id FROM txn_probe ORDER BY id');
    expect(rows.map((r) => r.id)).toEqual(['outer']);
  });

  test('outer failure rolls back everything including nested writes', async () => {
    await expect(
      db.transaction(async () => {
        await db.run("INSERT INTO txn_probe (id) VALUES ('doomed-outer')");
        await db.transaction(async () => {
          await db.run("INSERT INTO txn_probe (id) VALUES ('doomed-inner')");
        });
        throw new Error('outer boom');
      })
    ).rejects.toThrow('outer boom');

    const rows = await db.all("SELECT id FROM txn_probe WHERE id LIKE 'doomed-%'");
    expect(rows).toHaveLength(0);
  });

  test('concurrent transactions serialize without interleaving errors', async () => {
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        db.transaction(async () => {
          await db.run('INSERT INTO txn_probe (id) VALUES (?)', [`c${i}`]);
          await new Promise((resolve) => setTimeout(resolve, 5));
          await db.run('INSERT INTO txn_probe (id) VALUES (?)', [`c${i}b`]);
        })
      )
    );

    const rows = await db.all("SELECT id FROM txn_probe WHERE id LIKE 'c%'");
    expect(rows).toHaveLength(12);
  });
});

describe('cup bracket integrity', () => {

  test('3-team cup: bye advances but the final is not auto-decided', async () => {
    const { season, division } = await createSeason(app, 'Cup Three');
    const teams = [];
    for (const name of ['C3 A', 'C3 B', 'C3 C']) {
      const team = await createTeam(app, name);
      await createPlayersAndRoster(app, team.id, name);
      teams.push(team);
    }
    await assignTeams(app, division.id, teams.map((t) => t.id));
    const res = await generate(app, season.id);
    expect(res.status).toBe(200);

    const matches = await cupMatches(db, season.id);
    const round1 = matches.filter((m) => m.round_number === 1);
    const finals = matches.filter((m) => m.round_number === 2);
    expect(round1).toHaveLength(2);
    expect(finals).toHaveLength(1);

    const bye = round1.find((m) => !m.home_team_id || !m.away_team_id);
    const real = round1.find((m) => m.home_team_id && m.away_team_id);
    expect(bye).toBeTruthy();
    expect(bye.winner_team_id).toBeTruthy();
    expect(real.winner_team_id).toBeNull();
    expect(real.fixture_id).toBeTruthy();

    // The final must wait for the real semi-final; it is not a bye.
    const final = finals[0];
    expect(final.winner_team_id).toBeNull();
    expect(final.fixture_id).toBeNull();
    const byeWinnerInFinal = final.home_team_id === bye.winner_team_id || final.away_team_id === bye.winner_team_id;
    expect(byeWinnerInFinal).toBe(true);
    expect(final.home_team_id && final.away_team_id).toBeFalsy();
  });

  test('5-team cup: later-round half-filled matches wait for feeder winners', async () => {
    const { season, division } = await createSeason(app, 'Cup Five');
    const teams = [];
    for (const name of ['C5 A', 'C5 B', 'C5 C', 'C5 D', 'C5 E']) {
      const team = await createTeam(app, name);
      await createPlayersAndRoster(app, team.id, name);
      teams.push(team);
    }
    await assignTeams(app, division.id, teams.map((t) => t.id));
    const res = await generate(app, season.id);
    expect(res.status).toBe(200);

    const matches = await cupMatches(db, season.id);
    // nextPow2(5) = 8: 4 round-1 matches (3 byes + 1 real), 2 semis, 1 final.
    const round1 = matches.filter((m) => m.round_number === 1);
    const semis = matches.filter((m) => m.round_number === 2);
    const finals = matches.filter((m) => m.round_number === 3);
    expect(round1).toHaveLength(4);
    expect(semis).toHaveLength(2);
    expect(finals).toHaveLength(1);

    // Every populated slot in rounds >= 2 must come from a decided feeder.
    for (const m of matches.filter((x) => x.round_number > 1)) {
      if (m.home_team_id) {
        const feeder = matches.find(
          (f) => f.next_match_id === m.id && f.match_number === 2 * m.match_number - 1
        );
        expect(feeder?.winner_team_id).toBe(m.home_team_id);
      }
      if (m.away_team_id) {
        const feeder = matches.find(
          (f) => f.next_match_id === m.id && f.match_number === 2 * m.match_number
        );
        expect(feeder?.winner_team_id).toBe(m.away_team_id);
      }
    }

    // The semi waiting on the real round-1 match stays undecided with no fixture.
    const realMatch = round1.find((m) => m.home_team_id && m.away_team_id);
    const waitingSemi = semis.find((m) => !m.home_team_id || !m.away_team_id);
    expect(waitingSemi).toBeTruthy();
    expect(waitingSemi.winner_team_id).toBeNull();
    expect(waitingSemi.fixture_id).toBeNull();

    const final = finals[0];
    expect(final.winner_team_id).toBeNull();
    expect(final.fixture_id).toBeNull();

    // Playing the real round-1 fixture fills the waiting semi.
    await startSeason(app, season.id);
    const fixtureId = realMatch.fixture_id;
    const fixture = (await request(app).get(`/api/fixtures/${fixtureId}`)).body;
    const homeRoster = (await request(app).get(`/api/teams/${fixture.home_team_id}`)).body.roster.map((r) => r.player_id);
    const awayRoster = (await request(app).get(`/api/teams/${fixture.away_team_id}`)).body.roster.map((r) => r.player_id);
    await request(app)
      .put(`/api/fixtures/${fixtureId}/lineups/home`)
      .set(adminHeaders())
      .send({ playerIds: homeRoster });
    await request(app)
      .put(`/api/fixtures/${fixtureId}/lineups/away`)
      .set(adminHeaders())
      .send({ playerIds: awayRoster });

    for (let matchNumber = 1; matchNumber <= 5; matchNumber++) {
      const scored = await scoreMatch(app, fixtureId, matchNumber);
      expect(scored.status).toBe(200);
    }

    const after = await cupMatches(db, season.id);
    const semiNow = after.find((m) => m.id === waitingSemi.id);
    expect(semiNow.home_team_id && semiNow.away_team_id).toBeTruthy();
    expect(semiNow.fixture_id).toBeTruthy();

    const finalNow = after.find((m) => m.round_number === 3);
    expect(finalNow.winner_team_id).toBeNull();
    expect(finalNow.fixture_id).toBeNull();
  });

  test('updateFixtureDate keeps the cup bracket row in sync', async () => {
    const { season, division } = await createSeason(app, 'Cup Sync');
    const teams = [];
    for (const name of ['CS A', 'CS B', 'CS C']) {
      const team = await createTeam(app, name);
      await createPlayersAndRoster(app, team.id, name);
      teams.push(team);
    }
    await assignTeams(app, division.id, teams.map((t) => t.id));
    await generate(app, season.id);
    await startSeason(app, season.id);

    const real = (await cupMatches(db, season.id)).find(
      (m) => m.round_number === 1 && m.home_team_id && m.away_team_id
    );
    const newDate = '2027-03-02T19:00:00.000Z';
    const res = await request(app)
      .put(`/api/fixtures/${real.fixture_id}`)
      .set(adminHeaders())
      .send({ match_date: newDate });
    expect(res.status).toBe(200);

    const row = await db.get('SELECT match_date FROM division_cup_matches WHERE id = ?', [real.id]);
    expect(row.match_date).toBe(newDate);
  });
});

describe('scoring safety', () => {
  let fixture;

  beforeAll(async () => {
    const { season, division } = await createSeason(app, 'Scoring Season');
    const home = await createTeam(app, 'Score Home');
    const away = await createTeam(app, 'Score Away');
    const homeIds = await createPlayersAndRoster(app, home.id, 'SH');
    const awayIds = await createPlayersAndRoster(app, away.id, 'SA');
    await assignTeams(app, division.id, [home.id, away.id]);
    await generate(app, season.id);
    await startSeason(app, season.id);

    fixture = (
      await db.get(
        "SELECT * FROM fixtures WHERE team_season_id = ? AND match_type = 'league' LIMIT 1",
        [season.id]
      )
    );
    const homeTeam = fixture.home_team_id === home.id ? homeIds : awayIds;
    const awayTeam = fixture.home_team_id === home.id ? awayIds : homeIds;
    await request(app)
      .put(`/api/fixtures/${fixture.id}/lineups/home`)
      .set(adminHeaders())
      .send({ playerIds: homeTeam });
    await request(app)
      .put(`/api/fixtures/${fixture.id}/lineups/away`)
      .set(adminHeaders())
      .send({ playerIds: awayTeam });
  });

  test('invalid game input is rejected and previously saved games are preserved', async () => {
    const ok = await scoreMatch(app, fixture.id, 1);
    expect(ok.status).toBe(200);

    for (const games of [
      [{ home_points: -1, away_points: 5 }, { home_points: 11, away_points: 5 }, { home_points: 11, away_points: 5 }],
      [{ home_points: NaN, away_points: 5 }, { home_points: 11, away_points: 5 }, { home_points: 11, away_points: 5 }],
      [{ home_points: 11.5, away_points: 5 }, { home_points: 11, away_points: 5 }, { home_points: 11, away_points: 5 }],
      [{ home_points: Infinity, away_points: 5 }, { home_points: 11, away_points: 5 }, { home_points: 11, away_points: 5 }],
    ]) {
      const res = await scoreMatch(app, fixture.id, 1, games);
      expect(res.status).toBe(400);
    }

    const detail = (await request(app).get(`/api/fixtures/${fixture.id}`)).body;
    const match1 = detail.matches.find((m) => m.match_number === 1);
    expect(match1.games).toHaveLength(3);
    expect(match1.games[0].home_points).toBe(11);
    expect(match1.winner_side).toBe('home');
  });

  test('bulk submission with a malformed match writes nothing', async () => {
    const res = await request(app)
      .put(`/api/fixtures/${fixture.id}/matches/games`)
      .set(adminHeaders())
      .send({
        matches: [
          { match_number: 2, games: WINNING_GAMES },
          { match_number: 3, games: [{ home_points: 'x', away_points: 1 }] },
        ],
      });
    expect(res.status).toBe(400);

    const detail = (await request(app).get(`/api/fixtures/${fixture.id}`)).body;
    expect(detail.matches.find((m) => m.match_number === 2).games).toHaveLength(0);
    expect(detail.matches.find((m) => m.match_number === 3).games).toHaveLength(0);
  });

  test('lineup changes regenerate unscored matches but not scored ones', async () => {
    const before = (await request(app).get(`/api/fixtures/${fixture.id}`)).body;
    const match1Before = before.matches.find((m) => m.match_number === 1);
    const lineup = before.lineups;
    const homeIds = lineup.filter((l) => l.side === 'home').sort((a, b) => a.day_rank - b.day_rank).map((l) => l.player_id);

    // Match 1 already has games: its pairing is frozen.
    const swapped = [homeIds[1], homeIds[0], homeIds[2]];
    const res = await request(app)
      .put(`/api/fixtures/${fixture.id}/lineups/home`)
      .set(adminHeaders())
      .send({ playerIds: swapped });
    expect(res.status).toBe(200);

    const after = (await request(app).get(`/api/fixtures/${fixture.id}`)).body;
    const match1After = after.matches.find((m) => m.match_number === 1);
    expect(match1After.home_player_a_id).toBe(match1Before.home_player_a_id);
    expect(match1After.games).toHaveLength(3);
  });
});

describe('api robustness', () => {

  test('unknown API routes return a JSON 404', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'API endpoint not found' });
  });

  test('malformed JSON bodies return a JSON 400, not an HTML error page', async () => {
    const res = await request(app)
      .post('/api/news')
      .set(adminHeaders())
      .set('Content-Type', 'application/json')
      .send('{ not valid json');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
    expect(res.headers['content-type']).toContain('json');
  });

  test('activity log endpoint tolerates non-JSON details', async () => {
    await db.run(
      "INSERT INTO activity_logs (event_type, action, details) VALUES ('legacy', 'probe', '{not json')"
    );
    const res = await request(app).get('/api/admin/activity-logs').set(adminHeaders());
    expect(res.status).toBe(200);
    const row = res.body.find((r) => r.action === 'probe');
    expect(row.details).toEqual({ raw: '{not json' });
  });

  // Runs last: failed header auth is throttled per IP, which would affect
  // subsequent credential checks in this suite.
  test('repeated bad credential headers are throttled', async () => {
    const bad = { 'X-Admin-Name': 'admin', 'X-Admin-Password': 'definitely-wrong' };
    for (let i = 0; i < 20; i++) {
      const res = await request(app).get('/api/auth/role').set(bad);
      expect(res.status).toBe(200);
      expect(res.body.role).toBe('viewer');
    }
    const throttled = await request(app).get('/api/auth/role').set(bad);
    expect(throttled.status).toBe(429);
  });
});
