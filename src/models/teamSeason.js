const { v4: uuidv4 } = require('uuid');

class TeamSeasonManager {
  constructor(database) {
    this.db = database;
  }

  normalizeScheduleStart(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new Error('schedule_start_date is invalid');
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  }

  normalizeScheduleEnd(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new Error('schedule_end_date is invalid');
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
  }

  async getAllSeasons() {
    return this.db.all(
      `SELECT *
       FROM team_seasons
       ORDER BY
         CASE status WHEN 'active' THEN 0 WHEN 'ready' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END,
         created_at DESC`,
      []
    );
  }

  async getSeasonById(id) {
    return this.db.get('SELECT * FROM team_seasons WHERE id = ?', [id]);
  }

  async getActiveSeason() {
    return this.db.get("SELECT * FROM team_seasons WHERE status = 'active' ORDER BY start_date DESC LIMIT 1", []);
  }

  async getLatestReadySeason() {
    return this.db.get(
      "SELECT * FROM team_seasons WHERE status = 'ready' ORDER BY updated_at DESC, created_at DESC LIMIT 1",
      []
    );
  }

  async getLatestCompletedSeason() {
    return this.db.get(
      "SELECT * FROM team_seasons WHERE status = 'concluded' ORDER BY end_date DESC, start_date DESC, created_at DESC LIMIT 1",
      []
    );
  }

  async createSeason({ name, copyFromSeasonId, schedule_start_date, schedule_end_date } = {}) {
    if (!name) throw new Error('Season name is required');

    if (!schedule_start_date) throw new Error('schedule_start_date is required');
    if (!schedule_end_date) throw new Error('schedule_end_date is required');

    const start = this.normalizeScheduleStart(schedule_start_date);
    const end = this.normalizeScheduleEnd(schedule_end_date);
    if (!start) throw new Error('schedule_start_date is invalid');
    if (!end) throw new Error('schedule_end_date is invalid');
    if (end.getTime() < start.getTime()) throw new Error('schedule_end_date must be after schedule_start_date');

    const id = uuidv4();
    const trimmedName = String(name).trim();
    if (!trimmedName) throw new Error('Season name is required');

    await this.db.run('BEGIN TRANSACTION');
    try {
      await this.db.run(
        `INSERT INTO team_seasons (id, name, status, schedule_start_date, schedule_end_date)
         VALUES (?, ?, 'draft', ?, ?)`,
        [id, trimmedName, start.toISOString(), end.toISOString()]
      );

      if (copyFromSeasonId) {
        const source = await this.getSeasonById(copyFromSeasonId);
        if (!source) throw new Error('copyFromSeasonId season not found');

        const srcDivisions = await this.db.all(
          `SELECT id, name, sort_order
           FROM team_season_divisions
           WHERE team_season_id = ? AND active = 1
           ORDER BY sort_order ASC, created_at ASC`,
          [copyFromSeasonId]
        );

        if (!srcDivisions || srcDivisions.length === 0) {
          // If source has no divisions, still ensure the new season has a default division.
          const defaultDivisionId = uuidv4();
          await this.db.run(
            `INSERT INTO team_season_divisions (id, team_season_id, name, sort_order, active)
             VALUES (?, ?, 'Main Division', 0, 1)`,
            [defaultDivisionId, id]
          );
        } else {
          const idMap = new Map();
          for (const d of srcDivisions) {
            const newDivisionId = uuidv4();
            idMap.set(d.id, newDivisionId);

            await this.db.run(
              `INSERT INTO team_season_divisions (id, team_season_id, name, sort_order, active)
               VALUES (?, ?, ?, ?, 1)`,
              [newDivisionId, id, d.name, d.sort_order]
            );
          }

          // Copy team assignments
          for (const d of srcDivisions) {
            const newDivisionId = idMap.get(d.id);
            const teamRows = await this.db.all(
              `SELECT team_id
               FROM team_season_division_teams
               WHERE team_season_id = ? AND division_id = ?`,
              [copyFromSeasonId, d.id]
            );

            for (const tr of teamRows || []) {
              await this.db.run(
                `INSERT INTO team_season_division_teams (id, team_season_id, division_id, team_id)
                 VALUES (?, ?, ?, ?)`,
                [uuidv4(), id, newDivisionId, tr.team_id]
              );
            }
          }
        }
      } else {
        // Ensure every new season has at least one division.
        const defaultDivisionId = uuidv4();
        await this.db.run(
          `INSERT INTO team_season_divisions (id, team_season_id, name, sort_order, active)
           VALUES (?, ?, 'Main Division', 0, 1)`,
          [defaultDivisionId, id]
        );
      }

      await this.db.run('COMMIT');
    } catch (e) {
      try {
        await this.db.run('ROLLBACK');
      } catch (rollbackError) {
        // ignore
      }
      throw e;
    }

    return this.getSeasonById(id);
  }

