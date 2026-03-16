const Database = require('./database');

const main = async () => {
  const db = new Database();
  await db.initialize();

  try {
    const season = await db.get(
      `SELECT id
       FROM team_seasons
       WHERE name = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      ['2025/2026']
    );
    if (!season) throw new Error('Season 2025/2026 not found');

    const division = await db.get(
      `SELECT id
       FROM team_season_divisions
       WHERE team_season_id = ? AND name = ?`,
      [season.id, 'Premier']
    );
    if (!division) throw new Error('Premier division not found');

    const cup = await db.get(
      `SELECT id
       FROM division_cups
       WHERE team_season_id = ? AND division_id = ?`,
      [season.id, division.id]
    );
    if (!cup) throw new Error('Premier cup not found');

    const teamById = new Map((await db.all('SELECT id, name FROM teams', [])).map((t) => [t.id, t.name]));

    const matches = await db.all(
      `SELECT round_number, match_number, fixture_id, home_team_id, away_team_id, winner_team_id
       FROM division_cup_matches
       WHERE cup_id = ?
       ORDER BY round_number ASC, match_number ASC`,
      [cup.id]
    );

    console.log(`Cup: ${cup.id}`);
    for (const m of matches) {
      const home = teamById.get(m.home_team_id) || 'TBD';
      const away = teamById.get(m.away_team_id) || 'TBD';
      const winner = m.winner_team_id ? teamById.get(m.winner_team_id) : '-';
      console.log(
        `R${m.round_number} M${m.match_number}: ${home} vs ${away} | winner=${winner} | fixture=${m.fixture_id || '-'}`
      );
    }
  } finally {
    await db.close();
  }
};

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
