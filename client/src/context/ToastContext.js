import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

// Actions (showToast/success/error/warning/removeToast) live in their own
// context with stable identities: adding or removing a toast must not
// re-render every consumer. The toast list is separate so only the viewport
// re-renders when it changes.
const ToastActionsContext = createContext({
  showToast: () => {},
  removeToast: () => {},
  success: () => {},
  error: () => {},
  warning: () => {},
});
const ToastsContext = createContext([]);

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

  const success = useCallback((message, options) => showToast('success', message, options), [showToast]);
  const error = useCallback((message, options) => showToast('error', message, options), [showToast]);
  const warning = useCallback((message, options) => showToast('warning', message, options), [showToast]);

  const actions = useMemo(
    () => ({ showToast, removeToast, success, error, warning }),
    [showToast, removeToast, success, error, warning]
  );

  return (
    <ToastActionsContext.Provider value={actions}>
      <ToastsContext.Provider value={toasts}>{children}</ToastsContext.Provider>
    </ToastActionsContext.Provider>
  );
};

export const useToast = () => useContext(ToastActionsContext);
export const useToasts = () => useContext(ToastsContext);
