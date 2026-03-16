const Database = require('./database');

const mustGet = async (db, sql, params, label) => {
  const row = await db.get(sql, params);
  if (!row) throw new Error(`Not found: ${label}`);
  return row;
};

const assertFixtureUnplayed = async (db, fixtureId) => {
  const f = await mustGet(
    db,
    `SELECT id, status, home_games_won, away_games_won
     FROM fixtures
     WHERE id = ?`,
    [fixtureId],
    `fixture ${fixtureId}`
  );

  if ((f.home_games_won || 0) !== 0 || (f.away_games_won || 0) !== 0) {
    throw new Error(`Refusing to flip fixture ${fixtureId}: it already has a score`);
  }

  const games = await db.get('SELECT COUNT(*) as count FROM fixture_games WHERE fixture_id = ?', [fixtureId]);
  if ((games?.count || 0) > 0) {
    throw new Error(`Refusing to flip fixture ${fixtureId}: fixture_games already exist`);
  }

  const lineups = await db.get('SELECT COUNT(*) as count FROM fixture_lineups WHERE fixture_id = ?', [fixtureId]);
  if ((lineups?.count || 0) > 0) {
    throw new Error(`Refusing to flip fixture ${fixtureId}: lineups already exist`);
  }
};

const main = async () => {
  const db = new Database();
  await db.initialize();

  try {
    const season = await mustGet(
      db,
      `SELECT id
       FROM team_seasons
       WHERE name = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      ['2025/2026'],
      'season 2025/2026'
    );

    const premier = await mustGet(
      db,
      `SELECT id
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
      [season.id, premier.id],
      'Premier cup'
    );

    const arklow = await mustGet(db, 'SELECT id FROM teams WHERE name = ?', ['Arklow 1'], 'Arklow 1');
    const raptors = await mustGet(db, 'SELECT id FROM teams WHERE name = ?', ['Dublin Raptors'], 'Dublin Raptors');

    const match = await db.get(
      `SELECT m.id, m.fixture_id, m.home_team_id, m.away_team_id
       FROM division_cup_matches m
       WHERE m.cup_id = ?
         AND m.fixture_id IS NOT NULL
         AND ((m.home_team_id = ? AND m.away_team_id = ?) OR (m.home_team_id = ? AND m.away_team_id = ?))
       LIMIT 1`,
      [cup.id, arklow.id, raptors.id, raptors.id, arklow.id]
    );

    if (!match) {
      throw new Error('Could not find an Arklow 1 vs Dublin Raptors cup match with an attached fixture in Premier cup');
    }

    await assertFixtureUnplayed(db, match.fixture_id);

    // If Arklow already home, nothing to do.
    if (match.home_team_id === arklow.id) {
      console.log('No changes needed: Arklow 1 is already home.');
      return;
    }

    await db.run('BEGIN TRANSACTION');
    try {
      await db.run(
        `UPDATE division_cup_matches
         SET home_team_id = ?, away_team_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [arklow.id, raptors.id, match.id]
      );

      await db.run(
        `UPDATE fixtures
         SET home_team_id = ?, away_team_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [arklow.id, raptors.id, match.fixture_id]
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

    console.log('Flipped cup fixture successfully.');
    console.log(`fixture_id=${match.fixture_id}`);
    console.log('Now: Arklow 1 (home) vs Dublin Raptors (away)');
  } finally {
    await db.close();
  }
};

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
