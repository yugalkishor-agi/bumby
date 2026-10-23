import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { Toast, ToastProps } from '../components/ui/Toast';

interface ToastContextType {
  showToast: (options: Omit<ToastProps, 'visible' | 'onHide'>) => void;
  hideToast: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toast, setToast] = useState<ToastProps | null>(null);

  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const generationRef = useRef(0);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timersRef.current = timersRef.current.filter((entry) => entry !== timer);
      fn();
    }, ms);
    timersRef.current.push(timer);
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const hideToast = useCallback(() => {
    const generation = ++generationRef.current;
    setToast((prev) => (prev ? { ...prev, visible: false } : null));
    schedule(() => {
      if (generationRef.current === generation) setToast(null);
    }, 500);
  }, [schedule]);

  const showToast = useCallback((options: Omit<ToastProps, 'visible' | 'onHide'>) => {
    const generation = ++generationRef.current;
    const next: ToastProps = { ...options, visible: true, onHide: hideToast };

    setToast((current) => {
      if (!current) return next;
      // Fade the current toast out first; the replacement is scheduled below so
      // there is only one state update per visible transition.
      return { ...current, visible: false, onHide: hideToast };
    });

    schedule(() => {
      // A newer show/hide call won; don't resurrect a stale toast.
      if (generationRef.current !== generation) return;
      setToast(next);
    }, 60);
  }, [hideToast, schedule]);

  const contextValue = useMemo(() => ({ showToast, hideToast }), [showToast, hideToast]);

  useEffect(() => {
    setGlobalToastRef(contextValue);
    return () => setGlobalToastRef(null as any);
  }, [contextValue]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {toast && <Toast {...toast} />}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

let globalToastRef: ToastContextType | null = null;

export function setGlobalToastRef(ref: ToastContextType) {
  globalToastRef = ref;
}

export const toast = {
  success: (message: string, options?: Partial<ToastProps>) => {
    globalToastRef?.showToast({ message, type: 'success', ...options });
  },
  error: (message: string, options?: Partial<ToastProps>) => {
    globalToastRef?.showToast({ message, type: 'error', ...options });
  },
  warning: (message: string, options?: Partial<ToastProps>) => {
    globalToastRef?.showToast({ message, type: 'warning', ...options });
  },
  info: (message: string, options?: Partial<ToastProps>) => {
    globalToastRef?.showToast({ message, type: 'info', ...options });
  },
  notification: (options: Omit<ToastProps, 'visible' | 'onHide' | 'variant'>) => {
    globalToastRef?.showToast({
      ...options,
      variant: 'notification',
    });
  },
};
