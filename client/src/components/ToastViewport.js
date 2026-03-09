import React from 'react';
import { useToast } from '../context/ToastContext';

const typeStyles = {
  success: 'bg-green-600 text-white',
  error: 'bg-red-600 text-white',
  warning: 'bg-amber-600 text-white',
};

const ToastViewport = () => {
  const { toasts, removeToast } = useToast();

  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-lg space-y-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`w-full text-left rounded-lg shadow-lg px-4 py-3 text-sm font-medium ${typeStyles[t.type] || typeStyles.success}`}
          onClick={() => removeToast(t.id)}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
};

export default ToastViewport;
