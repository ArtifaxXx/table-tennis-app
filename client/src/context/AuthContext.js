import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const AuthContext = createContext({
  role: 'viewer',
  isAdmin: false,
  isSystemAdmin: false,
  isSteward: false,
  refreshRole: async () => {},
});

export const AuthProvider = ({ children }) => {
  const [role, setRole] = useState('viewer');

  const refreshRole = useCallback(async () => {
    try {
      const r = await axios.get('/api/auth/role');
      setRole(['admin', 'steward'].includes(r?.data?.role) ? r.data.role : 'viewer');
    } catch (e) {
      setRole('viewer');
    }
  }, []);

  useEffect(() => {
    refreshRole();
  }, [refreshRole]);

  const value = useMemo(
    () => ({
      role,
      isAdmin: role === 'admin' || role === 'steward',
      isSystemAdmin: role === 'admin',
      isSteward: role === 'steward',
      refreshRole,
    }),
    [role, refreshRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
