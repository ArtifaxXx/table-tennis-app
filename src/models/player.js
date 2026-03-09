const { v4: uuidv4 } = require('uuid');

class PlayerManager {
  constructor(database) {
    this.db = database;
  }

  async createPlayer(playerData) {
    const { name, email, phone, skill_level = 1 } = playerData;
    
    if (!name) {
      throw new Error('Player name is required');
    }

    const id = uuidv4();
    const sql = `
      INSERT INTO players (id, name, email, phone, skill_level)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    await this.db.run(sql, [id, name, email, phone, skill_level]);
    return await this.getPlayerById(id);
  }

  async getAllPlayers() {
    const sql = `
      SELECT
        p.*,
        COUNT(fg.id) as total_matches,
        SUM(
          CASE
            WHEN fg.winner_side = 'home' AND fg.home_player_a_id = p.id THEN 1
            WHEN fg.winner_side = 'away' AND fg.away_player_a_id = p.id THEN 1
            ELSE 0
          END
        ) as wins,
        SUM(
          CASE
            WHEN fg.winner_side = 'home' AND fg.away_player_a_id = p.id THEN 1
            WHEN fg.winner_side = 'away' AND fg.home_player_a_id = p.id THEN 1
            ELSE 0
          END
        ) as losses
      FROM players p
      LEFT JOIN fixture_games fg
        ON (p.id = fg.home_player_a_id OR p.id = fg.away_player_a_id)
       AND fg.game_type = 'singles'
       AND fg.winner_side IN ('home','away')
      LEFT JOIN fixtures f
        ON fg.fixture_id = f.id
       AND f.status = 'completed'
      WHERE p.active = 1
      GROUP BY p.id
      ORDER BY p.name
    `;

    const players = await this.db.all(sql);

    const doublesByPlayer = await this.db.all(
      `SELECT player_id,
              SUM(doubles_wins) as doubles_wins,
              SUM(doubles_losses) as doubles_losses
       FROM (
         SELECT fg.home_player_a_id as player_id,
                CASE WHEN fg.winner_side = 'home' THEN 1 ELSE 0 END as doubles_wins,
                CASE WHEN fg.winner_side = 'away' THEN 1 ELSE 0 END as doubles_losses
         FROM fixture_games fg
         JOIN fixtures f ON fg.fixture_id = f.id
         WHERE f.status = 'completed'
           AND fg.game_type = 'doubles'
           AND fg.winner_side IN ('home','away')

         UNION ALL

         SELECT fg.home_player_b_id as player_id,
                CASE WHEN fg.winner_side = 'home' THEN 1 ELSE 0 END as doubles_wins,
                CASE WHEN fg.winner_side = 'away' THEN 1 ELSE 0 END as doubles_losses
         FROM fixture_games fg
         JOIN fixtures f ON fg.fixture_id = f.id
         WHERE f.status = 'completed'
           AND fg.game_type = 'doubles'
           AND fg.winner_side IN ('home','away')
           AND fg.home_player_b_id IS NOT NULL

         UNION ALL

         SELECT fg.away_player_a_id as player_id,
                CASE WHEN fg.winner_side = 'away' THEN 1 ELSE 0 END as doubles_wins,
                CASE WHEN fg.winner_side = 'home' THEN 1 ELSE 0 END as doubles_losses
         FROM fixture_games fg
         JOIN fixtures f ON fg.fixture_id = f.id
         WHERE f.status = 'completed'
           AND fg.game_type = 'doubles'
           AND fg.winner_side IN ('home','away')

         UNION ALL

         SELECT fg.away_player_b_id as player_id,
                CASE WHEN fg.winner_side = 'away' THEN 1 ELSE 0 END as doubles_wins,
                CASE WHEN fg.winner_side = 'home' THEN 1 ELSE 0 END as doubles_losses
         FROM fixture_games fg
         JOIN fixtures f ON fg.fixture_id = f.id
         WHERE f.status = 'completed'
           AND fg.game_type = 'doubles'
           AND fg.winner_side IN ('home','away')
           AND fg.away_player_b_id IS NOT NULL
       ) t
       GROUP BY player_id`,
      []
    );

    const doublesMap = new Map(doublesByPlayer.map((r) => [r.player_id, r]));

    const setsByPlayer = await this.db.all(
      `SELECT player_id,
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
       ) t
       GROUP BY player_id`,
      []
    );

    const setsMap = new Map(setsByPlayer.map((r) => [r.player_id, r]));

    return players.map((player) => {
      const s = setsMap.get(player.id) || { sets_won: 0, sets_lost: 0 };
      const d = doublesMap.get(player.id) || { doubles_wins: 0, doubles_losses: 0 };
      const doublesWins = Number(d.doubles_wins || 0);
      const doublesLosses = Number(d.doubles_losses || 0);
      const doublesPlayed = doublesWins + doublesLosses;
      return {
        ...player,
        singles_sets_won: s.sets_won || 0,
        singles_sets_lost: s.sets_lost || 0,
        win_rate: player.total_matches > 0 ? ((player.wins / player.total_matches) * 100).toFixed(1) : 0,
        doubles_wins: doublesWins,
        doubles_losses: doublesLosses,
        doubles_played: doublesPlayed,
        doubles_win_pct: doublesPlayed > 0 ? ((doublesWins / doublesPlayed) * 100).toFixed(1) : 0,
      };
    });
  }

  async getPlayerById(id) {
    const sql = `
      SELECT
        p.*,
        COUNT(fg.id) as total_matches,
        SUM(
          CASE
            WHEN fg.winner_side = 'home' AND fg.home_player_a_id = p.id THEN 1
            WHEN fg.winner_side = 'away' AND fg.away_player_a_id = p.id THEN 1
            ELSE 0
          END
        ) as wins,
        SUM(
          CASE
            WHEN fg.winner_side = 'home' AND fg.away_player_a_id = p.id THEN 1
            WHEN fg.winner_side = 'away' AND fg.home_player_a_id = p.id THEN 1
            ELSE 0
          END
        ) as losses
      FROM players p
      LEFT JOIN fixture_games fg
        ON (p.id = fg.home_player_a_id OR p.id = fg.away_player_a_id)
       AND fg.game_type = 'singles'
       AND fg.winner_side IN ('home','away')
      LEFT JOIN fixtures f
        ON fg.fixture_id = f.id
       AND f.status = 'completed'
      WHERE p.id = ? AND p.active = 1
      GROUP BY p.id
    `;

    const player = await this.db.get(sql, [id]);
    if (!player) return null;

    const sets = await this.db.get(
      `SELECT
         SUM(sets_won) as sets_won,
         SUM(sets_lost) as sets_lost
       FROM (
         SELECT
           COALESCE(fg.home_sets_won, 0) as sets_won,
           COALESCE(fg.away_sets_won, 0) as sets_lost
         FROM fixture_games fg
         JOIN fixtures f ON fg.fixture_id = f.id
         WHERE f.status = 'completed'
           AND fg.game_type = 'singles'
           AND fg.winner_side IN ('home','away')
           AND fg.home_player_a_id = ?

         UNION ALL

         SELECT
           COALESCE(fg.away_sets_won, 0) as sets_won,
           COALESCE(fg.home_sets_won, 0) as sets_lost
         FROM fixture_games fg
         JOIN fixtures f ON fg.fixture_id = f.id
         WHERE f.status = 'completed'
           AND fg.game_type = 'singles'
           AND fg.winner_side IN ('home','away')
           AND fg.away_player_a_id = ?
       ) t`,
      [id, id]
    );
    
    return {
      ...player,
      singles_sets_won: sets?.sets_won || 0,
      singles_sets_lost: sets?.sets_lost || 0,
      win_rate: player.total_matches > 0 ? ((player.wins / player.total_matches) * 100).toFixed(1) : 0
    };
  }

  async updatePlayer(id, playerData) {
    const { name, email, phone, skill_level } = playerData;
    
    const sql = `
      UPDATE players 
      SET name = COALESCE(?, name),
          email = COALESCE(?, email),
          phone = COALESCE(?, phone),
          skill_level = COALESCE(?, skill_level),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND active = 1
    `;
    
    const result = await this.db.run(sql, [name, email, phone, skill_level, id]);
    
    if (result.changes === 0) {
      throw new Error('Player not found or inactive');
    }
    
    return await this.getPlayerById(id);
  }

  async deletePlayer(id) {
    const sql = `
      UPDATE players 
      SET active = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    const result = await this.db.run(sql, [id]);
    
    if (result.changes === 0) {
      throw new Error('Player not found');
    }
  }

  async getActivePlayersCount() {
    const sql = 'SELECT COUNT(*) as count FROM players WHERE active = 1';
    const result = await this.db.get(sql);
    return result.count;
  }

  async getPlayerStats(id) {
    const player = await this.getPlayerById(id);
    if (!player) return null;

    const recentMatches = await this.db.all(`
      SELECT m.*, 
             p1.name as player1_name,
             p2.name as player2_name
      FROM matches m
      JOIN players p1 ON m.player1_id = p1.id
      JOIN players p2 ON m.player2_id = p2.id
      WHERE (m.player1_id = ? OR m.player2_id = ?)
      ORDER BY m.match_date DESC
      LIMIT 10
    `, [id, id]);

    return {
      player,
      recentMatches
    };
  }

  async searchPlayers(query) {
    const sql = `
      SELECT * FROM players 
      WHERE active = 1 AND (
        name LIKE ? OR 
        email LIKE ? OR 
        phone LIKE ?
      )
      ORDER BY name
    `;
    
    const searchTerm = `%${query}%`;
    return await this.db.all(sql, [searchTerm, searchTerm, searchTerm]);
  }
}

module.exports = PlayerManager;
