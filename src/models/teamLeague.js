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

    const recentFixtures = await this.db.all(
      `SELECT f.id,
              f.match_date,
              f.home_games_won,
              f.away_games_won,
              ht.name as home_team_name,
              at.name as away_team_name
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

    const where = ['f.status = \'completed\''];
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
        games_won: 0,
        games_lost: 0,
        sets_won: 0,
        sets_lost: 0,
      });
    }

    for (const f of fixtures) {
      const home = base.get(f.home_team_id);
      const away = base.get(f.away_team_id);
      if (!home || !away) continue;

      home.played++;
      away.played++;

      home.games_won += f.home_games_won || 0;
      home.games_lost += f.away_games_won || 0;
      away.games_won += f.away_games_won || 0;
      away.games_lost += f.home_games_won || 0;

      home.sets_won += f.home_sets_won || 0;
      home.sets_lost += f.away_sets_won || 0;
      away.sets_won += f.away_sets_won || 0;
      away.sets_lost += f.home_sets_won || 0;

      const homeWon = (f.home_games_won || 0) > (f.away_games_won || 0);
      const awayWon = (f.away_games_won || 0) > (f.home_games_won || 0);

      if (homeWon) {
        home.wins++;
        away.losses++;
      } else if (awayWon) {
        away.wins++;
        home.losses++;
      }
    }

    const rows = Array.from(base.values());

    // Primary sort: wins desc, then overall games won desc
    rows.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.games_won !== a.games_won) return b.games_won - a.games_won;
      if (b.sets_won !== a.sets_won) return b.sets_won - a.sets_won;
      return a.team_name.localeCompare(b.team_name);
    });

    // Apply tie-breaker groups (head-to-head games won among tied teams)
    const finalRows = this.applyHeadToHeadTiebreakers(rows, fixtures);

    const withDiffs = finalRows.map((r) => ({
      ...r,
      games_diff: r.games_won - r.games_lost,
      sets_diff: r.sets_won - r.sets_lost,
    }));

    const isFullyTied = (a, b) => {
      return (
        a.wins === b.wins &&
        a.losses === b.losses &&
        a.games_won === b.games_won &&
        a.games_lost === b.games_lost &&
        a.sets_won === b.sets_won &&
        a.sets_lost === b.sets_lost
      );
    };

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

  applyHeadToHeadTiebreakers(sortedRows, completedFixtures) {
    const result = [];
    let i = 0;
    while (i < sortedRows.length) {
      const group = [sortedRows[i]];
      let j = i + 1;
      while (j < sortedRows.length &&
        sortedRows[j].wins === sortedRows[i].wins &&
        sortedRows[j].games_won === sortedRows[i].games_won) {
        group.push(sortedRows[j]);
        j++;
      }

      if (group.length <= 1) {
        result.push(...group);
        i = j;
        continue;
      }

      const tiedIds = new Set(group.map(g => g.team_id));

      const mini = new Map();
      for (const g of group) {
        mini.set(g.team_id, { team_id: g.team_id, h2h_games_won: 0 });
      }

      for (const f of completedFixtures) {
        if (!tiedIds.has(f.home_team_id) || !tiedIds.has(f.away_team_id)) continue;

        const h = mini.get(f.home_team_id);
        const a = mini.get(f.away_team_id);

        h.h2h_games_won += f.home_games_won || 0;
        a.h2h_games_won += f.away_games_won || 0;
      }

      group.sort((a, b) => {
        const aa = mini.get(a.team_id);
        const bb = mini.get(b.team_id);

        if (bb.h2h_games_won !== aa.h2h_games_won) return bb.h2h_games_won - aa.h2h_games_won;

        // If still tied, use overall sets won
        if (b.sets_won !== a.sets_won) return b.sets_won - a.sets_won;

        return a.team_name.localeCompare(b.team_name);
      });

      result.push(...group);
      i = j;
    }

    return result;
  }

  async getPlayerRankings(teamSeasonId, divisionId = null) {
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
    const filterSql = where.length > 0 ? `AND ${where.join(' AND ')}` : '';
    const params = [
      ...baseParams, // w
      ...baseParams, // l
      ...baseParams, ...baseParams, // s (2 selects)
      ...baseParams, ...baseParams, ...baseParams, ...baseParams, // dw (4 selects)
      ...baseParams, ...baseParams, ...baseParams, ...baseParams, // dl (4 selects)
    ];

    const stats = await this.db.all(
      `SELECT
         p.id as player_id,
         p.name as player_name,
         COALESCE(w.wins, 0) as singles_wins,
         COALESCE(l.losses, 0) as singles_losses,
         COALESCE(w.wins, 0) + COALESCE(l.losses, 0) as singles_played,
         ROUND(
           COALESCE(w.wins, 0) * 100.0 / NULLIF((COALESCE(w.wins, 0) + COALESCE(l.losses, 0)), 0),
           1
         ) as singles_win_pct,
         COALESCE(s.sets_won, 0) as singles_sets_won,
         COALESCE(s.sets_lost, 0) as singles_sets_lost,
         COALESCE(dw.wins, 0) as doubles_wins,
         COALESCE(dl.losses, 0) as doubles_losses,
         COALESCE(dw.wins, 0) + COALESCE(dl.losses, 0) as doubles_played,
         ROUND(
           COALESCE(dw.wins, 0) * 100.0 / NULLIF((COALESCE(dw.wins, 0) + COALESCE(dl.losses, 0)), 0),
           1
         ) as doubles_win_pct
       FROM players p
       LEFT JOIN (
         SELECT
           CASE
             WHEN fg.winner_side = 'home' THEN fg.home_player_a_id
             WHEN fg.winner_side = 'away' THEN fg.away_player_a_id
           END as player_id,
           COUNT(*) as wins
         FROM fixture_games fg
         JOIN fixtures f ON fg.fixture_id = f.id
         WHERE f.status = 'completed'
           AND fg.game_type = 'singles'
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
         FROM fixture_games fg
         JOIN fixtures f ON fg.fixture_id = f.id
         WHERE f.status = 'completed'
           AND fg.game_type = 'singles'
           AND fg.winner_side IN ('home','away')
           ${filterSql}
         GROUP BY player_id
       ) l ON l.player_id = p.id
       LEFT JOIN (
         SELECT player_id,
                SUM(sets_won) as sets_won,
                SUM(sets_lost) as sets_lost
         FROM (
           SELECT
             fg.home_player_a_id as player_id,
             COALESCE(fg.home_sets_won, 0) as sets_won,
             COALESCE(fg.away_sets_won, 0) as sets_lost
           FROM fixture_games fg
           JOIN fixtures f ON fg.fixture_id = f.id
           WHERE f.status = 'completed'
             AND fg.game_type = 'singles'
             AND fg.winner_side IN ('home','away')
             ${filterSql}

           UNION ALL

           SELECT
             fg.away_player_a_id as player_id,
             COALESCE(fg.away_sets_won, 0) as sets_won,
             COALESCE(fg.home_sets_won, 0) as sets_lost
           FROM fixture_games fg
           JOIN fixtures f ON fg.fixture_id = f.id
           WHERE f.status = 'completed'
             AND fg.game_type = 'singles'
             AND fg.winner_side IN ('home','away')
             ${filterSql}
         ) t
         GROUP BY player_id
       ) s ON s.player_id = p.id
       LEFT JOIN (
         SELECT player_id, COUNT(*) as wins
         FROM (
           SELECT fg.home_player_a_id as player_id
           FROM fixture_games fg
           JOIN fixtures f ON fg.fixture_id = f.id
           WHERE f.status = 'completed'
             AND fg.game_type = 'doubles'
             AND fg.winner_side = 'home'
             ${filterSql}

           UNION ALL

           SELECT fg.home_player_b_id as player_id
           FROM fixture_games fg
           JOIN fixtures f ON fg.fixture_id = f.id
           WHERE f.status = 'completed'
             AND fg.game_type = 'doubles'
             AND fg.winner_side = 'home'
             AND fg.home_player_b_id IS NOT NULL
             ${filterSql}

           UNION ALL

           SELECT fg.away_player_a_id as player_id
           FROM fixture_games fg
           JOIN fixtures f ON fg.fixture_id = f.id
           WHERE f.status = 'completed'
             AND fg.game_type = 'doubles'
             AND fg.winner_side = 'away'
             ${filterSql}

           UNION ALL

           SELECT fg.away_player_b_id as player_id
           FROM fixture_games fg
           JOIN fixtures f ON fg.fixture_id = f.id
           WHERE f.status = 'completed'
             AND fg.game_type = 'doubles'
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
           FROM fixture_games fg
           JOIN fixtures f ON fg.fixture_id = f.id
           WHERE f.status = 'completed'
             AND fg.game_type = 'doubles'
             AND fg.winner_side = 'home'
             ${filterSql}

           UNION ALL

           SELECT fg.away_player_b_id as player_id
           FROM fixture_games fg
           JOIN fixtures f ON fg.fixture_id = f.id
           WHERE f.status = 'completed'
             AND fg.game_type = 'doubles'
             AND fg.winner_side = 'home'
             AND fg.away_player_b_id IS NOT NULL
             ${filterSql}

           UNION ALL

           SELECT fg.home_player_a_id as player_id
           FROM fixture_games fg
           JOIN fixtures f ON fg.fixture_id = f.id
           WHERE f.status = 'completed'
             AND fg.game_type = 'doubles'
             AND fg.winner_side = 'away'
             ${filterSql}

           UNION ALL

           SELECT fg.home_player_b_id as player_id
           FROM fixture_games fg
           JOIN fixtures f ON fg.fixture_id = f.id
           WHERE f.status = 'completed'
             AND fg.game_type = 'doubles'
             AND fg.winner_side = 'away'
             AND fg.home_player_b_id IS NOT NULL
             ${filterSql}
         ) t
         GROUP BY player_id
       ) dl ON dl.player_id = p.id
       WHERE p.active = 1
       ORDER BY singles_wins DESC, player_name ASC`,
      params
    );

    const list = stats;

    // Competition ranking: ties share same rank, next rank skips
    let currentRank = 0;
    let lastWins = null;
    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      if (lastWins === null || row.singles_wins !== lastWins) {
        currentRank = i + 1;
        lastWins = row.singles_wins;
      }
      row.rank = currentRank;
    }

    return list;
  }
}

module.exports = TeamLeagueManager;
