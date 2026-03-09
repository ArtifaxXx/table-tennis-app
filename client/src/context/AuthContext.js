import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const AuthContext = createContext({
  role: 'viewer',
  isAdmin: false,
  refreshRole: async () => {},
});

export const AuthProvider = ({ children }) => {
  const [role, setRole] = useState('viewer');

  const refreshRole = useCallback(async () => {
    try {
      const r = await axios.get('/api/auth/role');
      setRole(r?.data?.role === 'admin' ? 'admin' : 'viewer');
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
      isAdmin: role === 'admin',
      refreshRole,
    }),
    [role, refreshRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
