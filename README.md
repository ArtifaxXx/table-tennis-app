# Table Tennis League Management System

A comprehensive web application for managing table tennis leagues, players, matches, and statistics.

## Features

- **Player Management**: Add, edit, and manage league players with skill levels and contact information
- **Match Scheduling**: Schedule matches between players and track results
- **League Standings**: Automatic calculation of standings based on match results
- **Statistics Dashboard**: Detailed analytics and insights about league performance
- **Modern UI**: Clean, responsive interface built with React and Tailwind CSS

## Tech Stack

### Backend
- **Node.js** with Express.js
- **SQLite** database for data persistence
- **RESTful API** architecture

### Frontend
- **React 18** with modern hooks
- **React Router** for navigation
- **Tailwind CSS** for styling
- **Recharts** for data visualization
- **Lucide React** for icons

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd table-tennis-league
   ```

2. **Install backend dependencies**
   ```bash
   npm install
   ```

3. **Install frontend dependencies**
   ```bash
   cd client
   npm install
   cd ..
   ```

4. **Start the application**

   **Option 1: Development (Recommended)**
   - Start the backend server:
     ```bash
     npm run dev
     ```
   - In a new terminal, start the frontend:
     ```bash
     npm run client
     ```

   **Option 2: Production Build**
   ```bash
   npm run build
   npm start
   ```

5. **Access the application**
   - Frontend: http://localhost:3000
   - API: http://localhost:3001

## API Endpoints

### Players
- `GET /api/players` - Get all players
- `POST /api/players` - Create a new player
- `GET /api/players/:id` - Get a specific player
- `PUT /api/players/:id` - Update a player
- `DELETE /api/players/:id` - Delete a player

### Matches
- `GET /api/matches` - Get all matches
- `POST /api/matches` - Create a new match
- `GET /api/matches/:id` - Get a specific match
- `PUT /api/matches/:id` - Update a match

### League
- `GET /api/standings` - Get current league standings
- `GET /api/statistics` - Get league statistics
- `GET /api/schedule` - Generate match schedule

## Database Schema

The application uses SQLite with the following tables:

### Players
- `id` - Unique identifier
- `name` - Player name
- `email` - Contact email
- `phone` - Contact phone
- `skill_level` - 1-5 rating
- `active` - Active status
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

### Matches
- `id` - Unique identifier
- `player1_id` - First player ID
- `player2_id` - Second player ID
- `player1_score` - First player score
- `player2_score` - Second player score
- `match_date` - Scheduled date
- `status` - scheduled/completed/cancelled
- `winner_id` - Winner player ID
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

### Seasons
- `id` - Unique identifier
- `name` - Season name
- `start_date` - Season start date
- `end_date` - Season end date
- `active` - Active status

### Season Participants
- `id` - Unique identifier
- `season_id` - Season ID
- `player_id` - Player ID
- `joined_at` - Join timestamp

## Usage Guide

### Adding Players
1. Navigate to the Players page
2. Click "Add Player"
3. Fill in player information (name is required)
4. Select skill level (1-5)
5. Save the player

### Scheduling Matches
1. Go to the Matches page
2. Click "Schedule Match"
3. Select two different players
4. Optionally set match date and time
5. Save the match

### Recording Results
1. Find the scheduled match in the "Upcoming Matches" section
2. Click the checkmark icon to complete the match
3. Enter scores for both players
4. The winner is automatically determined

### Viewing Standings
1. Navigate to the Standings page
2. View current league rankings
3. See top 3 players highlighted
4. Check detailed statistics for all players

### Statistics
1. Visit the Statistics page for comprehensive analytics
2. View skill level distribution
3. Check top performer win rates
4. Monitor recent match activity

## Project Structure

```
table-tennis-league/
├── src/
│   ├── index.js              # Main server file
│   ├── database.js           # Database connection and setup
│   └── models/
│       ├── player.js        # Player management logic
│       ├── match.js         # Match management logic
│       └── league.js        # League statistics and standings
├── client/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   └── Navbar.js    # Navigation component
│   │   ├── pages/
│   │   │   ├── Dashboard.js # Main dashboard
│   │   │   ├── Players.js   # Player management
│   │   │   ├── Matches.js   # Match management
│   │   │   ├── Standings.js # League standings
│   │   │   └── Statistics.js # Statistics page
│   │   ├── App.js           # Main React app
│   │   └── index.js         # React entry point
│   ├── package.json
│   └── tailwind.config.js
├── data/                    # SQLite database files
├── package.json
└── README.md
```

## Development

### Running Tests
```bash
npm test
```

### Environment Variables
Create a `.env` file in the root directory:
```
PORT=3001
NODE_ENV=development
```

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For issues and questions, please open an issue on the GitHub repository.
