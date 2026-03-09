const { v4: uuidv4 } = require('uuid');

class TeamSeasonDivisionManager {
  constructor(database) {
    this.db = database;
  }

  async assertSeasonIsMutable(teamSeasonId) {
    const season = await this.db.get('SELECT id, status FROM team_seasons WHERE id = ?', [teamSeasonId]);
    if (!season) throw new Error('Season not found');

    if (!['draft', 'ready'].includes(season.status)) {
      throw new Error('Season divisions cannot be modified once the season is active or concluded');
    }
  }

  async getDivisionsBySeason(teamSeasonId) {
    return this.db.all(
      `SELECT *
       FROM team_season_divisions
       WHERE team_season_id = ? AND active = 1
       ORDER BY sort_order ASC, name ASC`,
      [teamSeasonId]
    );
  }

  async getDivisionById(divisionId) {
    return this.db.get('SELECT * FROM team_season_divisions WHERE id = ?', [divisionId]);
  }

  async getDefaultDivisionForSeason(teamSeasonId) {
    return this.db.get(
      `SELECT *
       FROM team_season_divisions
       WHERE team_season_id = ? AND active = 1
       ORDER BY sort_order ASC, created_at ASC
       LIMIT 1`,
      [teamSeasonId]
    );
  }

  async createDivision(teamSeasonId, data) {
    const name = (data && data.name ? String(data.name) : '').trim();
    if (!name) throw new Error('Division name is required');

    await this.assertSeasonIsMutable(teamSeasonId);

    const id = uuidv4();
    const sort_order = Number.isFinite(data?.sort_order) ? data.sort_order : 0;

    await this.db.run(
      `INSERT INTO team_season_divisions (id, team_season_id, name, sort_order, active)
       VALUES (?, ?, ?, ?, 1)`,
      [id, teamSeasonId, name, sort_order]
    );

    return this.getDivisionById(id);
  }

  async updateDivision(divisionId, data) {
    const division = await this.getDivisionById(divisionId);
    if (!division) throw new Error('Division not found');

    await this.assertSeasonIsMutable(division.team_season_id);

    const name = data?.name !== undefined ? String(data.name).trim() : division.name;
    const sort_order = data?.sort_order !== undefined ? Number(data.sort_order) : division.sort_order;

    if (!name) throw new Error('Division name is required');

    await this.db.run(
      `UPDATE team_season_divisions
       SET name = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, sort_order, divisionId]
    );

    return this.getDivisionById(divisionId);
  }

  async deleteDivision(divisionId) {
    const division = await this.getDivisionById(divisionId);
    if (!division) throw new Error('Division not found');

    await this.assertSeasonIsMutable(division.team_season_id);

    const hasTeams = await this.db.get(
      'SELECT COUNT(*) as count FROM team_season_division_teams WHERE division_id = ?',
      [divisionId]
    );
    if ((hasTeams?.count || 0) > 0) throw new Error('Cannot delete division with assigned teams');

    const hasFixtures = await this.db.get('SELECT COUNT(*) as count FROM fixtures WHERE division_id = ?', [divisionId]);
    if ((hasFixtures?.count || 0) > 0) throw new Error('Cannot delete division with fixtures');

    await this.db.run('DELETE FROM team_season_divisions WHERE id = ?', [divisionId]);
    return { ok: true };
  }

  async getDivisionTeams(divisionId) {
    const division = await this.getDivisionById(divisionId);
    if (!division) throw new Error('Division not found');

    return this.db.all(
      `SELECT t.id, t.name
       FROM team_season_division_teams dt
       JOIN teams t ON dt.team_id = t.id
       WHERE dt.division_id = ?
       ORDER BY t.name ASC`,
      [divisionId]
    );
  }

  async setDivisionTeams(divisionId, teamIds) {
    const division = await this.getDivisionById(divisionId);
    if (!division) throw new Error('Division not found');

    await this.assertSeasonIsMutable(division.team_season_id);

    if (!Array.isArray(teamIds)) throw new Error('teamIds must be an array');

    const unique = new Set(teamIds.filter(Boolean));
    if (unique.size !== teamIds.filter(Boolean).length) throw new Error('Duplicate team IDs');

    if (unique.size > 0) {
      const rows = await this.db.all(
        `SELECT id FROM teams WHERE id IN (${Array.from(unique).map(() => '?').join(',')}) AND active = 1`,
        Array.from(unique)
      );
      if (rows.length !== unique.size) throw new Error('One or more teams not found or inactive');
    }

    await this.db.run('BEGIN TRANSACTION');
    try {
      await this.db.run('DELETE FROM team_season_division_teams WHERE division_id = ?', [divisionId]);

      for (const teamId of unique) {
        await this.db.run(
          `INSERT INTO team_season_division_teams (id, team_season_id, division_id, team_id)
           VALUES (?, ?, ?, ?)`,
          [uuidv4(), division.team_season_id, divisionId, teamId]
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

    return this.getDivisionTeams(divisionId);
  }

  async getTeamIdsForDivision(divisionId) {
    const rows = await this.db.all(
      `SELECT team_id
       FROM team_season_division_teams
       WHERE division_id = ?`,
      [divisionId]
    );
    return rows.map((r) => r.team_id);
  }
}

module.exports = TeamSeasonDivisionManager;
