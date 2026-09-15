import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Trophy, Users, CalendarDays, BarChart3, LayoutDashboard, User, Table2, Archive, UserCircle, Menu, X, Newspaper, ScrollText, Building2 } from 'lucide-react';
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
  const [authTab, setAuthTab] = useState('account');
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
  const [confirmBackupRestore, setConfirmBackupRestore] = useState(false);
  const [restoreBackupFile, setRestoreBackupFile] = useState(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [premierConfirmText, setPremierConfirmText] = useState('');

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

  const addSteward = async () => {
    setAuthLoading(true);
    try {
      await axios.post('/api/admin/users', { name: newAdminName.trim(), password: newAdminPassword });
      setNewAdminName('');
      setNewAdminPassword('');
      await fetchAdminUsers();
      toast.success('Steward account created');
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
      toast.success('Steward account removed');
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
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupRestoreLoading, setBackupRestoreLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);

  const refreshRole = async () => {
    try {
      const r = await axios.get('/api/auth/role');
      const nextRole = ['admin', 'steward'].includes(r?.data?.role) ? r.data.role : 'viewer';
      setRole(nextRole);
      await auth.refreshRole();
      if (nextRole === 'viewer') {
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

  const restoreDatabaseBackup = async () => {
    if (backupRestoreLoading || !restoreBackupFile) return;

    setBackupRestoreLoading(true);
    try {
      const data = await restoreBackupFile.arrayBuffer();
      await axios.post('/api/admin/database-restore', data, {
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      toast.success('Database backup restored');
      window.location.reload();
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message);
    } finally {
      setBackupRestoreLoading(false);
      setConfirmBackupRestore(false);
      setRestoreBackupFile(null);
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
      setPremierConfirmText('');
    }
  };

  const changeAdminPassword = async () => {
    setAuthLoading(true);
    try {
      await axios.put('/api/auth/admin-password', { newPassword });
      window.localStorage.setItem(ADMIN_PASSWORD_KEY, newPassword);
      await refreshRole();
      setNewPassword('');
      setConfirmNewPassword('');
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
    setAuthTab('account');
    setPasswordInput('');
    setNewPassword('');
    setConfirmNewPassword('');
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
    setConfirmNewPassword('');
    setConfirmBackupRestore(false);
    setRestoreBackupFile(null);
    setConfirmRestore(false);
    setPremierConfirmText('');
  };

  const enableAdmin = async () => {
    setAuthLoading(true);
    try {
      const name = nameInput.trim();
      const r = await axios.post('/api/auth/login', { password: passwordInput, name });
      if (!['admin', 'steward'].includes(r?.data?.role)) {
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
    { path: '/clubs', label: 'Clubs', icon: Building2 },
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
                title={role !== 'viewer' ? `${role === 'admin' ? 'Admin' : 'Steward'} enabled (click to manage)` : 'Viewer mode (click to sign in)'}
              >
                <span className={`hidden sm:inline text-xs font-semibold ${role !== 'viewer' ? 'text-green-700' : 'text-gray-600'}`}>
                  {role === 'admin' ? 'Admin' : role === 'steward' ? 'Steward' : 'Viewer'}
                </span>
                <UserCircle size={22} className={role !== 'viewer' ? 'text-green-700' : 'text-gray-700'} />
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-800">Access</h2>
              <button type="button" className="text-gray-500 hover:text-gray-700" onClick={closeAuth}>
                ✕
              </button>
            </div>

            {role !== 'viewer' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Signed in as</div>
                    <div className="font-semibold text-gray-900">{getStoredAdminName() || role}</div>
                  </div>
                  <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold capitalize text-green-800">{role}</span>
                </div>

                <div className="grid grid-cols-3 rounded-lg bg-gray-100 p-1">
                  {[
                    ['account', 'Account'],
                    ...(role === 'admin' ? [['stewards', 'Stewards']] : []),
                    ['data', 'Data'],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${authTab === key ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                      onClick={() => setAuthTab(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {authTab === 'account' && (
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-800">Change password</div>
                      <div className="text-sm text-gray-600">Update the password for your current account.</div>
                    </div>
                    <label className="block text-sm text-gray-700">
                      New password
                      <input
                        className="input mt-1"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </label>
                    <label className="block text-sm text-gray-700">
                      Confirm new password
                      <input
                        className="input mt-1"
                        type="password"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                      />
                    </label>
                    {confirmNewPassword && newPassword !== confirmNewPassword && (
                      <div className="text-sm text-red-600">Passwords do not match.</div>
                    )}
                    <div className="flex justify-end">
                      <button
                        className="btn btn-success"
                        type="button"
                        onClick={changeAdminPassword}
                        disabled={authLoading || !newPassword || newPassword !== confirmNewPassword}
                      >
                        Update password
                      </button>
                    </div>
                  </div>
                )}

                {role === 'admin' && authTab === 'stewards' && (
                  <div className="space-y-4">
                  <div>
                    <div className="text-sm font-semibold text-gray-800">Steward accounts</div>
                    <div className="text-sm text-gray-600">Manage delegated access without exposing administrator controls.</div>
                  </div>
                  <div className="space-y-3">
                    {adminUsers.filter((user) => user.role === 'steward').map((user) => (
                      <div key={user.id} className="rounded-lg border border-gray-200 p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{user.name}</span>
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Steward</span>
                          </div>
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
                  <div className="border-t border-gray-200 pt-4 space-y-3">
                    <div className="text-sm font-semibold text-gray-800">Add steward</div>
                    <label className="block text-sm text-gray-700">
                      Name
                      <input
                        className="input mt-1"
                        type="text"
                        value={newAdminName}
                        onChange={(e) => setNewAdminName(e.target.value)}
                      />
                    </label>
                    <label className="block text-sm text-gray-700">
                      Temporary password
                      <input
                        className="input mt-1"
                        type="password"
                        value={newAdminPassword}
                        onChange={(e) => setNewAdminPassword(e.target.value)}
                      />
                    </label>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={addSteward}
                        disabled={authLoading || !newAdminName.trim() || newAdminPassword.length < 3}
                      >
                        Create steward
                      </button>
                    </div>
                  </div>
                </div>
                )}

                {authTab === 'data' && (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">Download backup</div>
                        <div className="text-sm text-gray-600">Save a consistent copy of the current database.</div>
                      </div>
                      <div className="flex justify-end">
                        <button
                          className="btn btn-success"
                          type="button"
                          onClick={downloadDatabaseBackup}
                          disabled={authLoading || backupLoading || backupRestoreLoading || restoreLoading}
                        >
                          {backupLoading ? 'Preparing...' : 'Download backup'}
                        </button>
                      </div>
                    </div>

                    {role === 'admin' && (
                      <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">Restore from backup</div>
                          <div className="text-sm text-gray-600">Select a previously downloaded SQLite backup. Maximum size: 50 MB.</div>
                        </div>
                        <label
                          className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center hover:border-blue-400 hover:bg-blue-50"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            setRestoreBackupFile(e.dataTransfer.files?.[0] || null);
                            setConfirmBackupRestore(false);
                          }}
                        >
                          <span className="text-sm font-medium text-gray-800">Select a .db backup</span>
                          <span className="mt-1 text-xs text-gray-500">or drop it here</span>
                          <input
                            key={restoreBackupFile ? restoreBackupFile.name : 'no-backup-selected'}
                            className="sr-only"
                            type="file"
                            accept=".db,application/octet-stream"
                            onChange={(e) => {
                              setRestoreBackupFile(e.target.files?.[0] || null);
                              setConfirmBackupRestore(false);
                            }}
                            disabled={backupLoading || backupRestoreLoading || restoreLoading}
                          />
                        </label>
                        {restoreBackupFile && (
                          <div className="rounded-md bg-gray-50 px-3 py-2">
                            <div className="truncate text-sm font-medium text-gray-900">{restoreBackupFile.name}</div>
                            <div className="text-xs text-gray-500">{(restoreBackupFile.size / 1024 / 1024).toFixed(2)} MB</div>
                          </div>
                        )}
                        {restoreBackupFile && (
                          <div className="flex flex-wrap justify-end gap-2">
                            {confirmBackupRestore ? (
                              <>
                                <span className="self-center text-xs font-medium text-red-700">Replace all current data?</span>
                                <button className="btn btn-danger" type="button" onClick={restoreDatabaseBackup} disabled={backupRestoreLoading}>
                                  {backupRestoreLoading ? 'Restoring...' : 'Confirm restore'}
                                </button>
                                <button className="btn btn-secondary" type="button" onClick={() => setConfirmBackupRestore(false)} disabled={backupRestoreLoading}>
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button className="btn btn-warning" type="button" onClick={() => setConfirmBackupRestore(true)}>
                                Restore selected backup
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {role === 'admin' && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
                        <div>
                          <div className="text-sm font-semibold text-red-900">Danger zone</div>
                          <div className="mt-2 text-sm font-medium text-red-900">Restore Premier snapshot</div>
                          <div className="text-sm text-red-700">This replaces current league data with the bundled Premier snapshot. Download a backup first.</div>
                        </div>
                        {confirmRestore ? (
                          <div className="space-y-3">
                            <label className="block text-sm text-red-900">
                              Type RESTORE to continue
                              <input
                                className="input mt-1"
                                value={premierConfirmText}
                                onChange={(e) => setPremierConfirmText(e.target.value)}
                                autoFocus
                              />
                            </label>
                            <div className="flex justify-end gap-2">
                              <button
                                className="btn btn-danger"
                                type="button"
                                onClick={restorePremierSnapshot}
                                disabled={authLoading || restoreLoading || backupLoading || premierConfirmText !== 'RESTORE'}
                              >
                                {restoreLoading ? 'Restoring...' : 'Restore Premier snapshot'}
                              </button>
                              <button
                                className="btn btn-secondary"
                                type="button"
                                onClick={() => {
                                  setConfirmRestore(false);
                                  setPremierConfirmText('');
                                }}
                                disabled={authLoading || restoreLoading}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-end">
                            <button
                              className="btn btn-danger"
                              type="button"
                              onClick={() => {
                                setConfirmRestore(true);
                                setPremierConfirmText('');
                              }}
                              disabled={authLoading || restoreLoading || backupLoading}
                            >
                              Restore Premier snapshot
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                  <button className="btn btn-secondary" type="button" onClick={disableAdmin} disabled={authLoading}>
                    Sign out
                  </button>
                  <button className="btn btn-primary" type="button" onClick={closeAuth} disabled={authLoading}>
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-gray-700">Sign in with your admin or steward name and password to enable editing. Your actions are recorded in the activity log.</div>
                <input
                  className="input w-full"
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Account name"
                  autoFocus
                />
                <input
                  className="input w-full"
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Password"
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
                    Sign In
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
