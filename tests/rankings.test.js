const TeamLeagueManager = require('../src/models/teamLeague');

describe('ranking tie-break rules', () => {
  test('teams order by fixture wins, matches won, then games won', async () => {
    const teams = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'].map((name) => ({
      id: name.toLowerCase(),
      name,
    }));
    const fixtures = [
      {
        home_team_id: 'alpha', away_team_id: 'bravo',
        home_matches_won: 5, away_matches_won: 4,
        home_games_won: 10, away_games_won: 100,
      },
      {
        home_team_id: 'alpha', away_team_id: 'charlie',
        home_matches_won: 5, away_matches_won: 4,
        home_games_won: 10, away_games_won: 100,
      },
      {
        home_team_id: 'bravo', away_team_id: 'charlie',
        home_matches_won: 9, away_matches_won: 0,
        home_games_won: 10, away_games_won: 0,
      },
      {
        home_team_id: 'delta', away_team_id: 'charlie',
        home_matches_won: 8, away_matches_won: 1,
        home_games_won: 400, away_games_won: 0,
      },
      {
        home_team_id: 'echo', away_team_id: 'charlie',
        home_matches_won: 8, away_matches_won: 1,
        home_games_won: 500, away_games_won: 0,
      },
    ];
    const db = { all: jest.fn().mockResolvedValueOnce(teams).mockResolvedValueOnce(fixtures) };
    const manager = new TeamLeagueManager(db);

    const standings = await manager.getStandings('season-id', 'division-id');

    expect(standings.map((row) => row.team_name)).toEqual([
      'Alpha',
      'Bravo',
      'Echo',
      'Delta',
      'Charlie',
    ]);
    expect(standings[0].wins).toBe(2);
    expect(standings[1].matches_won).toBeGreaterThan(standings[2].matches_won);
    expect(standings[2].games_won).toBeGreaterThan(standings[3].games_won);
  });

  test('teams share rank only when all three ranking values match', async () => {
    const teams = [
      { id: 'alpha', name: 'Alpha' },
      { id: 'bravo', name: 'Bravo' },
      { id: 'charlie', name: 'Charlie' },
    ];
    const fixtures = [
      {
        home_team_id: 'alpha', away_team_id: 'charlie',
        home_matches_won: 5, away_matches_won: 4,
        home_games_won: 15, away_games_won: 12,
      },
      {
        home_team_id: 'bravo', away_team_id: 'charlie',
        home_matches_won: 5, away_matches_won: 4,
        home_games_won: 15, away_games_won: 10,
      },
    ];
    const db = { all: jest.fn().mockResolvedValueOnce(teams).mockResolvedValueOnce(fixtures) };
    const manager = new TeamLeagueManager(db);

    const standings = await manager.getStandings('season-id', 'division-id');

    expect(standings.slice(0, 2).map((row) => row.rank)).toEqual([1, 1]);
    expect(standings[2].rank).toBe(3);
  });

  test('players order by matches won, match difference, then game difference', async () => {
    const stats = [
      { player_id: 'a', player_name: 'Alpha', singles_wins: 5, singles_losses: 5, singles_games_won: 20, singles_games_lost: 20 },
      { player_id: 'b', player_name: 'Bravo', singles_wins: 4, singles_losses: 0, singles_games_won: 100, singles_games_lost: 0 },
      { player_id: 'c', player_name: 'Charlie', singles_wins: 5, singles_losses: 3, singles_games_won: 10, singles_games_lost: 9 },
      { player_id: 'd', player_name: 'Delta', singles_wins: 5, singles_losses: 3, singles_games_won: 30, singles_games_lost: 10 },
      { player_id: 'e', player_name: 'Echo', singles_wins: 5, singles_losses: 3, singles_games_won: 30, singles_games_lost: 10 },
    ];
    const db = { all: jest.fn().mockResolvedValue(stats) };
    const manager = new TeamLeagueManager(db);

    const rankings = await manager.getPlayerRankings('season-id', 'division-id');

    expect(rankings.map((row) => row.player_name)).toEqual([
      'Delta',
      'Echo',
      'Charlie',
      'Alpha',
      'Bravo',
    ]);
    expect(rankings.map((row) => row.rank)).toEqual([1, 1, 3, 4, 5]);
    expect(rankings[0].matches_diff).toBe(2);
    expect(rankings[0].games_diff).toBe(20);
  });
});
