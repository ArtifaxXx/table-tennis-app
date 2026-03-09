import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext({
  showToast: () => {},
  success: () => {},
  error: () => {},
  warning: () => {},
});

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(1);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type, message, options = {}) => {
      const id = idRef.current++;
      const durationMs = Number(options.durationMs || 2500);

      setToasts((prev) => [...prev, { id, type, message }]);

      window.setTimeout(() => {
        removeToast(id);
      }, durationMs);

      return id;
    },
    [removeToast]
  );

  const value = useMemo(
    () => ({
      toasts,
      removeToast,
      showToast,
      success: (message, options) => showToast('success', message, options),
      error: (message, options) => showToast('error', message, options),
      warning: (message, options) => showToast('warning', message, options),
    }),
    [removeToast, showToast, toasts]
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
};

export const useToast = () => useContext(ToastContext);
