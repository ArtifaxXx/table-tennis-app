const request = require('supertest');
const FixtureManager = require('../src/models/fixture');
const { createTestApp, adminHeaders } = require('./helpers');

let app;
let db;
let cleanup;

let seasonId;
let divisionId;
let teamIds = [];
const rosters = {};
let leagueFixtures = [];

beforeAll(async () => {
  ({ app, db, cleanup } = await createTestApp('league'));
});

afterAll(async () => {
  await cleanup();
});

const auth = () => request(app);

describe('league season lifecycle', () => {
  test('season creation validates input', async () => {
    const noName = await auth()
      .post('/api/team-seasons')
      .set(adminHeaders())
      .send({ schedule_start_date: '2026-01-05', schedule_end_date: '2026-06-30' });
    expect(noName.status).toBe(400);

    const noDates = await auth()
      .post('/api/team-seasons')
      .set(adminHeaders())
      .send({ name: 'Bad' });
    expect(noDates.status).toBe(400);

    const badRange = await auth()
      .post('/api/team-seasons')
      .set(adminHeaders())
      .send({
        name: 'Bad',
        schedule_start_date: '2026-06-30',
        schedule_end_date: '2026-01-05',
      });
    expect(badRange.status).toBe(400);
  });

  test('create a season (draft)', async () => {
    const res = await auth()
      .post('/api/team-seasons')
      .set(adminHeaders())
      .send({
        name: 'Test Season',
        schedule_start_date: '2026-01-05',
        schedule_end_date: '2026-06-30',
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
    seasonId = res.body.id;
  });

  test('create a division', async () => {
    const res = await auth()
      .post(`/api/team-seasons/${seasonId}/divisions`)
      .set(adminHeaders())
      .send({ name: 'Premier' });
    expect(res.status).toBe(201);
    divisionId = res.body.id;
  });

  test('create three teams', async () => {
    for (const [index, name] of ['Alpha', 'Bravo', 'Charlie'].entries()) {
      const res = await auth()
        .post('/api/teams')
        .set(adminHeaders())
        .send({ name, home_day: index + 1 });
      expect(res.status).toBe(201);
      teamIds.push(res.body.id);
    }
  });

  test('create players and assign rosters', async () => {
    for (let t = 0; t < teamIds.length; t++) {
      const ids = [];
      for (let p = 1; p <= 3; p++) {
        const res = await auth()
          .post('/api/players')
          .set(adminHeaders())
          .send({ name: `T${t} Player${p}`, skill_level: p });
        expect(res.status).toBe(201);
        ids.push(res.body.id);
      }
      const roster = await auth()
        .put(`/api/teams/${teamIds[t]}/roster`)
        .set(adminHeaders())
        .send({ main: ids, subs: [] });
      expect(roster.status).toBe(200);
      rosters[teamIds[t]] = ids;
    }
  });

  test('assign teams to the division', async () => {
    const res = await auth()
      .put(`/api/divisions/${divisionId}/teams`)
      .set(adminHeaders())
      .send({ teamIds });
    expect(res.status).toBe(200);

    const list = await auth().get(`/api/divisions/${divisionId}/teams`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(3);
  });

  test('division management: rename, delete-empty, block-nonempty', async () => {
    const rename = await auth()
      .put(`/api/divisions/${divisionId}`)
      .set(adminHeaders())
      .send({ name: 'Premier Division' });
    expect(rename.status).toBe(200);
    expect(rename.body.name).toBe('Premier Division');

    const temp = await auth()
      .post(`/api/team-seasons/${seasonId}/divisions`)
      .set(adminHeaders())
      .send({ name: 'Temp' });
    expect(temp.status).toBe(201);

    const delTemp = await auth()
      .delete(`/api/divisions/${temp.body.id}`)
      .set(adminHeaders());
    expect(delTemp.status).toBe(200);

    const delPremier = await auth()
      .delete(`/api/divisions/${divisionId}`)
      .set(adminHeaders());
    expect(delPremier.status).toBe(400);
  });

  test('preview schedule reports league + cup counts', async () => {
    const res = await auth()
      .post('/api/fixtures/generate-schedule/preview')
      .set(adminHeaders())
      .send({ team_season_id: seasonId });
    expect(res.status).toBe(200);
    // 3 teams: double round robin = 6 league fixtures, cup = n-1 = 2
    expect(res.body.total_fixtures).toBe(8);
    expect(res.body.total_cup_fixtures).toBe(2);
  });

  test('generate schedule creates the fixtures', async () => {
    const res = await auth()
      .post('/api/fixtures/generate-schedule')
      .set(adminHeaders())
      .send({
        team_season_id: seasonId,
        schedule_start_date: '2026-01-05',
        schedule_end_date: '2026-06-30',
      });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    leagueFixtures = res.body.filter((f) => (f.match_type || 'league') === 'league');
    expect(leagueFixtures).toHaveLength(6);
  });

  test('start the season', async () => {
    const res = await auth()
      .post(`/api/team-seasons/${seasonId}/start`)
      .set(adminHeaders());
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');

    const active = await auth().get('/api/team-seasons/active');
    expect(active.body.id).toBe(seasonId);
  });
});

describe('team management', () => {
  test('update a team', async () => {
    const res = await auth()
      .put(`/api/teams/${teamIds[0]}`)
      .set(adminHeaders())
      .send({ name: 'Alpha Updated' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Alpha Updated');
  });

  test('roster validation rejects bad shapes', async () => {
    const p = rosters[teamIds[0]];

    const short = await auth()
      .put(`/api/teams/${teamIds[0]}/roster`)
      .set(adminHeaders())
      .send({ main: p.slice(0, 2), subs: [] });
    expect(short.status).toBe(400);

    const dup = await auth()
      .put(`/api/teams/${teamIds[0]}/roster`)
      .set(adminHeaders())
      .send({ main: [p[0], p[0], p[1]], subs: [] });
    expect(dup.status).toBe(400);

    const ghost = await auth()
      .put(`/api/teams/${teamIds[0]}/roster`)
      .set(adminHeaders())
      .send({ main: [p[0], p[1], 'ghost-player'], subs: [] });
    expect(ghost.status).toBe(400);

    const tooManySubs = await auth()
      .put(`/api/teams/${teamIds[0]}/roster`)
      .set(adminHeaders())
      .send({ main: p, subs: Array(11).fill('x') });
    expect(tooManySubs.status).toBe(400);

    // roster is unchanged after failed attempts
    const team = await auth().get(`/api/teams/${teamIds[0]}`);
    expect(team.body.roster).toHaveLength(3);
  });

  test('create + delete a team', async () => {
    const created = await auth()
      .post('/api/teams')
      .set(adminHeaders())
      .send({ name: 'Disposable' });
    expect(created.status).toBe(201);

    const del = await auth()
      .delete(`/api/teams/${created.body.id}`)
      .set(adminHeaders());
    expect(del.status).toBe(204);

    const gone = await auth().get(`/api/teams/${created.body.id}`);
    expect(gone.status).toBe(404);
  });
});

describe('fixture play flow', () => {
  let fixture;
  let homeIds;
  let awayIds;

  test('lineups generate the 9 fixture matches', async () => {
    fixture = leagueFixtures[0];
    homeIds = rosters[fixture.home_team_id];
    awayIds = rosters[fixture.away_team_id];

    const home = await auth()
      .put(`/api/fixtures/${fixture.id}/lineups/home`)
      .set(adminHeaders())
      .send({ playerIds: homeIds });
    expect(home.status).toBe(200);

    const away = await auth()
      .put(`/api/fixtures/${fixture.id}/lineups/away`)
      .set(adminHeaders())
      .send({ playerIds: awayIds });
    expect(away.status).toBe(200);

    const detail = await auth().get(`/api/fixtures/${fixture.id}`);
    expect(detail.body.matches).toHaveLength(9);
    expect(detail.body.matches[0].games).toEqual([]);
  });

  test('lineup validation rejects wrong sizes and non-roster players', async () => {
    const short = await auth()
      .put(`/api/fixtures/${fixture.id}/lineups/home`)
      .set(adminHeaders())
      .send({ playerIds: homeIds.slice(0, 2) });
    expect(short.status).toBe(400);

    const outsider = await auth()
      .put(`/api/fixtures/${fixture.id}/lineups/home`)
      .set(adminHeaders())
      .send({ playerIds: [homeIds[0], homeIds[1], awayIds[0]] });
    expect(outsider.status).toBe(400);
  });

  test('match game scores validate input', async () => {
    const tooFew = await auth()
      .put(`/api/fixtures/${fixture.id}/matches/1/games`)
      .set(adminHeaders())
      .send({ games: [{ home_points: 11, away_points: 5 }] });
    expect(tooFew.status).toBe(400);

    const badType = await auth()
      .put(`/api/fixtures/${fixture.id}/matches/1/games`)
      .set(adminHeaders())
      .send({
        games: [
          { home_points: 'x', away_points: 5 },
          { home_points: 11, away_points: 5 },
          { home_points: 11, away_points: 5 },
        ],
      });
    expect(badType.status).toBe(400);
  });

  test('scoring all 9 matches completes the fixture 9-0', async () => {
    for (let matchNumber = 1; matchNumber <= 9; matchNumber++) {
      const res = await auth()
        .put(`/api/fixtures/${fixture.id}/matches/${matchNumber}/games`)
        .set(adminHeaders())
        .send({
          games: [
            { home_points: 11, away_points: 5 },
            { home_points: 11, away_points: 7 },
            { home_points: 11, away_points: 9 },
          ],
        });
      expect(res.status).toBe(200);
    }

    const detail = await auth().get(`/api/fixtures/${fixture.id}`);
    expect(detail.body.status).toBe('completed');
    expect(detail.body.home_matches_won).toBe(9);
    expect(detail.body.away_matches_won).toBe(0);
    expect(detail.body.home_games_won).toBe(27);
    expect(detail.body.away_games_won).toBe(0);
  });

  test('batch scoring endpoint also works', async () => {
    const other = leagueFixtures[1];
    const res = await auth()
      .put(`/api/fixtures/${other.id}/lineups/home`)
      .set(adminHeaders())
      .send({ playerIds: rosters[other.home_team_id] });
    expect(res.status).toBe(200);
    await auth()
      .put(`/api/fixtures/${other.id}/lineups/away`)
      .set(adminHeaders())
      .send({ playerIds: rosters[other.away_team_id] });

    const matches = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((match_number) => ({
      match_number,
      games: [
        { home_points: 11, away_points: 0 },
        { home_points: 0, away_points: 11 },
        { home_points: 11, away_points: 0 },
        { home_points: 0, away_points: 11 },
        { home_points: 11, away_points: 9 },
      ],
    }));
    const batch = await auth()
      .put(`/api/fixtures/${other.id}/matches/games`)
      .set(adminHeaders())
      .send({ matches });
    expect(batch.status).toBe(200);

    const detail = await auth().get(`/api/fixtures/${other.id}`);
    expect(detail.body.status).toBe('completed');
    expect(detail.body.home_matches_won).toBe(9);
    // each match went 3-2 home -> 27 games won, 18 lost
    expect(detail.body.home_games_won).toBe(27);
    expect(detail.body.away_games_won).toBe(18);
  });

  test('standings reflect completed fixtures', async () => {
    const res = await auth().get(
      `/api/team-standings?seasonId=${seasonId}&divisionId=${divisionId}`
    );
    expect(res.status).toBe(200);

    const byName = Object.fromEntries(res.body.map((r) => [r.team_name, r]));
    const f1 = leagueFixtures[0];
    const f1Detail = await auth().get(`/api/fixtures/${f1.id}`);
    const homeName = f1Detail.body.home_team_name;
    const awayName = f1Detail.body.away_team_name;

    expect(byName[homeName].played).toBeGreaterThanOrEqual(1);
    expect(byName[homeName].wins).toBeGreaterThanOrEqual(1);
    expect(byName[awayName].losses).toBeGreaterThanOrEqual(1);
  });

  test('player rankings include singles wins', async () => {
    const detail = await auth().get(`/api/fixtures/${leagueFixtures[0].id}`);
    const winnerName = detail.body.matches[0].home_player_a_name;

    const res = await auth().get(
      `/api/player-rankings?seasonId=${seasonId}&divisionId=${divisionId}`
    );
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    const winner = res.body.find((r) => r.player_name === winnerName);
    expect(winner).toBeTruthy();
    expect(winner.singles_wins).toBeGreaterThan(0);
  });
});

describe('forfeit', () => {
  test('forfeiting completes the fixture 9-0 for the winner', async () => {
    const target = leagueFixtures[2];
    const res = await auth()
      .post(`/api/fixtures/${target.id}/forfeit`)
      .set(adminHeaders())
      .send({ winner_team_id: target.away_team_id });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.forfeited).toBe(1);
    expect(res.body.away_matches_won).toBe(9);
    expect(res.body.home_matches_won).toBe(0);
  });

  test('forfeit requires a participating team', async () => {
    const target = leagueFixtures[3];
    const res = await auth()
      .post(`/api/fixtures/${target.id}/forfeit`)
      .set(adminHeaders())
      .send({ winner_team_id: 'nonexistent' });
    expect(res.status).toBe(400);
  });
});

describe('division cup', () => {
  test('cup bracket was generated with the schedule', async () => {
    const res = await auth().get(
      `/api/cups/division?seasonId=${seasonId}&divisionId=${divisionId}`
    );
    expect(res.status).toBe(200);
    expect(res.body.cup).toBeTruthy();
    // 3 teams -> 2 semi-final slots (one a bye) + 1 final
    expect(res.body.matches).toHaveLength(3);
  });

  test('cup scoring enforces order, first-to-five, and advances the winner', async () => {
    const cup = await auth().get(
      `/api/cups/division?seasonId=${seasonId}&divisionId=${divisionId}`
    );
    const sf = cup.body.matches.find((m) => m.fixture_id);
    expect(sf).toBeTruthy();

    const fixture = (await auth().get(`/api/fixtures/${sf.fixture_id}`)).body;
    expect(fixture.match_type).toBe('cup');

    for (const [side, teamId] of [
      ['home', fixture.home_team_id],
      ['away', fixture.away_team_id],
    ]) {
      const res = await auth()
        .put(`/api/fixtures/${fixture.id}/lineups/${side}`)
        .set(adminHeaders())
        .send({ playerIds: rosters[teamId] });
      expect(res.status).toBe(200);
    }

    const games = [
      { home_points: 11, away_points: 5 },
      { home_points: 11, away_points: 6 },
      { home_points: 11, away_points: 7 },
    ];

    // scoring match 2 before match 1 is rejected
    const outOfOrder = await auth()
      .put(`/api/fixtures/${fixture.id}/matches/2/games`)
      .set(adminHeaders())
      .send({ games });
    expect(outOfOrder.status).toBe(400);
    expect(outOfOrder.body.error).toMatch(/order/i);

    // win matches 1-5 -> cup decided at 5
    for (let n = 1; n <= 5; n++) {
      const res = await auth()
        .put(`/api/fixtures/${fixture.id}/matches/${n}/games`)
        .set(adminHeaders())
        .send({ games });
      expect(res.status).toBe(200);
    }

    const detail = await auth().get(`/api/fixtures/${fixture.id}`);
    expect(detail.body.status).toBe('completed');
    expect(detail.body.home_matches_won).toBe(5);

    // any further scoring is rejected once decided
    const after = await auth()
      .put(`/api/fixtures/${fixture.id}/matches/6/games`)
      .set(adminHeaders())
      .send({ games });
    expect(after.status).toBe(400);
    expect(after.body.error).toMatch(/decided/i);

    // the winner advanced into the final
    const bracket = await auth().get(
      `/api/cups/division?seasonId=${seasonId}&divisionId=${divisionId}`
    );
    const final = bracket.body.matches.find((m) => m.round_number === 2);
    expect(final.home_team_id).toBeTruthy();
    expect(final.away_team_id).toBeTruthy();
    expect([final.home_team_id, final.away_team_id]).toContain(
      detail.body.home_matches_won === 5
        ? fixture.home_team_id
        : fixture.away_team_id
    );
    expect(final.fixture_id).toBeTruthy();

    const finalFixture = await db.get('SELECT * FROM fixtures WHERE id = ?', [final.fixture_id]);
    const finalHome = await db.get('SELECT home_day FROM teams WHERE id = ?', [finalFixture.home_team_id]);
    const finalWeekday = new Date(finalFixture.match_date).getUTCDay() || 7;
    expect(finalFixture.match_date).toBeTruthy();
    expect(finalWeekday).toBe(finalHome.home_day);
    expect(new Date(finalFixture.match_date).getTime()).toBeGreaterThan(new Date(fixture.match_date).getTime());
  });
});

describe('read endpoints', () => {
  test('fixtures list filtered by season and division', async () => {
    const res = await auth().get(
      `/api/fixtures?seasonId=${seasonId}&divisionId=${divisionId}`
    );
    expect(res.status).toBe(200);
    // 6 league + 1 cup semi-final fixture
    expect(res.body.length).toBeGreaterThanOrEqual(6);
    expect(res.body[0].home_team_name).toBeTruthy();
  });

  test('counts-by-season returns per-season fixture counts', async () => {
    const res = await auth().get('/api/fixtures/counts-by-season');
    expect(res.status).toBe(200);
    expect(res.body[seasonId]).toBeGreaterThanOrEqual(6);
  });

  test('dashboard aggregates season data', async () => {
    const res = await auth().get(
      `/api/dashboard?seasonId=${seasonId}&divisionId=${divisionId}`
    );
    expect(res.status).toBe(200);
    expect(res.body.totalTeams).toBe(3);
    expect(res.body.completedFixtures).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(res.body.topTeams)).toBe(true);
    expect(Array.isArray(res.body.topPlayers)).toBe(true);
    expect(res.body.currentSeason.id).toBe(seasonId);
  });
});

describe('season state transitions', () => {
  test('fixture updates work while active on the home team day', async () => {
    const target = leagueFixtures[4];
    const home = await db.get('SELECT home_day FROM teams WHERE id = ?', [target.home_team_id]);
    const occupied = await db.all(
      `SELECT id, match_date FROM fixtures
       WHERE id <> ? AND team_season_id = ? AND match_date IS NOT NULL
         AND (home_team_id IN (?, ?) OR away_team_id IN (?, ?))`,
      [
        target.id,
        seasonId,
        target.home_team_id,
        target.away_team_id,
        target.home_team_id,
        target.away_team_id,
      ]
    );
    const occupiedDates = new Set(occupied.map((fixture) => fixture.match_date.slice(0, 10)));
    const allowed = FixtureManager.buildAllowedDatesUtc({
      scheduleStart: new Date('2026-01-05T00:00:00.000Z'),
      scheduleEnd: new Date('2026-06-30T23:59:59.999Z'),
    });
    const candidate = allowed.find((date) => {
      const weekday = date.getUTCDay() || 7;
      return weekday === home.home_day && !occupiedDates.has(date.toISOString().slice(0, 10));
    });
    const res = await auth()
      .put(`/api/fixtures/${target.id}`)
      .set(adminHeaders())
      .send({ match_date: candidate.toISOString() });
    expect(res.status).toBe(200);
    expect(res.body.match_date.slice(0, 10)).toBe(candidate.toISOString().slice(0, 10));
  });

  test('manual fixture creation rejects a duplicate pairing', async () => {
    const existing = leagueFixtures[4];
    const res = await auth()
      .post('/api/fixtures')
      .set(adminHeaders())
      .send({
        team_season_id: seasonId,
        division_id: divisionId,
        home_team_id: existing.home_team_id,
        away_team_id: existing.away_team_id,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/i);
  });

  test('division edits are blocked while the season is active', async () => {
    const res = await auth()
      .put(`/api/divisions/${divisionId}/teams`)
      .set(adminHeaders())
      .send({ teamIds: teamIds.slice(0, 2) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot be modified/i);
  });

  test('cannot delete an active season', async () => {
    const res = await auth()
      .delete(`/api/team-seasons/${seasonId}`)
      .set(adminHeaders());
    expect(res.status).toBe(400);
  });

  test('stopping the season locks fixture edits', async () => {
    const stop = await auth()
      .post(`/api/team-seasons/${seasonId}/stop`)
      .set(adminHeaders());
    expect(stop.status).toBe(200);
    expect(stop.body.status).toBe('concluded');

    const target = leagueFixtures[5];
    const res = await auth()
      .put(`/api/fixtures/${target.id}`)
      .set(adminHeaders())
      .send({ match_date: '2026-03-01T19:00:00.000Z' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/active/i);
  });

  test('reopen then delete the season', async () => {
    const reopen = await auth()
      .post(`/api/team-seasons/${seasonId}/reopen`)
      .set(adminHeaders());
    expect(reopen.status).toBe(200);
    expect(reopen.body.status).toBe('active');

    const stop = await auth()
      .post(`/api/team-seasons/${seasonId}/stop`)
      .set(adminHeaders());
    expect(stop.status).toBe(200);

    const del = await auth()
      .delete(`/api/team-seasons/${seasonId}`)
      .set(adminHeaders());
    expect(del.status).toBe(200);

    const list = await auth().get('/api/team-seasons');
    expect(list.body.find((s) => s.id === seasonId)).toBeUndefined();

    // fixtures were cascade-deleted with the season
    const remaining = await db.get(
      'SELECT COUNT(*) AS c FROM fixtures WHERE team_season_id = ?',
      [seasonId]
    );
    expect(remaining.c).toBe(0);
  });
});
