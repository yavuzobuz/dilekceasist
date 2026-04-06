import React, { useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number;
}

const toastStyles = {
  success: 'bg-gradient-to-r from-green-600 to-emerald-600 border-green-400/30',
  error: 'bg-gradient-to-r from-red-600 to-rose-600 border-red-400/30',
  info: 'bg-gradient-to-r from-blue-600 to-cyan-600 border-blue-400/30',
  warning: 'bg-gradient-to-r from-yellow-600 to-orange-600 border-yellow-400/30',
};

const toastIcons = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
};

export const Toast: React.FC<ToastProps> = ({ message, type, onClose, duration = 4000 }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div className={`${toastStyles[type]} text-white px-6 py-4 rounded-lg shadow-2xl border backdrop-blur-sm animate-slide-in-right flex items-center gap-3 min-w-[300px] max-w-md`}>
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/20 text-xl font-bold flex-shrink-0">
        {toastIcons[type]}
      </div>
      <p className="flex-1 font-medium">{message}</p>
      <button
        onClick={onClose}
        className="text-white/80 hover:text-white transition-colors text-xl font-bold flex-shrink-0 ml-2"
      >
        ×
      </button>
    </div>
  );
};

interface ToastContainerProps {
  toasts: Array<{ id: string; message: string; type: ToastType }>;
  removeToast: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-20 right-4 z-50 space-y-3 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        </div>
      ))}
    </div>
  );
};
