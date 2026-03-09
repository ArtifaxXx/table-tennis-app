const { v4: uuidv4 } = require('uuid');

class LeagueManager {
  constructor(database) {
    this.db = database;
  }

  async getStandings() {
    const sql = `
      SELECT 
        p.id,
        p.name,
        p.skill_level,
        COUNT(m.id) as matches_played,
        SUM(CASE WHEN m.winner_id = p.id THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN m.winner_id != p.id AND m.status = 'completed' THEN 1 ELSE 0 END) as losses,
        SUM(CASE WHEN m.winner_id = p.id THEN 3 WHEN m.status = 'completed' THEN 0 ELSE 0 END) as points,
        ROUND(
          SUM(CASE WHEN m.winner_id = p.id THEN 1.0 ELSE 0 END) / 
          NULLIF(COUNT(m.id), 0) * 100, 1
        ) as win_percentage,
        MAX(m.match_date) as last_match_date
      FROM players p
      LEFT JOIN matches m ON (p.id = m.player1_id OR p.id = m.player2_id) AND m.status = 'completed'
      WHERE p.active = 1
      GROUP BY p.id, p.name, p.skill_level
      ORDER BY points DESC, wins DESC, win_percentage DESC, p.name ASC
    `;
    
    const standings = await this.db.all(sql);
    
    // Add rank
    return standings.map((player, index) => ({
      ...player,
      rank: index + 1,
      matches_played: player.matches_played || 0,
      wins: player.wins || 0,
      losses: player.losses || 0,
      points: player.points || 0,
      win_percentage: player.win_percentage || 0
    }));
  }

  async getStatistics() {
    const totalPlayers = await this.db.get('SELECT COUNT(*) as count FROM players WHERE active = 1');
    const totalMatches = await this.db.get('SELECT COUNT(*) as count FROM matches WHERE status = "completed"');
    const upcomingMatches = await this.db.get('SELECT COUNT(*) as count FROM matches WHERE status = "scheduled"');
    
    const skillDistribution = await this.db.all(`
      SELECT skill_level, COUNT(*) as count
      FROM players
      WHERE active = 1
      GROUP BY skill_level
      ORDER BY skill_level
    `);
    
    const recentActivity = await this.db.all(`
      SELECT 
        m.id,
        m.match_date,
        p1.name as player1_name,
        p2.name as player2_name,
        m.player1_score,
        m.player2_score,
        w.name as winner_name
      FROM matches m
      JOIN players p1 ON m.player1_id = p1.id
      JOIN players p2 ON m.player2_id = p2.id
      LEFT JOIN players w ON m.winner_id = w.id
      WHERE m.status = 'completed'
      ORDER BY m.match_date DESC
      LIMIT 5
    `);
    
    const topPerformers = await this.db.all(`
      SELECT 
        p.id,
        p.name,
        COUNT(m.id) as matches_played,
        SUM(CASE WHEN m.winner_id = p.id THEN 1 ELSE 0 END) as wins,
        ROUND(
          SUM(CASE WHEN m.winner_id = p.id THEN 1.0 ELSE 0 END) / 
          NULLIF(COUNT(m.id), 0) * 100, 1
        ) as win_rate
      FROM players p
      LEFT JOIN matches m ON (p.id = m.player1_id OR p.id = m.player2_id) AND m.status = 'completed'
      WHERE p.active = 1
      GROUP BY p.id, p.name
      HAVING matches_played >= 3
      ORDER BY win_rate DESC, wins DESC
      LIMIT 5
    `);
    
    return {
      totalPlayers: totalPlayers.count,
      totalMatches: totalMatches.count,
      upcomingMatches: upcomingMatches.count,
      skillDistribution,
      recentActivity,
      topPerformers
    };
  }

