import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Players from './pages/Players';
import Teams from './pages/Teams';
import Fixtures from './pages/Fixtures';
import FixtureDetail from './pages/FixtureDetail';
import TeamStandings from './pages/TeamStandings';
import PlayerRankings from './pages/PlayerRankings';
import Cup from './pages/Cup';
import Seasons from './pages/Seasons';
import { DivisionProvider } from './context/DivisionContext';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ToastViewport from './components/ToastViewport';
import BuildInfoWidget from './components/BuildInfoWidget';

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <DivisionProvider>
          <div className="min-h-screen bg-gray-50">
            <Navbar />
            <main className="container mx-auto px-4 py-8">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/players" element={<Players />} />
                <Route path="/teams" element={<Teams />} />
                <Route path="/fixtures" element={<Fixtures />} />
                <Route path="/fixtures/:id" element={<FixtureDetail />} />
                <Route path="/team-standings" element={<TeamStandings />} />
                <Route path="/cup" element={<Cup />} />
                <Route path="/player-rankings" element={<PlayerRankings />} />
                <Route path="/seasons" element={<Seasons />} />
              </Routes>
            </main>
            <ToastViewport />
            <BuildInfoWidget />
          </div>
        </DivisionProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
