import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const VIEWER = { role: 'viewer', actorName: null, actorId: null };

const AuthContext = createContext({
  role: 'viewer',
  actorName: null,
  actorId: null,
  isAdmin: false,
  isSystemAdmin: false,
  isSteward: false,
  refreshRole: async () => VIEWER,
});

export const AuthProvider = ({ children }) => {
  const [identity, setIdentity] = useState(VIEWER);

  const refreshRole = useCallback(async () => {
    let next = VIEWER;
    try {
      const r = await axios.get('/api/auth/role');
      const role = r?.data?.role;
      if (['admin', 'steward'].includes(role)) {
        next = { role, actorName: r.data.name || null, actorId: r.data.id || null };
      }
    } catch (e) {
      next = VIEWER;
    }
    setIdentity(next);
    return next;
  }, []);

  useEffect(() => {
    refreshRole();
  }, [refreshRole]);

  const value = useMemo(
    () => ({
      role: identity.role,
      actorName: identity.actorName,
      actorId: identity.actorId,
      isAdmin: identity.role === 'admin' || identity.role === 'steward',
      isSystemAdmin: identity.role === 'admin',
      isSteward: identity.role === 'steward',
      refreshRole,
    }),
    [identity, refreshRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