  async reopenSeason(id) {
    const season = await this.getSeasonById(id);
    if (!season) throw new Error('Season not found');

    if (season.status !== 'concluded') {
      throw new Error('Only a concluded season can be reopened');
    }

    const active = await this.getActiveSeason();
    if (active && active.id !== id) {
      throw new Error('Cannot reopen while another season is active');
    }

    await this.db.run(
      `UPDATE team_seasons
       SET status = 'active',
           end_date = NULL,
           start_date = COALESCE(start_date, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [id]
    );

    return this.getSeasonById(id);
  }

  async setSeasonReady(id) {
    const season = await this.getSeasonById(id);
    if (!season) throw new Error('Season not found');
    if (season.status === 'concluded') {
      throw new Error('Cannot generate fixtures for a concluded season');
    }

    await this.db.run(
      `UPDATE team_seasons
       SET status = 'ready',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'draft'`,
      [id]
    );

    return this.getSeasonById(id);
  }

  async startSeason(id) {
    const season = await this.getSeasonById(id);
    if (!season) throw new Error('Season not found');

    if (season.status !== 'ready') {
      throw new Error('Season must be ready (fixtures generated) before starting');
    }

    // Only one active season at a time
    await this.db.run(
      `UPDATE team_seasons
       SET status = 'concluded',
           end_date = COALESCE(end_date, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE status = 'active' AND id != ?`,
      [id]
    );

    await this.db.run(
      `UPDATE team_seasons
       SET status = 'active',
           start_date = COALESCE(start_date, CURRENT_TIMESTAMP),
           end_date = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [id]
    );

    return this.getSeasonById(id);
  }

  async stopSeason(id) {
    const season = await this.getSeasonById(id);
    if (!season) throw new Error('Season not found');

    if (season.status !== 'active') {
      throw new Error('Only an active season can be closed');
    }

    await this.db.run(
      `UPDATE team_seasons
       SET status = 'concluded',
           end_date = COALESCE(end_date, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [id]
    );

    return this.getSeasonById(id);
  }

  async deleteSeason(id) {
    const season = await this.getSeasonById(id);
    if (!season) throw new Error('Season not found');

    if (season.status === 'active') {
      throw new Error('Cannot delete the active season. Finish it first.');
    }

    await this.db.run('BEGIN TRANSACTION');
    try {
      await this.db.run(
        `DELETE FROM fixture_game_sets
         WHERE fixture_game_id IN (
           SELECT fg.id
           FROM fixture_games fg
           JOIN fixtures f ON f.id = fg.fixture_id
           WHERE f.team_season_id = ?
         )`,
        [id]
      );

      await this.db.run(
        `DELETE FROM fixture_games
         WHERE fixture_id IN (
           SELECT id FROM fixtures WHERE team_season_id = ?
         )`,
        [id]
      );

      await this.db.run(
        `DELETE FROM fixture_lineups
         WHERE fixture_id IN (
           SELECT id FROM fixtures WHERE team_season_id = ?
         )`,
        [id]
      );

      await this.db.run('DELETE FROM fixtures WHERE team_season_id = ?', [id]);
      await this.db.run('DELETE FROM team_season_division_teams WHERE team_season_id = ?', [id]);
      await this.db.run('DELETE FROM team_season_divisions WHERE team_season_id = ?', [id]);
      await this.db.run('DELETE FROM team_seasons WHERE id = ?', [id]);

      await this.db.run('COMMIT');
    } catch (e) {
      try {
        await this.db.run('ROLLBACK');
      } catch (rollbackError) {
        // ignore
      }
      throw e;
    }

    return { deleted: true };
  }
}

module.exports = TeamSeasonManager;
