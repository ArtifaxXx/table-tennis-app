const Database = require('./database');

const mustGet = async (db, sql, params, label) => {
  const row = await db.get(sql, params);
  if (!row) throw new Error(`Not found: ${label}`);
  return row;
};

const assertFixtureUnplayed = async (db, fixtureId) => {
  const f = await db.get(
    `SELECT id, status, home_games_won, away_games_won
     FROM fixtures
     WHERE id = ?`,
    [fixtureId]
  );
  if (!f) throw new Error(`Fixture not found: ${fixtureId}`);

  if ((f.home_games_won || 0) !== 0 || (f.away_games_won || 0) !== 0) {
    throw new Error(`Refusing to modify fixture ${fixtureId}: it already has a score`);
  }

  const games = await db.get('SELECT COUNT(*) as count FROM fixture_games WHERE fixture_id = ?', [fixtureId]);
  if ((games?.count || 0) > 0) {
    throw new Error(`Refusing to modify fixture ${fixtureId}: fixture_games already exist`);
  }

  const lineups = await db.get('SELECT COUNT(*) as count FROM fixture_lineups WHERE fixture_id = ?', [fixtureId]);
  if ((lineups?.count || 0) > 0) {
    throw new Error(`Refusing to modify fixture ${fixtureId}: lineups already exist`);
  }
};