  async generateSchedule() {
    const players = await this.db.all('SELECT * FROM players WHERE active = 1 ORDER BY name');
    
    if (players.length < 2) {
      throw new Error('At least 2 active players are required to generate a schedule');
    }
    
    const schedule = [];
    const matches = [];
    
    // Generate round-robin schedule
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        matches.push({
          player1: players[i],
          player2: players[j],
          round: Math.floor(i / 2) + 1
        });
      }
    }
    
    // Shuffle matches for variety
    for (let i = matches.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [matches[i], matches[j]] = [matches[j], matches[i]];
    }
    
    // Schedule matches over several weeks
    const weeks = Math.ceil(matches.length / Math.floor(players.length / 2));
    let matchIndex = 0;
    
    for (let week = 1; week <= weeks; week++) {
      const weekMatches = [];
      const matchesPerWeek = Math.min(Math.floor(players.length / 2), matches.length - matchIndex);
      
      for (let i = 0; i < matchesPerWeek && matchIndex < matches.length; i++) {
        const match = matches[matchIndex];
        const scheduledDate = this.calculateMatchDate(week);
        
        weekMatches.push({
          id: uuidv4(),
          player1_id: match.player1.id,
          player2_id: match.player2.id,
          player1_name: match.player1.name,
          player2_name: match.player2.name,
          scheduled_date: scheduledDate,
          week: week
        });
        
        matchIndex++;
      }
      
      if (weekMatches.length > 0) {
        schedule.push({
          week: week,
          start_date: this.calculateMatchDate(week),
          matches: weekMatches
        });
      }
    }
    
    return schedule;
  }

  calculateMatchDate(week) {
    const today = new Date();
    const matchDate = new Date(today);
    matchDate.setDate(today.getDate() + (week - 1) * 7);
    matchDate.setHours(19, 0, 0, 0); // Schedule at 7 PM
    
    // If it's weekend, move to next week
    if (matchDate.getDay() === 0 || matchDate.getDay() === 6) {
      matchDate.setDate(matchDate.getDate() + (8 - matchDate.getDay()));
    }
    
    return matchDate.toISOString();
  }

  async createSeason(seasonData) {
    const { name, start_date, end_date } = seasonData;
    
    if (!name || !start_date || !end_date) {
      throw new Error('Season name, start date, and end date are required');
    }
    
    const id = uuidv4();
    const sql = `
      INSERT INTO seasons (id, name, start_date, end_date)
      VALUES (?, ?, ?, ?)
    `;
    
    await this.db.run(sql, [id, name, start_date, end_date]);
    return await this.getSeasonById(id);
  }

  async getSeasonById(id) {
    return await this.db.get('SELECT * FROM seasons WHERE id = ?', [id]);
  }

  async getAllSeasons() {
    return await this.db.all('SELECT * FROM seasons ORDER BY start_date DESC');
  }

  async addPlayerToSeason(seasonId, playerId) {
    const id = uuidv4();
    const sql = `
      INSERT INTO season_participants (id, season_id, player_id)
      VALUES (?, ?, ?)
    `;
    
    await this.db.run(sql, [id, seasonId, playerId]);
  }

  async getSeasonStandings(seasonId) {
    const sql = `
      SELECT 
        p.id,
        p.name,
        COUNT(m.id) as matches_played,
        SUM(CASE WHEN m.winner_id = p.id THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN m.winner_id != p.id AND m.status = 'completed' THEN 1 ELSE 0 END) as losses,
        SUM(CASE WHEN m.winner_id = p.id THEN 3 WHEN m.status = 'completed' THEN 0 ELSE 0 END) as points
      FROM season_participants sp
      JOIN players p ON sp.player_id = p.id
      LEFT JOIN matches m ON (p.id = m.player1_id OR p.id = m.player2_id) 
        AND m.status = 'completed'
        AND m.match_date BETWEEN (SELECT start_date FROM seasons WHERE id = ?) 
                          AND (SELECT end_date FROM seasons WHERE id = ?)
      WHERE sp.season_id = ? AND p.active = 1
      GROUP BY p.id, p.name
      ORDER BY points DESC, wins DESC
    `;
    
    const standings = await this.db.all(sql, [seasonId, seasonId, seasonId]);
    
    return standings.map((player, index) => ({
      ...player,
      rank: index + 1,
      matches_played: player.matches_played || 0,
      wins: player.wins || 0,
      losses: player.losses || 0,
      points: player.points || 0
    }));
  }

  async getPlayerHeadToHead(player1Id, player2Id) {
    const sql = `
      SELECT 
        m.*,
        p1.name as player1_name,
        p2.name as player2_name,
        w.name as winner_name
      FROM matches m
      JOIN players p1 ON m.player1_id = p1.id
      JOIN players p2 ON m.player2_id = p2.id
      LEFT JOIN players w ON m.winner_id = w.id
      WHERE ((m.player1_id = ? AND m.player2_id = ?) OR (m.player1_id = ? AND m.player2_id = ?))
        AND m.status = 'completed'
      ORDER BY m.match_date DESC
    `;
    
    const matches = await this.db.all(sql, [player1Id, player2Id, player2Id, player1Id]);
    
    const player1Wins = matches.filter(m => m.winner_id === player1Id).length;
    const player2Wins = matches.filter(m => m.winner_id === player2Id).length;
    
    return {
      player1Wins,
      player2Wins,
      totalMatches: matches.length,
      matches
    };
  }
}

module.exports = LeagueManager;
