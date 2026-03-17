import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Trophy, Users, CalendarDays, BarChart3, LayoutDashboard, User, Table2, Archive, UserCircle, Menu, X, Newspaper } from 'lucide-react';
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
  const [restoreLoading, setRestoreLoading] = useState(false);

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

  const restorePremierSnapshot = async () => {
    if (restoreLoading) return;
    if (!window.confirm('Restore the Premier Division snapshot now? This will overwrite the current database.')) return;

    setRestoreLoading(true);
    try {
      await axios.post('/api/admin/restore-prem-snapshot', {});
      toast.success('Premier Division snapshot restored');
      window.location.reload();
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message);
    } finally {
      setRestoreLoading(false);
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
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/news', label: 'News & Announcements', icon: Newspaper },
    { path: '/players', label: 'Players', icon: User },
    { path: '/teams', label: 'Teams', icon: Users },
    { path: '/fixtures', label: 'Season Fixtures', icon: CalendarDays },
    { path: '/team-standings', label: 'Standings', icon: Table2 },
    { path: '/cup', label: 'Cup', icon: Trophy },
    { path: '/player-rankings', label: 'Player Rankings', icon: BarChart3 },
    { path: '/seasons', label: 'Seasons', icon: Archive },
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

          <div className="mt-3 hidden md:flex items-center gap-2 flex-wrap">
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

                <div className="border-t pt-4 space-y-4">
                  <div>
                    <div className="text-sm font-semibold text-gray-800">Restore Premier Division snapshot</div>
                    <div className="text-sm text-gray-700">Overwrites the current database with the saved Premier Division season state.</div>
                    <div className="flex justify-end">
                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={restorePremierSnapshot}
                        disabled={authLoading || restoreLoading}
                      >
                        {restoreLoading ? 'Restoring...' : 'Restore Premier Snapshot'}
                      </button>
                    </div>
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
                To get more real data with current Prem division state - click <span className="font-semibold">"Restore Premiere snapshot"</span>
              </div>
              <details className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-gray-800">Implemented features</summary>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-700">
                  <li>Dashboard metrics, upcoming fixtures, recent results, and top team/player highlights.</li>
                  <li>Teams management with contact/home-day details, club addresses, roster slots, search, and admin-only edits.</li>
                  <li>Players management with search, admin-only edits, and read-only detail views for viewers.</li>
                  <li>Season fixtures list with sorting, team filter, and calendar/unscheduled views.</li>
                  <li>Fixture detail editing: lineups, sets, auto-filled opposing scores, and completeness validation badges.</li>
                  <li>Fixture forfeits with automatic score handling (admin-only).</li>
                  <li>Season/division filters across standings, rankings, fixtures, and cup views.</li>
                  <li>Live standings and player rankings by season/division.</li>
                  <li>Cup bracket + list views with round navigation and match summaries.</li>
                  <li>Season + division management, including team assignment, fixture generation preview, and schedule creation.</li>
                  <li>Admin tools for seeding demo data and restoring the Premier Division snapshot.</li>
                </ul>
              </details>
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
