const Database = require('./database');

const mustGet = async (db, sql, params, label) => {
  const row = await db.get(sql, params);
  if (!row) throw new Error(`Not found: ${label}`);
  return row;
};

const main = async () => {
  const db = new Database();
  await db.initialize();

  try {
    const wayside = await mustGet(db, 'SELECT id FROM teams WHERE name = ?', ['Wayside 1'], 'Wayside 1');
    const raptors = await mustGet(db, 'SELECT id FROM teams WHERE name = ?', ['Dublin Raptors'], 'Dublin Raptors');

    const fixture = await db.get(
      `SELECT f.id, f.match_date, f.status, f.match_type,
              ht.name as home_team_name, at.name as away_team_name
       FROM fixtures f
       JOIN teams ht ON ht.id = f.home_team_id
       JOIN teams at ON at.id = f.away_team_id
       WHERE f.home_team_id = ? AND f.away_team_id = ?
       ORDER BY f.match_date DESC, f.created_at DESC
       LIMIT 1`,
      [wayside.id, raptors.id]
    );

    if (!fixture) {
      console.log('No fixture found for Wayside 1 (home) vs Dublin Raptors (away).');
      return;
    }

    const lineups = await db.all(
      `SELECT fl.side, fl.day_rank, fl.player_id, p.name as player_name,
              tr.slot as roster_slot
       FROM fixture_lineups fl
       JOIN players p ON p.id = fl.player_id
       JOIN fixtures f ON f.id = fl.fixture_id
       LEFT JOIN team_roster tr ON tr.active = 1
         AND tr.player_id = fl.player_id
         AND tr.team_id = (CASE WHEN fl.side = 'home' THEN f.home_team_id ELSE f.away_team_id END)
       WHERE fl.fixture_id = ?
       ORDER BY fl.side ASC, fl.day_rank ASC`,
      [fixture.id]
    );

    console.log('Fixture:', fixture);
    console.table(lineups);

    const slots = (side, rank) => {
      const row = lineups.find((x) => x.side === side && Number(x.day_rank) === Number(rank));
      return row ? Number(row.roster_slot) : null;
    };

    const home = { r1: slots('home', 1), r2: slots('home', 2), r3: slots('home', 3) };
    const away = { r1: slots('away', 1), r2: slots('away', 2), r3: slots('away', 3) };

    console.log('Home slots:', home);
    console.log('Away slots:', away);

    const mainOrdered = (a, b) => a != null && b != null && a >= 1 && a <= 3 && b >= 1 && b <= 3 && a <= b;
    const subAfterMain = (a, b) => !(a != null && b != null && a >= 4 && b <= 3);

    const homeMainOk = mainOrdered(home.r1, home.r2) && mainOrdered(home.r2, home.r3);
    const awayMainOk = mainOrdered(away.r1, away.r2) && mainOrdered(away.r2, away.r3);

    const homeSubOk = subAfterMain(home.r1, home.r2) && subAfterMain(home.r1, home.r3) && subAfterMain(home.r2, home.r3);
    const awaySubOk = subAfterMain(away.r1, away.r2) && subAfterMain(away.r1, away.r3) && subAfterMain(away.r2, away.r3);

    console.log('Expected rule check:');
    console.log({ homeMainOk, awayMainOk, homeSubOk, awaySubOk });
  } finally {
    await db.close();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
