const Database = require('./database');

const main = async () => {
  const db = new Database();
  await db.initialize();

  try {
    await db.run('BEGIN TRANSACTION');
    try {
      // Recompute fixture_lineups.is_sub from current team_roster slot.
      // slot >= 4 => sub, otherwise main.
      await db.run(
        `UPDATE fixture_lineups
         SET is_sub = (
           SELECT CASE WHEN tr.slot >= 4 THEN 1 ELSE 0 END
           FROM fixtures f
           JOIN team_roster tr ON tr.active = 1
             AND tr.player_id = fixture_lineups.player_id
             AND tr.team_id = (CASE WHEN fixture_lineups.side = 'home' THEN f.home_team_id ELSE f.away_team_id END)
           WHERE f.id = fixture_lineups.fixture_id
           LIMIT 1
         )
         WHERE EXISTS (
           SELECT 1
           FROM fixtures f
           JOIN team_roster tr ON tr.active = 1
             AND tr.player_id = fixture_lineups.player_id
             AND tr.team_id = (CASE WHEN fixture_lineups.side = 'home' THEN f.home_team_id ELSE f.away_team_id END)
           WHERE f.id = fixture_lineups.fixture_id
         )`,
        []
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

    const counts = await db.get(
      `SELECT
         SUM(CASE WHEN is_sub = 1 THEN 1 ELSE 0 END) as sub_count,
         COUNT(*) as total_count
       FROM fixture_lineups`,
      []
    );

    console.log('Recalculated fixture_lineups.is_sub');
    console.log(counts);
  } finally {
    await db.close();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
