import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Trophy, Users, CalendarDays, BarChart3, LayoutDashboard, User, Table2, Archive, UserCircle, Menu, X, Newspaper, ScrollText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const ADMIN_PASSWORD_KEY = 'tt-league:adminPassword:v1';
const ADMIN_NAME_KEY = 'tt-league:adminName:v1';

const Navbar = () => {
  const location = useLocation();
  const auth = useAuth();
  const toast = useToast();
  const [role, setRole] = useState('viewer');
  const [authOpen, setAuthOpen] = useState(false);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [adminUsers, setAdminUsers] = useState([]);
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [resetTargetId, setResetTargetId] = useState(null);
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmRestore, setConfirmRestore] = useState(false);

  const getStoredAdminName = () => {
    try {
      return window.localStorage.getItem(ADMIN_NAME_KEY) || '';
    } catch (e) {
      return '';
    }
  };

  const fetchAdminUsers = async () => {
    try {
      const r = await axios.get('/api/admin/users');
      setAdminUsers(r.data || []);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    if (authOpen && role === 'admin') {
      fetchAdminUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authOpen, role]);

  const addAdminUser = async () => {
    setAuthLoading(true);
    try {
      await axios.post('/api/admin/users', { name: newAdminName.trim(), password: newAdminPassword });
      setNewAdminName('');
      setNewAdminPassword('');
      await fetchAdminUsers();
      toast.success('Admin account created');
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const removeAdminUser = async (user) => {
    setAuthLoading(true);
    try {
      await axios.delete(`/api/admin/users/${user.id}`);
      setConfirmDeleteId(null);
      await fetchAdminUsers();
      toast.success('Admin account removed');
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const resetAdminUserPassword = async (user) => {
    if (!resetPasswordInput.trim()) return;
    setAuthLoading(true);
    try {
      await axios.put(`/api/admin/users/${user.id}`, { password: resetPasswordInput.trim() });
      setResetTargetId(null);
      setResetPasswordInput('');
      toast.success('Password updated');
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message);
    } finally {
      setAuthLoading(false);
    }
  };
  const [authLoading, setAuthLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [backupLoading, setBackupLoading] = useState(false);
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

  const downloadDatabaseBackup = async () => {
    if (backupLoading) return;

    setBackupLoading(true);
    try {
      const response = await axios.get('/api/admin/database-backup', { responseType: 'blob' });
      const disposition = response.headers['content-disposition'] || '';
      const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
      const filename = filenameMatch?.[1] || `league-backup-${new Date().toISOString().slice(0, 10)}.db`;
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Database backup downloaded');
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message);
    } finally {
      setBackupLoading(false);
    }
  };

  const restorePremierSnapshot = async () => {
    if (restoreLoading) return;

    setRestoreLoading(true);
    try {
      await axios.post('/api/admin/restore-prem-snapshot', {});
      toast.success('Premier Division snapshot restored');
      window.location.reload();
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message);
    } finally {
      setRestoreLoading(false);
      setConfirmRestore(false);
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
    try {
      setNameInput(window.localStorage.getItem(ADMIN_NAME_KEY) || '');
    } catch (e) {
      setNameInput('');
    }
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
      const name = nameInput.trim();
      const r = await axios.post('/api/auth/login', { password: passwordInput, name });
      if (r?.data?.role !== 'admin') {
        toast.error('Incorrect name or password');
        return;
      }
      window.localStorage.setItem(ADMIN_PASSWORD_KEY, passwordInput);
      window.localStorage.setItem(ADMIN_NAME_KEY, r.data.name || name);
      await refreshRole();
      closeAuth();
    } catch (e) {
      if (e?.response?.status === 401) {
        toast.error('Incorrect name or password');
      } else {
        toast.error(e?.response?.data?.error || e.message);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const disableAdmin = async () => {
    setAuthLoading(true);
    try {
      let name = '';
      try {
        name = window.localStorage.getItem(ADMIN_NAME_KEY) || '';
      } catch (ignore) {
        // ignore
      }
      try {
        await axios.post('/api/auth/logout', { name });
      } catch (ignore) {
        // ignore
      }
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
    { path: '/news', label: 'Announcements', icon: Newspaper },
    { path: '/players', label: 'Players', icon: User },
    { path: '/teams', label: 'Teams', icon: Users },
    { path: '/fixtures', label: 'Season Fixtures', icon: CalendarDays },
    { path: '/team-standings', label: 'Standings', icon: Table2 },
    { path: '/cup', label: 'Cup', icon: Trophy },
    { path: '/player-rankings', label: 'Player Rankings', icon: BarChart3 },
    { path: '/seasons', label: 'Seasons', icon: Archive },
    { path: '/activity', label: 'Activity', icon: ScrollText, adminOnly: true },
  ];

  const visibleNavItems = navItems.filter((item) => !item.adminOnly || role === 'admin');

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
            {visibleNavItems.map((item) => {
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
                {visibleNavItems.map((item) => {
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
                <div className="text-sm text-gray-700">
                  You are currently signed in as admin{getStoredAdminName() ? ` — ${getStoredAdminName()}` : ''}.
                </div>

                <div className="border-t pt-4 space-y-2">
                  <div className="text-sm font-semibold text-gray-800">Change my password</div>
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
                  <div className="text-sm font-semibold text-gray-800">Admin accounts</div>
                  <div className="space-y-2">
                    {adminUsers.map((user) => (
                      <div key={user.id} className="text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-gray-800">
                            {user.name}
                            {user.name === getStoredAdminName() ? ' (you)' : ''}
                          </span>
                          {resetTargetId !== user.id && confirmDeleteId !== user.id && (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => {
                                  setResetTargetId(user.id);
                                  setResetPasswordInput('');
                                }}
                                disabled={authLoading}
                              >
                                Reset password
                              </button>
                              <button
                                type="button"
                                className="btn btn-danger"
                                onClick={() => setConfirmDeleteId(user.id)}
                                disabled={authLoading || user.name === getStoredAdminName()}
                              >
                                Remove
                              </button>
                            </div>
                          )}
                          {confirmDeleteId === user.id && (
                            <div className="flex gap-2 items-center">
                              <span className="text-xs text-gray-600">Remove account?</span>
                              <button
                                type="button"
                                className="btn btn-danger"
                                onClick={() => removeAdminUser(user)}
                                disabled={authLoading}
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                className="btn"
                                onClick={() => setConfirmDeleteId(null)}
                                disabled={authLoading}
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                        {resetTargetId === user.id && (
                          <div className="mt-2 flex gap-2">
                            <input
                              className="input flex-1"
                              type="password"
                              value={resetPasswordInput}
                              onChange={(e) => setResetPasswordInput(e.target.value)}
                              placeholder={`New password for ${user.name}`}
                              autoFocus
                            />
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => resetAdminUserPassword(user)}
                              disabled={authLoading || resetPasswordInput.trim().length < 3}
                            >
                              Set
                            </button>
                            <button
                              type="button"
                              className="btn"
                              onClick={() => {
                                setResetTargetId(null);
                                setResetPasswordInput('');
                              }}
                              disabled={authLoading}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      className="input flex-1"
                      type="text"
                      value={newAdminName}
                      onChange={(e) => setNewAdminName(e.target.value)}
                      placeholder="Name"
                    />
                    <input
                      className="input flex-1"
                      type="password"
                      value={newAdminPassword}
                      onChange={(e) => setNewAdminPassword(e.target.value)}
                      placeholder="Password"
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={addAdminUser}
                      disabled={authLoading || !newAdminName.trim() || newAdminPassword.length < 3}
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div className="border-t pt-4 space-y-4">
                  <div>
                    <div className="text-sm font-semibold text-gray-800">Database backup</div>
                    <div className="text-sm text-gray-700">Download a consistent copy of the current database for safe storage.</div>
                    <div className="flex justify-end">
                      <button
                        className="btn btn-success"
                        type="button"
                        onClick={downloadDatabaseBackup}
                        disabled={authLoading || backupLoading || restoreLoading}
                      >
                        {backupLoading ? 'Preparing...' : 'Download Backup'}
                      </button>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="text-sm font-semibold text-gray-800">Restore Premier Division snapshot</div>
                    <div className="text-sm text-gray-700">Overwrites the current database with the saved Premier Division season state.</div>
                    <div className="flex justify-end gap-2">
                      {confirmRestore ? (
                        <>
                          <span className="text-xs text-gray-600 self-center">Overwrite the current database?</span>
                          <button
                            className="btn btn-danger"
                            type="button"
                            onClick={restorePremierSnapshot}
                            disabled={authLoading || restoreLoading || backupLoading}
                          >
                            {restoreLoading ? 'Restoring...' : 'Confirm restore'}
                          </button>
                          <button
                            className="btn"
                            type="button"
                            onClick={() => setConfirmRestore(false)}
                            disabled={authLoading || restoreLoading}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          className="btn btn-primary"
                          type="button"
                          onClick={() => setConfirmRestore(true)}
                          disabled={authLoading || restoreLoading || backupLoading}
                        >
                          Restore Premier Snapshot
                        </button>
                      )}
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
                <div className="text-sm text-gray-700">Sign in with your admin name and password to enable editing. Your actions are recorded in the activity log.</div>
                <input
                  className="input w-full"
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Admin name"
                  autoFocus
                />
                <input
                  className="input w-full"
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Admin password"
                />
                <div className="flex justify-end gap-2">
                  <button className="btn" type="button" onClick={closeAuth} disabled={authLoading}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={enableAdmin}
                    disabled={authLoading || !passwordInput || !nameInput.trim()}
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
                To get admin rights click the profile icon at the top right and sign in with your admin name and password.
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
                  <li>Fixture detail editing: lineups, games, auto-filled opposing scores, and completeness validation badges.</li>
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
