const request = require('supertest');
const { createTestApp, adminHeaders } = require('./helpers');

const createSeason = async (app, name, start, end) => {
  const season = await request(app)
    .post('/api/team-seasons')
    .set(adminHeaders())
    .send({ name, schedule_start_date: start, schedule_end_date: end });
  const divisions = await request(app).get(`/api/team-seasons/${season.body.id}/divisions`);
  return { season: season.body, division: divisions.body[0] };
};

const createDivision = async (app, seasonId, name) => {
  const res = await request(app)
    .post(`/api/team-seasons/${seasonId}/divisions`)
    .set(adminHeaders())
    .send({ name });
  return res.body;
};

const createClub = async (app, name, overrides = {}, headers = adminHeaders()) => {
  const res = await request(app)
    .post('/api/clubs')
    .set(headers)
    .send({ name, ...overrides });
  return res;
};

const createTeam = async (app, name, fields = {}) => {
  const res = await request(app)
    .post('/api/teams')
    .set(adminHeaders())
    .send({ name, ...fields });
  return res.body;
};

const assignTeams = async (app, divisionId, teamIds) => {
  await request(app)
    .put(`/api/divisions/${divisionId}/teams`)
    .set(adminHeaders())
    .send({ teamIds });
};

const leagueHomeDatesByTeam = (fixtures) => {
  const map = new Map();
  for (const fixture of fixtures) {
    if (fixture.match_type !== 'league') continue;
    map.set(fixture.home_team_id, fixture.match_date);
  }
  return map;
};