const main = async () => {
  const db = new Database();
  await db.initialize();

  try {
    const season = await mustGet(
      db,
      `SELECT id, name
       FROM team_seasons
       WHERE name = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      ['2025/2026'],
      'season 2025/2026'
    );

    const division = await mustGet(
      db,
      `SELECT id, name
       FROM team_season_divisions
       WHERE team_season_id = ? AND name = ?`,
      [season.id, 'Premier'],
      'Premier division'
    );

    const cup = await mustGet(
      db,
      `SELECT id
       FROM division_cups
       WHERE team_season_id = ? AND division_id = ?`,
      [season.id, division.id],
      'Premier cup'
    );

    const matches = await db.all(
      `SELECT id, round_number, match_number, fixture_id
       FROM division_cup_matches
       WHERE cup_id = ?
       ORDER BY round_number ASC, match_number ASC`,
      [cup.id]
    );

    const byKey = new Map(matches.map((m) => [`${m.round_number}:${m.match_number}`, m]));

    const getMatch = (r, m) => {
      const row = byKey.get(`${r}:${m}`);
      if (!row) throw new Error(`Missing cup match ${r}:${m}`);
      return row;
    };

    // Existing fixtures we will rewire.
    const fixtureR1 = getMatch(1, 4).fixture_id; // currently a real R1 fixture
    const fixtureSemi = getMatch(2, 1).fixture_id; // currently a real semi fixture

    if (!fixtureR1) throw new Error('Expected round 1 match 4 to have a fixture_id');
    if (!fixtureSemi) throw new Error('Expected round 2 match 1 to have a fixture_id');

    await assertFixtureUnplayed(db, fixtureR1);
    await assertFixtureUnplayed(db, fixtureSemi);

    const teamWayside1 = await mustGet(db, 'SELECT id FROM teams WHERE name = ?', ['Wayside 1'], 'Wayside 1');
    const teamWayside2 = await mustGet(db, 'SELECT id FROM teams WHERE name = ?', ['Wayside 2'], 'Wayside 2');
    const teamRaptors = await mustGet(db, 'SELECT id FROM teams WHERE name = ?', ['Dublin Raptors'], 'Dublin Raptors');
    const teamRoundwood = await mustGet(db, 'SELECT id FROM teams WHERE name = ?', ['Roundwood 1'], 'Roundwood 1');
    const teamArklow = await mustGet(db, 'SELECT id FROM teams WHERE name = ?', ['Arklow 1'], 'Arklow 1');

    // Desired structure:
    // R1: (1) Wayside1 bye, (2) Wayside2 bye, (3) Raptors bye, (4) Roundwood vs Arklow
    // R2: (1) Wayside1 vs Wayside2, (2) Raptors vs Winner(Roundwood/Arklow)
    // R3: Final

    const r1_1 = getMatch(1, 1);
    const r1_2 = getMatch(1, 2);
    const r1_3 = getMatch(1, 3);
    const r1_4 = getMatch(1, 4);
    const r2_1 = getMatch(2, 1);
    const r2_2 = getMatch(2, 2);
    const r3_1 = getMatch(3, 1);

    await db.run('BEGIN TRANSACTION');
    try {
      // Rewire next_match_id pointers.
      await db.run(
        `UPDATE division_cup_matches
         SET next_match_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id IN (?, ?)` ,
        [r2_1.id, r1_1.id, r1_2.id]
      );
      await db.run(
        `UPDATE division_cup_matches
         SET next_match_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id IN (?, ?)` ,
        [r2_2.id, r1_3.id, r1_4.id]
      );
      await db.run(
        `UPDATE division_cup_matches
         SET next_match_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id IN (?, ?)` ,
        [r3_1.id, r2_1.id, r2_2.id]
      );
      await db.run(
        `UPDATE division_cup_matches
         SET next_match_id = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [r3_1.id]
      );

      // Round 1 byes.
      await db.run(
        `UPDATE division_cup_matches
         SET home_team_id = ?, away_team_id = NULL, winner_team_id = ?, fixture_id = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [teamWayside1.id, teamWayside1.id, r1_1.id]
      );
      await db.run(
        `UPDATE division_cup_matches
         SET home_team_id = ?, away_team_id = NULL, winner_team_id = ?, fixture_id = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [teamWayside2.id, teamWayside2.id, r1_2.id]
      );
      await db.run(
        `UPDATE division_cup_matches
         SET home_team_id = ?, away_team_id = NULL, winner_team_id = ?, fixture_id = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [teamRaptors.id, teamRaptors.id, r1_3.id]
      );

      // Round 1 real match.
      await db.run(
        `UPDATE division_cup_matches
         SET home_team_id = ?, away_team_id = ?, winner_team_id = NULL, fixture_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [teamRoundwood.id, teamArklow.id, fixtureR1, r1_4.id]
      );

      // Semi 1: Wayside1 vs Wayside2, using existing semi fixture.
      await db.run(
        `UPDATE division_cup_matches
         SET home_team_id = ?, away_team_id = ?, winner_team_id = NULL, fixture_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [teamWayside1.id, teamWayside2.id, fixtureSemi, r2_1.id]
      );

      // Semi 2: Raptors vs TBD (winner of R1_4). No fixture until decided.
      await db.run(
        `UPDATE division_cup_matches
         SET home_team_id = ?, away_team_id = NULL, winner_team_id = NULL, fixture_id = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [teamRaptors.id, r2_2.id]
      );

      // Final: clear any accidental values.
      await db.run(
        `UPDATE division_cup_matches
         SET home_team_id = NULL, away_team_id = NULL, winner_team_id = NULL, fixture_id = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [r3_1.id]
      );

      // Update fixtures to match rewired matches.
      await db.run(
        `UPDATE fixtures
         SET home_team_id = ?, away_team_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [teamRoundwood.id, teamArklow.id, fixtureR1]
      );

      await db.run(
        `UPDATE fixtures
         SET home_team_id = ?, away_team_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [teamWayside1.id, teamWayside2.id, fixtureSemi]
      );

      await db.run('COMMIT');
    } catch (e) {
      try {
        await db.run('ROLLBACK');
      } catch (ignore) {
        // ignore
      }
      throw e;
    }

    console.log('Premier cup bracket updated successfully.');
    console.log(`Cup: ${cup.id}`);
    console.log(`R1 fixture (Roundwood vs Arklow): ${fixtureR1}`);
    console.log(`Semi fixture (Wayside 1 vs Wayside 2): ${fixtureSemi}`);
    console.log('Note: Raptors semi fixture will be created once Roundwood vs Arklow winner is known.');
  } finally {
    await db.close();
  }
};

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
