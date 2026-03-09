import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Trophy, Users, Calendar, BarChart3, Home, UserCircle, Menu, X } from 'lucide-react';
import { useDivisionContext } from '../context/DivisionContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const ADMIN_PASSWORD_KEY = 'tt-league:adminPassword:v1';

const Navbar = () => {
  const location = useLocation();
  const auth = useAuth();
  const toast = useToast();
  const [role, setRole] = useState('viewer');
  const [authOpen, setAuthOpen] = useState(false);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [seedLoading, setSeedLoading] = useState(false);

  const {
    divisions,
    selectedDivisionId,
    loading,
    setSelectedDivisionId,
  } = useDivisionContext();

  const refreshRole = async () => {
    try {
      const r = await axios.get('/api/auth/role');
      const nextRole = r?.data?.role === 'admin' ? 'admin' : 'viewer';
      setRole(nextRole);
      await auth.refreshRole();
      if (nextRole !== 'admin') {
        try {
          if (window.localStorage.getItem(ADMIN_PASSWORD_KEY)) {
            window.localStorage.removeItem(ADMIN_PASSWORD_KEY);
          }
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      setRole('viewer');
      await auth.refreshRole();
    }
  };

  const changeAdminPassword = async () => {
    setAuthLoading(true);
    try {
      await axios.put('/api/auth/admin-password', { newPassword });
      window.localStorage.setItem(ADMIN_PASSWORD_KEY, newPassword);
      await refreshRole();
      setNewPassword('');
      toast.success('Password updated');
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const seedData = async () => {
    if (seedLoading) return;
    if (!window.confirm('Seed data now? This will wipe existing data.')) return;

    setSeedLoading(true);
    try {
      await axios.post('/api/admin/seed', {});
      toast.success('Seed completed');
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message);
    } finally {
      setSeedLoading(false);
    }
  };

  useEffect(() => {
    refreshRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const openAuth = () => {
    setPasswordInput('');
    setNewPassword('');
    setAuthOpen(true);
  };

  const closeAuth = () => {
    setAuthOpen(false);
    setPasswordInput('');
    setNewPassword('');
  };

  const enableAdmin = async () => {
    setAuthLoading(true);
    try {
      window.localStorage.setItem(ADMIN_PASSWORD_KEY, passwordInput);
      await refreshRole();
      const now = await axios.get('/api/auth/role');
      if (now?.data?.role !== 'admin') {
        window.localStorage.removeItem(ADMIN_PASSWORD_KEY);
        setRole('viewer');
        toast.error('Incorrect password');
        return;
      }
      closeAuth();
    } catch (e) {
      try {
        window.localStorage.removeItem(ADMIN_PASSWORD_KEY);
      } catch (ignore) {
        // ignore
      }
      setRole('viewer');
      toast.error(e?.response?.data?.error || e.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const disableAdmin = async () => {
    setAuthLoading(true);
    try {
      window.localStorage.removeItem(ADMIN_PASSWORD_KEY);
      await refreshRole();
      closeAuth();
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const navItems = [
    { path: '/', label: 'Dashboard', icon: Home },
    { path: '/players', label: 'Players', icon: Users },
    { path: '/teams', label: 'Teams', icon: Users },
    { path: '/fixtures', label: 'Season Fixtures', icon: Calendar },
    { path: '/team-standings', label: 'Standings', icon: Trophy },
    { path: '/player-rankings', label: 'Player Rankings', icon: BarChart3 },
    { path: '/seasons', label: 'Seasons', icon: Calendar },
  ];

  return (
    <nav className="bg-white shadow-lg">
      <div className="container mx-auto px-4">
        <div className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                className="md:hidden p-2 rounded hover:bg-gray-100"
                onClick={() => setMobileOpen((v) => !v)}
                aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              >
                {mobileOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
              <h1 className="text-lg md:text-xl font-bold text-gray-800 truncate">
                <span className="hidden sm:inline">Bray & District Table Tennis League</span>
                <span className="sm:hidden">Bray TT League</span>
              </h1>
            </div>

            <div className="flex-1 flex justify-center px-2">
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setDisclaimerOpen(true)}
              >
                Prototype Disclaimer
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100"
                onClick={openAuth}
                title={role === 'admin' ? 'Admin enabled (click to manage)' : 'Viewer mode (click to enable admin)'}
              >
                <span className={`hidden sm:inline text-xs font-semibold ${role === 'admin' ? 'text-green-700' : 'text-gray-600'}`}>
                  {role === 'admin' ? 'Admin' : 'Viewer'}
                </span>
                <UserCircle size={22} className={role === 'admin' ? 'text-green-700' : 'text-gray-700'} />
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-2">
              <select
                className="input w-full md:w-auto md:min-w-56"
                value={selectedDivisionId}
                onChange={(e) => setSelectedDivisionId(e.target.value)}
                disabled={loading}
              >
                {loading && (
                  <option value="">Loading divisions...</option>
                )}
                {!loading && divisions.length === 0 && (
                  <option value="">No divisions</option>
                )}
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="hidden md:flex items-center gap-2 flex-wrap">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`nav-link flex items-center space-x-2 ${
                      isActive ? 'nav-link-active' : 'nav-link-inactive'
                    }`}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {mobileOpen && (
            <div className="md:hidden mt-3 border-t pt-3">
              <div className="grid grid-cols-1 gap-2">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`nav-link flex items-center space-x-2 ${
                        isActive ? 'nav-link-active' : 'nav-link-inactive'
                      }`}
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {authOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Access</h2>
              <button type="button" className="text-gray-500 hover:text-gray-700" onClick={closeAuth}>
                ✕
              </button>
            </div>

            {role === 'admin' ? (
              <div className="space-y-4">
                <div className="text-sm text-gray-700">You are currently signed in as admin.</div>

                <div className="border-t pt-4 space-y-2">
                  <div className="text-sm font-semibold text-gray-800">Change admin password</div>
                  <input
                    className="input w-full"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                  />
                  <div className="flex justify-end">
                    <button
                      className="btn btn-success"
                      type="button"
                      onClick={changeAdminPassword}
                      disabled={authLoading || !newPassword}
                    >
                      Update Password
                    </button>
                  </div>
                </div>

                <div className="border-t pt-4 space-y-2">
                  <div className="text-sm font-semibold text-gray-800">Seed data</div>
                  <div className="text-sm text-gray-700">This wipes all data and recreates demo data.</div>
                  <div className="flex justify-end">
                    <button
                      className="btn btn-warning"
                      type="button"
                      onClick={seedData}
                      disabled={authLoading || seedLoading}
                    >
                      {seedLoading ? 'Seeding...' : 'Seed Data'}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button className="btn" type="button" onClick={closeAuth} disabled={authLoading}>
                    Close
                  </button>
                  <button className="btn btn-danger" type="button" onClick={disableAdmin} disabled={authLoading}>
                    Switch to Viewer
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-gray-700">Enter admin password to enable editing.</div>
                <input
                  className="input w-full"
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Admin password"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <button className="btn" type="button" onClick={closeAuth} disabled={authLoading}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={enableAdmin}
                    disabled={authLoading || !passwordInput}
                  >
                    Enable Admin
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {disclaimerOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Prototype Disclaimer</h2>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-700"
                onClick={() => setDisclaimerOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-sm text-gray-800">
              <div>
                This is just a prototype that is actively developped and on a free hosting for now
              </div>
              <div>
                To get admin rights click profile icon at the top right and put in <span className="font-semibold">"555"</span> as password.
              </div>
              <div>
                To get some data enter admin mode and click on <span className="font-semibold">"Seed Data"</span>. Wait till it finishes (40 sec) and reload the page.
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button className="btn btn-secondary" type="button" onClick={() => setDisclaimerOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