describe('clubs', () => {
  let app;
  let db;
  let cleanup;

  beforeAll(async () => {
    ({ app, db, cleanup } = await createTestApp('clubs'));
  });

  afterAll(async () => {
    await cleanup();
  });

  test('club CRUD validation and permissions', async () => {
    const publicList = await request(app).get('/api/clubs');
    expect(publicList.status).toBe(200);
    expect(Array.isArray(publicList.body)).toBe(true);

    const viewerCreate = await request(app)
      .post('/api/clubs')
      .send({ name: 'Viewer Club' });
    expect(viewerCreate.status).toBe(403);

    const created = await createClub(app, 'Capacity Club');
    expect(created.status).toBe(201);
    expect(created.body.simultaneous_fixtures).toBe(1);

    for (const bad of [0, 4, 'x', 2.5]) {
      const invalid = await createClub(app, `Bad ${bad}`, { simultaneous_fixtures: bad });
      expect(invalid.status).toBe(400);
    }

    const updated = await request(app)
      .put(`/api/clubs/${created.body.id}`)
      .set(adminHeaders())
      .send({ address: '1 Main Street', simultaneous_fixtures: 3 });
    expect(updated.status).toBe(200);
    expect(updated.body.address).toBe('1 Main Street');
    expect(updated.body.simultaneous_fixtures).toBe(3);

    const viewerUpdate = await request(app)
      .put(`/api/clubs/${created.body.id}`)
      .send({ name: 'Nope' });
    expect(viewerUpdate.status).toBe(403);

    const viewerDelete = await request(app).delete(`/api/clubs/${created.body.id}`);
    expect(viewerDelete.status).toBe(403);

    const deleted = await request(app)
      .delete(`/api/clubs/${created.body.id}`)
      .set(adminHeaders());
    expect(deleted.status).toBe(204);
  });

  test('stewards can manage clubs', async () => {
    const steward = await request(app)
      .post('/api/admin/users')
      .set(adminHeaders())
      .send({ name: 'club-steward', password: 'steward-pass' });
    expect(steward.status).toBe(200);
    const stewardHeaders = { 'X-Admin-Name': 'club-steward', 'X-Admin-Password': 'steward-pass' };

    const created = await createClub(app, 'Steward Club', {}, stewardHeaders);
    expect(created.status).toBe(201);

    const updated = await request(app)
      .put(`/api/clubs/${created.body.id}`)
      .set(stewardHeaders)
      .send({ simultaneous_fixtures: 2 });
    expect(updated.status).toBe(200);
    expect(updated.body.simultaneous_fixtures).toBe(2);

    const deleted = await request(app)
      .delete(`/api/clubs/${created.body.id}`)
      .set(stewardHeaders);
    expect(deleted.status).toBe(204);
  });

  test('teams assign to clubs and support multiple home days', async () => {
    const club = await createClub(app, 'Multi Day Club');
    const team = await createTeam(app, 'Multi Day Team', {
      club_id: club.body.id,
      home_days: [1, 3, 5],
    });
    expect(team.club_id).toBe(club.body.id);
    expect(team.club_name).toBe('Multi Day Club');
    expect(team.home_days).toEqual([1, 3, 5]);

    const invalidDays = await request(app)
      .post('/api/teams')
      .set(adminHeaders())
      .send({ name: 'Bad Days', home_days: [6] });
    expect(invalidDays.status).toBe(400);

    const updated = await request(app)
      .put(`/api/teams/${team.id}`)
      .set(adminHeaders())
      .send({ home_days: [2] });
    expect(updated.status).toBe(200);
    expect(updated.body.home_days).toEqual([2]);

    const cleared = await request(app)
      .put(`/api/teams/${team.id}`)
      .set(adminHeaders())
      .send({ home_days: [] });
    expect(cleared.body.home_days).toEqual([]);

    const occupied = await request(app)
      .delete(`/api/clubs/${club.body.id}`)
      .set(adminHeaders());
    expect(occupied.status).toBe(400);
    expect(occupied.body.error).toMatch(/active teams/i);
  });

  test('teams sharing a legacy address resolve to the same club', async () => {
    const first = await createTeam(app, 'Legacy Alpha', { club_address: 'Shared Venue Hall' });
    const second = await createTeam(app, 'Legacy Beta', { club_address: 'Shared Venue Hall' });
    expect(first.club_id).toBeTruthy();
    expect(first.club_id).toBe(second.club_id);

    const club = await request(app).get(`/api/clubs/${first.club_id}`);
    expect(club.body.address).toBe('Shared Venue Hall');
  });

  test('backfill groups unassigned teams by club address', async () => {
    const alpha = await createTeam(app, 'Backfill Alpha');
    const beta = await createTeam(app, 'Backfill Beta');
    await db.run('UPDATE teams SET club_id = NULL, club_address = ? WHERE id IN (?, ?)', [
      'Backfill Venue', alpha.id, beta.id,
    ]);
    await db.run('UPDATE teams SET club_id = NULL, club_address = ? WHERE id = ?', [
      'Other Venue', (await createTeam(app, 'Backfill Gamma')).id,
    ]);

    await db.ensureClubsBackfill();
    await db.ensureClubsBackfill();

    const rows = await db.all(
      'SELECT id, club_id FROM teams WHERE name LIKE ? ORDER BY name',
      ['Backfill %']
    );
    expect(rows[0].club_id).toBe(rows[1].club_id);
    expect(rows[0].club_id).not.toBe(rows[2].club_id);
    expect(rows[2].club_id).toBeTruthy();

    const clubs = await db.all(
      'SELECT id, address FROM clubs WHERE address IN (?, ?)',
      ['Backfill Venue', 'Other Venue']
    );
    expect(clubs).toHaveLength(2);
  });

  test('generation spreads club fixtures within capacity across divisions', async () => {
    const clubA = await createClub(app, 'Venue One', { simultaneous_fixtures: 1 });
    const clubB = await createClub(app, 'Venue Two', { simultaneous_fixtures: 1 });

    const home1 = await createTeam(app, 'Cap Home One', { club_id: clubA.body.id });
    const away1 = await createTeam(app, 'Cap Away One', { club_id: clubB.body.id });
    const home2 = await createTeam(app, 'Cap Home Two', { club_id: clubA.body.id });
    const away2 = await createTeam(app, 'Cap Away Two', { club_id: clubB.body.id });

    const { season, division } = await createSeason(app, 'Capacity Season', '2027-02-08', '2027-02-09');
    const division2 = await createDivision(app, season.id, 'Second Division');
    await assignTeams(app, division.id, [home1.id, away1.id]);
    await assignTeams(app, division2.id, [home2.id, away2.id]);

    const generated = await request(app)
      .post('/api/fixtures/generate-schedule')
      .set(adminHeaders())
      .send({ team_season_id: season.id });
    expect(generated.status).toBe(200);

    const fixtures = await db.all(
      `SELECT f.*, ht.club_id AS home_club_id
       FROM fixtures f
       JOIN teams ht ON ht.id = f.home_team_id
       WHERE f.team_season_id = ? AND f.match_type = 'league' AND f.match_date IS NOT NULL`,
      [season.id]
    );
    expect(fixtures).toHaveLength(4);

    const homeDates = leagueHomeDatesByTeam(fixtures);
    // Capacity 1 per club: the two home fixtures of each club must land on different dates.
    expect(homeDates.get(home1.id)).not.toBe(homeDates.get(home2.id));
    expect(homeDates.get(away1.id)).not.toBe(homeDates.get(away2.id));

    const perClubDate = new Map();
    for (const fixture of fixtures) {
      const key = `${fixture.home_club_id}:${String(fixture.match_date).slice(0, 10)}`;
      perClubDate.set(key, (perClubDate.get(key) || 0) + 1);
    }
    for (const count of perClubDate.values()) {
      expect(count).toBeLessThanOrEqual(1);
    }
  });

  test('generation leaves dates blank when club capacity is exhausted', async () => {
    const club = await createClub(app, 'Tiny Venue', { simultaneous_fixtures: 1 });
    const home = await createTeam(app, 'Tiny Home', { club_id: club.body.id });
    const away = await createTeam(app, 'Tiny Away', { club_id: club.body.id });

    // Single eligible date: the pair can only play once and the club can host once.
    const { season, division } = await createSeason(app, 'Tiny Season', '2027-02-08', '2027-02-08');
    await assignTeams(app, division.id, [home.id, away.id]);

    const generated = await request(app)
      .post('/api/fixtures/generate-schedule')
      .set(adminHeaders())
      .send({ team_season_id: season.id });
    expect(generated.status).toBe(200);

    const fixtures = await db.all(
      'SELECT * FROM fixtures WHERE team_season_id = ? AND match_type = ?',
      [season.id, 'league']
    );
    expect(fixtures).toHaveLength(2);
    const scheduled = fixtures.filter((f) => f.match_date);
    const blank = fixtures.filter((f) => !f.match_date);
    expect(scheduled).toHaveLength(1);
    expect(blank).toHaveLength(1);
  });

  test('manual fixture creation ignores club capacity', async () => {
    const club = await createClub(app, 'Manual Venue', { simultaneous_fixtures: 1 });
    const home = await createTeam(app, 'Manual Cap Home', { club_id: club.body.id });
    const away = await createTeam(app, 'Manual Cap Away', { club_id: club.body.id });
    const third = await createTeam(app, 'Manual Cap Third', { club_id: club.body.id });

    const { season, division } = await createSeason(app, 'Manual Cap Season', '2027-03-01', '2027-03-31');
    await assignTeams(app, division.id, [home.id, away.id, third.id]);

    const sameDay = '2027-03-02T19:00:00.000Z';
    const first = await request(app)
      .post('/api/fixtures')
      .set(adminHeaders())
      .send({
        team_season_id: season.id,
        division_id: division.id,
        home_team_id: home.id,
        away_team_id: away.id,
        match_date: sameDay,
      });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/fixtures')
      .set(adminHeaders())
      .send({
        team_season_id: season.id,
        division_id: division.id,
        home_team_id: third.id,
        away_team_id: away.id,
        match_date: sameDay,
      });
    expect(second.status).toBe(201);
  });
});
