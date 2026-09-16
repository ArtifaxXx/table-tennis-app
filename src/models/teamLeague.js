class TeamLeagueManager {
  constructor(database) {
    this.db = database;
  }

  async getDashboardStatistics(teamSeasonId, divisionId = null) {
    const totalTeams = await this.db.get('SELECT COUNT(*) as count FROM teams WHERE active = 1');
    const totalPlayers = await this.db.get('SELECT COUNT(*) as count FROM players WHERE active = 1');

    const where = [];
    const params = [];
    if (teamSeasonId) {
      where.push('team_season_id = ?');
      params.push(teamSeasonId);
    }
    if (divisionId) {
      where.push('division_id = ?');
      params.push(divisionId);
    }
    const whereSql = where.length > 0 ? `AND ${where.join(' AND ')}` : '';

    const completedFixtures = await this.db.get(
      `SELECT COUNT(*) as count FROM fixtures WHERE status = 'completed' ${whereSql}`,
      params
    );
    const inProgressFixtures = await this.db.get(
      `SELECT COUNT(*) as count FROM fixtures WHERE status = 'in_progress' ${whereSql}`,
      params
    );
    const scheduledFixtures = await this.db.get(
      `SELECT COUNT(*) as count FROM fixtures WHERE status = 'scheduled' ${whereSql}`,
      params
    );

    const upcomingFixtures = await this.db.all(
      `SELECT f.id,
              f.match_date,
              ht.name as home_team_name,
              at.name as away_team_name
       FROM fixtures f
       JOIN teams ht ON f.home_team_id = ht.id
       JOIN teams at ON f.away_team_id = at.id
       WHERE f.status = 'scheduled'
         AND f.match_date IS NOT NULL
         AND datetime(f.match_date) >= datetime('now')
         ${whereSql}
       ORDER BY f.match_date ASC
       LIMIT 5`,
      params
    );

    const recentFixtures = await this.db.all(
      `SELECT f.id,
              f.match_date,
              f.home_matches_won,
              f.away_matches_won,
              ht.name as home_team_name,
              at.name as away_team_name,
              CASE
                WHEN (
                  (SELECT COUNT(DISTINCT fl.day_rank)
                   FROM fixture_lineups fl
                   WHERE fl.fixture_id = f.id AND fl.side = 'home' AND fl.day_rank IN (1,2,3)) < 3
                  OR
                  (SELECT COUNT(DISTINCT fl.day_rank)
                   FROM fixture_lineups fl
                   WHERE fl.fixture_id = f.id AND fl.side = 'away' AND fl.day_rank IN (1,2,3)) < 3
                ) THEN 'missing_lineups'
                WHEN (SELECT COUNT(*) FROM fixture_matches fg WHERE fg.fixture_id = f.id) < 9 THEN 'missing_matches'
                WHEN EXISTS (
                  SELECT 1
                  FROM fixture_matches fg
                  WHERE fg.fixture_id = f.id
                    AND (SELECT COUNT(*) FROM fixture_match_games s WHERE s.fixture_match_id = fg.id) < 3
                ) THEN 'missing_games'
                ELSE 'complete'
              END as completeness_status
       FROM fixtures f
       JOIN teams ht ON f.home_team_id = ht.id
       JOIN teams at ON f.away_team_id = at.id
       WHERE f.status = 'completed'
       ${teamSeasonId ? 'AND f.team_season_id = ?' : ''}
       ${divisionId ? 'AND f.division_id = ?' : ''}
       ORDER BY f.match_date DESC, f.updated_at DESC
       LIMIT 5`,
      teamSeasonId
        ? (divisionId ? [teamSeasonId, divisionId] : [teamSeasonId])
        : (divisionId ? [divisionId] : [])
    );

    const topTeams = (await this.getStandings(teamSeasonId, divisionId)).slice(0, 5);
    const topPlayers = (await this.getPlayerRankings(teamSeasonId, divisionId)).slice(0, 5);

    return {
      totalTeams: totalTeams.count,
      totalPlayers: totalPlayers.count,
      completedFixtures: completedFixtures.count,
      inProgressFixtures: inProgressFixtures.count,
      scheduledFixtures: scheduledFixtures.count,
      upcomingFixtures: upcomingFixtures || [],
      recentFixtures,
      topTeams,
      topPlayers,
    };
  }

  async getStandings(teamSeasonId, divisionId = null) {
    let teams;
    if (divisionId) {
      // For a given division, standings should remain stable even if a team is later deactivated.
      teams = await this.db.all(
        `SELECT t.id, t.name
         FROM team_season_division_teams dt
         JOIN teams t ON dt.team_id = t.id
         WHERE dt.division_id = ?
         ORDER BY t.name`,
        [divisionId]
      );
    } else if (teamSeasonId) {
      // For a season-wide view, include any team that appears in that season's fixtures,
      // regardless of whether the team is currently active.
      teams = await this.db.all(
        `SELECT DISTINCT t.id, t.name
         FROM fixtures f
         JOIN teams t ON t.id = f.home_team_id OR t.id = f.away_team_id
         WHERE f.team_season_id = ?
         ORDER BY t.name`,
        [teamSeasonId]
      );
    } else {
      // No season context: only include active teams.
      teams = await this.db.all('SELECT id, name FROM teams WHERE active = 1 ORDER BY name', []);
    }

    if (!teams || teams.length === 0) {
      return [];
    }

    const where = ["f.status = 'completed'", "(f.match_type IS NULL OR f.match_type = 'league')"];
    const params = [];
    if (teamSeasonId) {
      where.push('f.team_season_id = ?');
      params.push(teamSeasonId);
    }
    if (divisionId) {
      where.push('f.division_id = ?');
      params.push(divisionId);
    }
    const fixtures = await this.db.all(
      `SELECT f.*,
              ht.name as home_team_name,
              at.name as away_team_name
       FROM fixtures f
       JOIN teams ht ON f.home_team_id = ht.id
       JOIN teams at ON f.away_team_id = at.id
       WHERE ${where.join(' AND ')}`,
      params
    );

    const base = new Map();
    for (const t of teams) {
      base.set(t.id, {
        team_id: t.id,
        team_name: t.name,
        played: 0,
        wins: 0,
        losses: 0,
        matches_won: 0,
        matches_lost: 0,
        games_won: 0,
        games_lost: 0,
      });
    }

    for (const f of fixtures) {
      const home = base.get(f.home_team_id);
      const away = base.get(f.away_team_id);
      if (!home || !away) continue;

      home.played++;
      away.played++;

      home.matches_won += f.home_matches_won || 0;
      home.matches_lost += f.away_matches_won || 0;
      away.matches_won += f.away_matches_won || 0;
      away.matches_lost += f.home_matches_won || 0;

      home.games_won += f.home_games_won || 0;
      home.games_lost += f.away_games_won || 0;
      away.games_won += f.away_games_won || 0;
      away.games_lost += f.home_games_won || 0;

      const homeWon = (f.home_matches_won || 0) > (f.away_matches_won || 0);
      const awayWon = (f.away_matches_won || 0) > (f.home_matches_won || 0);

      if (homeWon) {
        home.wins++;
        away.losses++;
      } else if (awayWon) {
        away.wins++;
        home.losses++;
      }
    }

    const rows = Array.from(base.values());

    rows.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.matches_won !== a.matches_won) return b.matches_won - a.matches_won;
      if (b.games_won !== a.games_won) return b.games_won - a.games_won;
      return a.team_name.localeCompare(b.team_name);
    });

    const withDiffs = rows.map((r) => ({
      ...r,
      matches_diff: r.matches_won - r.matches_lost,
      games_diff: r.games_won - r.games_lost,
    }));

    const isFullyTied = (a, b) => (
      a.wins === b.wins &&
      a.matches_won === b.matches_won &&
      a.games_won === b.games_won
    );

    // Competition ranking: 1,2,2,4 (ties share the same place)
    const ranked = [];
    let i = 0;
    let currentRank = 1;
    while (i < withDiffs.length) {
      const group = [withDiffs[i]];
      let j = i + 1;
      while (j < withDiffs.length && isFullyTied(withDiffs[j], withDiffs[i])) {
        group.push(withDiffs[j]);
        j++;
      }

      for (const r of group) {
        ranked.push({ ...r, rank: currentRank });
      }

      currentRank += group.length;
      i = j;
    }

    return ranked;
  }

  async getPlayerRankings(teamSeasonId, divisionId = null) {
    let basePlayersSql = '';
    let basePlayersParams = [];

    if (divisionId) {
      // Division view: only include players registered to teams in this division.
      basePlayersSql = `
        WITH base_players AS (
          SELECT DISTINCT tr.player_id
          FROM team_season_division_teams dt
          JOIN team_roster tr ON tr.team_id = dt.team_id
          JOIN players p ON p.id = tr.player_id
          WHERE dt.division_id = ?
            AND tr.active = 1
            AND p.active = 1
        )
      `;
      basePlayersParams = [divisionId];
    } else if (teamSeasonId) {
      // Season view: include players who appear in that season's league fixtures.
      basePlayersSql = `
        WITH base_players AS (
          SELECT DISTINCT player_id
          FROM (
            SELECT fg.home_player_a_id as player_id
            FROM fixture_matches fg
            JOIN fixtures f ON fg.fixture_id = f.id
            WHERE f.team_season_id = ?
              AND f.status = 'completed'
              AND (f.match_type IS NULL OR f.match_type = 'league')
              AND fg.home_player_a_id IS NOT NULL

            UNION ALL

            SELECT fg.away_player_a_id as player_id
            FROM fixture_matches fg
            JOIN fixtures f ON fg.fixture_id = f.id
            WHERE f.team_season_id = ?
              AND f.status = 'completed'
              AND (f.match_type IS NULL OR f.match_type = 'league')
              AND fg.away_player_a_id IS NOT NULL

            UNION ALL

            SELECT fg.home_player_b_id as player_id
            FROM fixture_matches fg
            JOIN fixtures f ON fg.fixture_id = f.id
            WHERE f.team_season_id = ?
              AND f.status = 'completed'
              AND (f.match_type IS NULL OR f.match_type = 'league')
              AND fg.home_player_b_id IS NOT NULL

            UNION ALL

            SELECT fg.away_player_b_id as player_id
            FROM fixture_matches fg
            JOIN fixtures f ON fg.fixture_id = f.id
            WHERE f.team_season_id = ?
              AND f.status = 'completed'
              AND (f.match_type IS NULL OR f.match_type = 'league')
              AND fg.away_player_b_id IS NOT NULL
          ) t
        )
      `;
      basePlayersParams = [teamSeasonId, teamSeasonId, teamSeasonId, teamSeasonId];
    } else {
      // No context: fallback to all active players.
      basePlayersSql = `
        WITH base_players AS (
          SELECT id as player_id
          FROM players
          WHERE active = 1
        )
      `;
      basePlayersParams = [];
    }

    const where = [];
    const baseParams = [];
    if (teamSeasonId) {
      where.push('f.team_season_id = ?');
      baseParams.push(teamSeasonId);
    }
    if (divisionId) {
      where.push('f.division_id = ?');
      baseParams.push(divisionId);
    }
    where.push("(f.match_type IS NULL OR f.match_type = 'league')");
    const filterSql = where.length > 0 ? `AND ${where.join(' AND ')}` : '';
    const teamJoin = teamSeasonId || divisionId ? 'JOIN team_season_division_teams dt ON dt.team_id = tr.team_id' : '';
    const teamWhere = ['tr.active = 1'];
    const teamParams = [];
    if (teamSeasonId) {
      teamWhere.push('dt.team_season_id = ?');
      teamParams.push(teamSeasonId);
    }
    if (divisionId) {
      teamWhere.push('dt.division_id = ?');
      teamParams.push(divisionId);
    }
    const params = [
      ...baseParams, // w
      ...baseParams, // l
      ...baseParams, ...baseParams, // s (2 selects)
      ...baseParams, ...baseParams, ...baseParams, ...baseParams, // dw (4 selects)
      ...baseParams, ...baseParams, ...baseParams, ...baseParams, // dl (4 selects)
    ];

    const stats = await this.db.all(
      `${basePlayersSql}
       SELECT
         p.id as player_id,
         p.name as player_name,
         tm.team_name as team_name,
         COALESCE(w.wins, 0) as singles_wins,
         COALESCE(l.losses, 0) as singles_losses,
         COALESCE(w.wins, 0) + COALESCE(l.losses, 0) as singles_played,
         ROUND(
           COALESCE(w.wins, 0) * 100.0 / NULLIF((COALESCE(w.wins, 0) + COALESCE(l.losses, 0)), 0),
           1
         ) as singles_win_pct,
         COALESCE(s.games_won, 0) as singles_games_won,
         COALESCE(s.games_lost, 0) as singles_games_lost,
         COALESCE(dw.wins, 0) as doubles_wins,
         COALESCE(dl.losses, 0) as doubles_losses,
         COALESCE(dw.wins, 0) + COALESCE(dl.losses, 0) as doubles_played,
         ROUND(
           COALESCE(dw.wins, 0) * 100.0 / NULLIF((COALESCE(dw.wins, 0) + COALESCE(dl.losses, 0)), 0),
           1
         ) as doubles_win_pct
       FROM base_players bp
       JOIN players p ON p.id = bp.player_id
       LEFT JOIN (
         SELECT tr.player_id, MIN(t.name) as team_name
         FROM team_roster tr
         JOIN teams t ON t.id = tr.team_id
         ${teamJoin}
         WHERE ${teamWhere.join(' AND ')}
         GROUP BY tr.player_id
       ) tm ON tm.player_id = p.id
       LEFT JOIN (
         SELECT
           CASE
             WHEN fg.winner_side = 'home' THEN fg.home_player_a_id
             WHEN fg.winner_side = 'away' THEN fg.away_player_a_id
           END as player_id,
           COUNT(*) as wins
         FROM fixture_matches fg
         JOIN fixtures f ON fg.fixture_id = f.id
         WHERE f.status = 'completed'
           AND fg.match_type = 'singles'
           AND fg.winner_side IN ('home','away')
           ${filterSql}
         GROUP BY player_id
       ) w ON w.player_id = p.id
       LEFT JOIN (
         SELECT
           CASE
             WHEN fg.winner_side = 'home' THEN fg.away_player_a_id
             WHEN fg.winner_side = 'away' THEN fg.home_player_a_id
           END as player_id,
           COUNT(*) as losses
         FROM fixture_matches fg
         JOIN fixtures f ON fg.fixture_id = f.id
         WHERE f.status = 'completed'
           AND fg.match_type = 'singles'
           AND fg.winner_side IN ('home','away')
           ${filterSql}
         GROUP BY player_id
       ) l ON l.player_id = p.id
       LEFT JOIN (
         SELECT player_id,
                SUM(games_won) as games_won,
                SUM(games_lost) as games_lost
         FROM (
           SELECT
             fg.home_player_a_id as player_id,
             COALESCE(fg.home_games_won, 0) as games_won,
             COALESCE(fg.away_games_won, 0) as games_lost
           FROM fixture_matches fg
           JOIN fixtures f ON fg.fixture_id = f.id
           WHERE f.status = 'completed'
             AND fg.match_type = 'singles'
             AND fg.winner_side IN ('home','away')
             ${filterSql}

           UNION ALL

           SELECT
             fg.away_player_a_id as player_id,
             COALESCE(fg.away_games_won, 0) as games_won,
             COALESCE(fg.home_games_won, 0) as games_lost
           FROM fixture_matches fg
           JOIN fixtures f ON fg.fixture_id = f.id
           WHERE f.status = 'completed'
             AND fg.match_type = 'singles'
             AND fg.winner_side IN ('home','away')
             ${filterSql}
         ) t
         GROUP BY player_id
       ) s ON s.player_id = p.id
       LEFT JOIN (
         SELECT player_id, COUNT(*) as wins
         FROM (
           SELECT fg.home_player_a_id as player_id
           FROM fixture_matches fg
           JOIN fixtures f ON fg.fixture_id = f.id
           WHERE f.status = 'completed'
             AND fg.match_type = 'doubles'
             AND fg.winner_side = 'home'
             ${filterSql}

           UNION ALL

           SELECT fg.home_player_b_id as player_id
           FROM fixture_matches fg
           JOIN fixtures f ON fg.fixture_id = f.id
           WHERE f.status = 'completed'
             AND fg.match_type = 'doubles'
             AND fg.winner_side = 'home'
             AND fg.home_player_b_id IS NOT NULL
             ${filterSql}

           UNION ALL

           SELECT fg.away_player_a_id as player_id
           FROM fixture_matches fg
           JOIN fixtures f ON fg.fixture_id = f.id
           WHERE f.status = 'completed'
             AND fg.match_type = 'doubles'
             AND fg.winner_side = 'away'
             ${filterSql}

           UNION ALL

           SELECT fg.away_player_b_id as player_id
           FROM fixture_matches fg
           JOIN fixtures f ON fg.fixture_id = f.id
           WHERE f.status = 'completed'
             AND fg.match_type = 'doubles'
             AND fg.winner_side = 'away'
             AND fg.away_player_b_id IS NOT NULL
             ${filterSql}
         ) t
         GROUP BY player_id
       ) dw ON dw.player_id = p.id
       LEFT JOIN (
         SELECT player_id, COUNT(*) as losses
         FROM (
           SELECT fg.away_player_a_id as player_id
           FROM fixture_matches fg
           JOIN fixtures f ON fg.fixture_id = f.id
           WHERE f.status = 'completed'
             AND fg.match_type = 'doubles'
             AND fg.winner_side = 'home'
             ${filterSql}

           UNION ALL

           SELECT fg.away_player_b_id as player_id
           FROM fixture_matches fg
           JOIN fixtures f ON fg.fixture_id = f.id
           WHERE f.status = 'completed'
             AND fg.match_type = 'doubles'
             AND fg.winner_side = 'home'
             AND fg.away_player_b_id IS NOT NULL
             ${filterSql}

           UNION ALL

           SELECT fg.home_player_a_id as player_id
           FROM fixture_matches fg
           JOIN fixtures f ON fg.fixture_id = f.id
           WHERE f.status = 'completed'
             AND fg.match_type = 'doubles'
             AND fg.winner_side = 'away'
             ${filterSql}

           UNION ALL

           SELECT fg.home_player_b_id as player_id
           FROM fixture_matches fg
           JOIN fixtures f ON fg.fixture_id = f.id
           WHERE f.status = 'completed'
             AND fg.match_type = 'doubles'
             AND fg.winner_side = 'away'
             AND fg.home_player_b_id IS NOT NULL
             ${filterSql}
         ) t
         GROUP BY player_id
       ) dl ON dl.player_id = p.id
       ORDER BY singles_wins DESC, player_name ASC`,
      [...basePlayersParams, ...teamParams, ...params]
    );

    const list = stats
      .map((row) => ({
        ...row,
        matches_diff: Number(row.singles_wins || 0) - Number(row.singles_losses || 0),
        games_diff: Number(row.singles_games_won || 0) - Number(row.singles_games_lost || 0),
      }))
      .sort((a, b) => {
        if (b.singles_wins !== a.singles_wins) return b.singles_wins - a.singles_wins;
        if (b.matches_diff !== a.matches_diff) return b.matches_diff - a.matches_diff;
        if (b.games_diff !== a.games_diff) return b.games_diff - a.games_diff;
        return a.player_name.localeCompare(b.player_name);
      });

    // Competition ranking: ties share same rank, next rank skips
    let currentRank = 0;
    let previous = null;
    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      if (
        !previous ||
        row.singles_wins !== previous.singles_wins ||
        row.matches_diff !== previous.matches_diff ||
        row.games_diff !== previous.games_diff
      ) {
        currentRank = i + 1;
      }
      row.rank = currentRank;
      previous = row;
    }

    return list;
  }
}

module.exports = TeamLeagueManager;
