const request = require('supertest');
const FixtureManager = require('../src/models/fixture');
const { createTestApp, adminHeaders } = require('./helpers');

const createSeason = async (app, name, start, end) => {
  const season = await request(app)
    .post('/api/team-seasons')
    .set(adminHeaders())
    .send({ name, schedule_start_date: start, schedule_end_date: end });
  const divisions = await request(app).get(`/api/team-seasons/${season.body.id}/divisions`);
  return { season: season.body, division: divisions.body[0] };
};

const createTeam = async (app, name, homeDay) => {
  const team = await request(app)
    .post('/api/teams')
    .set(adminHeaders())
    .send({ name, home_day: homeDay });
  return team.body;
};

describe('fixture generation rules', () => {
  let app;
  let db;
  let cleanup;

  beforeAll(async () => {
    ({ app, db, cleanup } = await createTestApp('fixture-generation'));
  });

  afterAll(async () => {
    await cleanup();
  });

  test('Christmas break excludes 25 December through 6 January inclusive', () => {
    const dates = FixtureManager.buildAllowedDatesUtc({
      scheduleStart: new Date('2026-12-24T00:00:00.000Z'),
      scheduleEnd: new Date('2027-01-08T23:59:59.999Z'),
    });
    const keys = dates.map((date) => date.toISOString().slice(0, 10));

    expect(keys).toContain('2026-12-24');
    expect(keys).toContain('2027-01-07');
    expect(keys).toContain('2027-01-08');
    expect(keys.some((key) => key >= '2026-12-25' && key <= '2027-01-06')).toBe(false);
  });

  test('generated times represent 19:00 in Ireland in winter and summer', () => {
    const winter = FixtureManager.buildAllowedDatesUtc({
      scheduleStart: new Date('2027-02-02T00:00:00.000Z'),
      scheduleEnd: new Date('2027-02-02T23:59:59.999Z'),
    });
    const summer = FixtureManager.buildAllowedDatesUtc({
      scheduleStart: new Date('2027-06-01T00:00:00.000Z'),
      scheduleEnd: new Date('2027-06-01T23:59:59.999Z'),
    });

    expect(winter[0].toISOString()).toContain('T19:00:00.000Z');
    expect(summer[0].toISOString()).toContain('T18:00:00.000Z');
  });

  test('round robin gives every pair one home and one away fixture', () => {
    const rounds = FixtureManager.buildRoundRobinRounds(['a', 'b', 'c']);
    const all = [...rounds, ...rounds.map((pairs) => pairs.map(([home, away]) => [away, home]))];
    const pairs = all.flat().map(([home, away]) => `${home}-${away}`);

    expect(pairs).toHaveLength(6);
    expect(new Set(pairs).size).toBe(6);
    expect(pairs).toEqual(expect.arrayContaining(['a-b', 'b-a', 'a-c', 'c-a', 'b-c', 'c-b']));
  });

  test('uses only home days, leaves unavailable dates blank, logs counts, and rejects reruns', async () => {
    const { season, division } = await createSeason(
      app,
      'Home Day Season',
      '2027-01-04',
      '2027-01-08'
    );
    const thursday = await createTeam(app, 'Thursday Home', 4);
    const noHomeDay = await createTeam(app, 'No Home Day', null);
    await request(app)
      .put(`/api/divisions/${division.id}/teams`)
      .set(adminHeaders())
      .send({ teamIds: [thursday.id, noHomeDay.id] });

    const generated = await request(app)
      .post('/api/fixtures/generate-schedule')
      .set(adminHeaders())
      .send({ team_season_id: season.id });
    expect(generated.status).toBe(200);
    expect(generated.body).toHaveLength(2);

    const fixtures = await db.all(
      'SELECT * FROM fixtures WHERE team_season_id = ? ORDER BY match_type, home_team_id',
      [season.id]
    );
    const thursdayHome = fixtures.find(
      (fixture) => fixture.match_type === 'league' && fixture.home_team_id === thursday.id
    );
    const missingHomeDay = fixtures.find(
      (fixture) => fixture.match_type === 'league' && fixture.home_team_id === noHomeDay.id
    );
    expect(thursdayHome.match_date).toContain('2027-01-07T19:00:00.000Z');
    expect(missingHomeDay.match_date).toBeNull();

    const activity = await db.get(
      "SELECT details FROM activity_logs WHERE action = 'fixture_creation' ORDER BY id DESC LIMIT 1"
    );
    const details = JSON.parse(activity.details);
    expect(details).toMatchObject({
      leagueFixtures: 2,
      cupFixtures: 1,
      totalFixtures: 3,
      unscheduledFixtures: 2,
    });

    const rerun = await request(app)
      .post('/api/fixtures/generate-schedule')
      .set(adminHeaders())
      .send({ team_season_id: season.id });
    expect(rerun.status).toBe(400);
    expect(rerun.body.error).toMatch(/draft season|already been generated/i);

    const count = await db.get('SELECT COUNT(*) AS count FROM fixtures WHERE team_season_id = ?', [season.id]);
    expect(count.count).toBe(3);
  });

  test('rolls back every division when generation fails partway through', async () => {
    const { season, division } = await createSeason(
      app,
      'Rollback Season',
      '2027-02-01',
      '2027-05-31'
    );
    const secondDivision = await request(app)
      .post(`/api/team-seasons/${season.id}/divisions`)
      .set(adminHeaders())
      .send({ name: 'Second Division' });
    const teams = [];
    for (const [index, name] of ['Rollback A', 'Rollback B', 'Rollback C', 'Rollback D'].entries()) {
      teams.push(await createTeam(app, name, (index % 5) + 1));
    }
    await request(app)
      .put(`/api/divisions/${division.id}/teams`)
      .set(adminHeaders())
      .send({ teamIds: [teams[0].id, teams[1].id] });
    await request(app)
      .put(`/api/divisions/${secondDivision.body.id}/teams`)
      .set(adminHeaders())
      .send({ teamIds: [teams[2].id, teams[3].id] });
    await db.run('UPDATE teams SET active = 0 WHERE id = ?', [teams[3].id]);

    const generated = await request(app)
      .post('/api/fixtures/generate-schedule')
      .set(adminHeaders())
      .send({ team_season_id: season.id });
    expect(generated.status).toBe(400);
    expect(generated.body.error).toMatch(/active/i);

    const fixtures = await db.get('SELECT COUNT(*) AS count FROM fixtures WHERE team_season_id = ?', [season.id]);
    const cups = await db.get('SELECT COUNT(*) AS count FROM division_cups WHERE team_season_id = ?', [season.id]);
    const storedSeason = await db.get('SELECT status FROM team_seasons WHERE id = ?', [season.id]);
    expect(fixtures.count).toBe(0);
    expect(cups.count).toBe(0);
    expect(storedSeason.status).toBe('draft');
  });

  test('manual creation validates type, division membership, assignments, and date window', async () => {
    const { season, division } = await createSeason(
      app,
      'Manual Validation Season',
      '2027-03-01',
      '2027-03-31'
    );
    const home = await createTeam(app, 'Manual Home', 1);
    const away = await createTeam(app, 'Manual Away', 2);
    const outsider = await createTeam(app, 'Manual Outsider', 3);
    await request(app)
      .put(`/api/divisions/${division.id}/teams`)
      .set(adminHeaders())
      .send({ teamIds: [home.id, away.id] });

    const invalidType = await request(app)
      .post('/api/fixtures')
      .set(adminHeaders())
      .send({
        team_season_id: season.id,
        division_id: division.id,
        home_team_id: home.id,
        away_team_id: away.id,
        match_type: 'friendly',
      });
    expect(invalidType.status).toBe(400);

    const wrongTeam = await request(app)
      .post('/api/fixtures')
      .set(adminHeaders())
      .send({
        team_season_id: season.id,
        division_id: division.id,
        home_team_id: home.id,
        away_team_id: outsider.id,
      });
    expect(wrongTeam.status).toBe(400);

    const outsideWindow = await request(app)
      .post('/api/fixtures')
      .set(adminHeaders())
      .send({
        team_season_id: season.id,
        division_id: division.id,
        home_team_id: home.id,
        away_team_id: away.id,
        match_date: '2027-04-01T19:00:00.000Z',
      });
    expect(outsideWindow.status).toBe(400);

    const valid = await request(app)
      .post('/api/fixtures')
      .set(adminHeaders())
      .send({
        team_season_id: season.id,
        division_id: division.id,
        home_team_id: home.id,
        away_team_id: away.id,
        match_date: '2027-03-01T19:00:00.000Z',
      });
    expect(valid.status).toBe(201);
  });
});
