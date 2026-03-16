const Database = require('./database');

const main = async () => {
  const db = new Database();
  await db.initialize();

  try {
    const season = await db.get(
      `SELECT *
       FROM team_seasons
       ORDER BY created_at DESC
       LIMIT 1`,
      []
    );

    if (!season) {
      throw new Error('No seasons found');
    }

    await db.run(
      `UPDATE team_seasons
       SET name = ?,
           status = 'draft',
           start_date = NULL,
           end_date = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      ['2025/2026', season.id]
    );

    const updated = await db.get('SELECT * FROM team_seasons WHERE id = ?', [season.id]);
    console.log(`Updated season: ${updated.id} -> ${updated.name} (${updated.status})`);
  } finally {
    await db.close();
  }
};

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
