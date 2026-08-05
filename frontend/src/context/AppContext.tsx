import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import i18n from '../i18n/i18n';
import { useTheme } from './ThemeContext';
import { User, MenuItem, Order, Feedback, AuditLog, Message, Conversation, WaiterPerformance } from '../types';

interface AppContextType {
  user: User | null;
  token: string | null;
  theme: 'light' | 'dark';
  language: 'en';
  cart: { item: MenuItem; quantity: number }[];
  offlineQueue: any[];
  isOffline: boolean;
  notifications: any[];
  unreadCount: number;
  globalLoading: boolean;
  activeCafe: { id: string; name: string; location: string; image: string } | null;
  setActiveCafe: (cafe: any) => void;
  showLogoutModal: boolean;
  setShowLogoutModal: (show: boolean) => void;
  
  // Actions
  toggleTheme: () => void;
  setLanguage: (lang: 'en') => void;
  login: (employeeId: string, password: string) => Promise<any>;
  logout: () => void;
  addToCart: (item: MenuItem) => void;
  removeFromCart: (itemId: string) => void;
  updateCartQuantity: (itemId: string, qty: number) => void;
  clearCart: () => void;
  addNotification: (notification: any) => void;
  markNotificationsAsRead: () => void;
  triggerSync: () => Promise<void>;
  addToOfflineQueue: (order: any) => void;
  setGlobalLoading: (loading: boolean) => void;
  
  // API triggers
  refreshData: () => Promise<void>;
  apiGet: (path: string) => Promise<any>;
  apiPost: (path: string, body: any) => Promise<any>;
  apiPostForm: (path: string, formData: FormData) => Promise<any>;
  apiPut: (path: string, body: any) => Promise<any>;
  apiPatch: (path: string, body: any) => Promise<any>;
  apiDelete: (path: string) => Promise<any>;
  apiDownload: (path: string) => Promise<{ blob: Blob; contentDisposition?: string | null }>;
}

// Normalizes the backend's snake_case API responses into camelCase — the one
// casing convention the rest of the frontend uses. Keys in KEY_RENAMES get a
// semantic rename instead of the mechanical snake→camel conversion.
const KEY_RENAMES: Record<string, string> = {
  fullname: 'fullName',
  employee_external_id: 'employeeId',
};

const toCamelCase = (key: string) => key.replace(/_+([a-z0-9])/g, (_, ch) => ch.toUpperCase());

function normalizeApiData<T = any>(data: any): T {
  if (Array.isArray(data)) {
    return data.map(normalizeApiData) as any;
  }
  if (data && typeof data === 'object') {
    const result: any = {};
    for (const key of Object.keys(data)) {
      result[KEY_RENAMES[key] ?? toCamelCase(key)] = normalizeApiData(data[key]);
    }
    return result;
  }
  return data;
}

export function normalizeRole(role?: string | string[] | null) {
  if (!role) return null;
  if (Array.isArray(role)) {
    const normalizedRoles = role.map((r) => normalizeRole(r)).filter(Boolean) as string[];
    return normalizedRoles[0] ?? null;
  }

  const normalizedRole = String(role).toLowerCase().trim();
  if (normalizedRole === 'company_manager' || normalizedRole === 'manager') return 'manager';
  if (normalizedRole === 'cafe_manager' || normalizedRole === 'cafe') return 'cafe';
  if (normalizedRole === 'employee') return 'employee';
  if (normalizedRole === 'waiter') return 'waiter';
  return null;
}

export function getPrimaryRole(roleOrRoles?: string | string[] | null) {
  if (!roleOrRoles) return null;
  const roles = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
  const normalizedRoles = roles.map(normalizeRole).filter(Boolean) as string[];
  const priority = ['manager', 'cafe', 'waiter', 'employee'];
  return priority.find((acceptedRole) => normalizedRoles.includes(acceptedRole)) ?? null;
}

export function getPortalPathForRole(role?: string | null) {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === 'manager') return '/manager/dashboard';
  if (normalizedRole === 'cafe') return '/cafe/dashboard';
  if (normalizedRole === 'employee') return '/employee/dashboard';
  if (normalizedRole === 'waiter') return '/waiter/panel';
  return '/login';
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const u = localStorage.getItem('user');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const { theme, toggleTheme } = useTheme();
  const [language, setLangState] = useState<'en'>((localStorage.getItem('esrom_lang') as 'en') || 'en');
  const [cart, setCart] = useState<{ item: MenuItem; quantity: number }[]>([]);
  const [offlineQueue, setOfflineQueue] = useState<any[]>(() => {
    return JSON.parse(localStorage.getItem('esrom_offline_queue') || '[]');
  });
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [activeCafe, setActiveCafe] = useState<any>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const autoSyncAttemptKeyRef = useRef('');

  // Synced state triggers
  // Attempt to refresh token using stored refresh_token. Single-flight:
  // concurrent 401s share one in-flight refresh instead of racing each other,
  // which matters because the backend rotates (revokes) the refresh token on use.
  const refreshPromiseRef = useRef<Promise<boolean> | null>(null);
  const attemptRefresh = useCallback((): Promise<boolean> => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken || isOffline) return Promise.resolve(false);
    const promise = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken })
        });
        if (!res.ok) return false;
        const json = await res.json();
        const newToken = json.data?.token || json.token;
        const newRefresh = json.data?.refresh_token || json.refresh_token;
        if (newToken) {
          localStorage.setItem('token', newToken);
          setToken(newToken);
        }
        if (newRefresh) {
          localStorage.setItem('refresh_token', newRefresh);
        }
        return true;
      } catch (e) {
        console.error('Refresh token failed', e);
        return false;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();
    refreshPromiseRef.current = promise;
    return promise;
  }, [isOffline]);

  // Core fetch helper that retries once after refresh
  const performFetch = useCallback(async (path: string, opts: RequestInit = {}, retry = true) => {
    if (isOffline) {
      throw new Error('Offline mode active. API calls unavailable.');
    }
    const currentToken = localStorage.getItem('token') || token;
    const isFormData = opts.body instanceof FormData;
    const headers: any = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(opts.headers || {})
    };
    if (currentToken) headers['Authorization'] = `Bearer ${currentToken}`;
    const response = await fetch(path, { ...opts, headers });
    if (response.status === 401) {
      if (retry) {
        const ok = await attemptRefresh();
        if (ok) {
          // retry once with fresh token read directly from localStorage
          return performFetch(path, opts, false);
        }
      }
      // logout
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      localStorage.removeItem('user');
      localStorage.removeItem('refresh_token');
      setToken(null);
      setUser(null);
      const expired: any = new Error('Your session has expired');
      expired.status = 401;
      throw expired;
    }
    if (response.status === 403) {
      // Authenticated but not allowed — do NOT log out, just surface the denial.
      const err = await response.json().catch(() => ({} as any));
      const forbidden: any = new Error(err.message || "You don't have permission to perform this action.");
      forbidden.status = 403;
      throw forbidden;
    }
    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: 'API error' }));
      const error: any = new Error(err.message || 'API error');
      error.status = response.status;
      throw error;
    }
    return response;
  }, [token, isOffline, attemptRefresh]);

  const apiGet = useCallback(async (path: string) => {
    const res = await performFetch(path, { method: 'GET' });
    return res.json();
  }, [performFetch]);

  const apiPost = useCallback(async (path: string, body: any) => {
    const res = await performFetch(path, { method: 'POST', body: JSON.stringify(body) });
    const json = await res.json();
    return normalizeApiData(json);
  }, [performFetch]);

  // Goes through performFetch so multipart uploads get the same 401-refresh
  // retry and error handling as JSON calls (FormData bodies skip Content-Type).
  const apiPostForm = useCallback(async (path: string, formData: FormData) => {
    const res = await performFetch(path, { method: 'POST', body: formData });
    const json = await res.json();
    return normalizeApiData(json);
  }, [performFetch]);

  const apiPatch = useCallback(async (path: string, body: any) => {
    const res = await performFetch(path, { method: 'PATCH', body: JSON.stringify(body) });
    const json = await res.json();
    return normalizeApiData(json);
  }, [performFetch]);

  // All backend update routes are PATCH; kept as an alias for existing apiPut call sites.
  const apiPut = apiPatch;
  const apiDelete = useCallback(async (path: string) => {
    const res = await performFetch(path, { method: 'DELETE' });
    const json = await res.json();
    return normalizeApiData(json);
  }, [performFetch]);

  const apiDownload = useCallback(async (path: string) => {
    const res = await performFetch(path, { method: 'GET' });
    const blob = await res.blob();
    return { blob, contentDisposition: res.headers.get('Content-Disposition') };
  }, [performFetch]);

  // Auth fetch - ask server for the current employee profile only if role is employee
  const fetchMe = useCallback(async () => {
    const activeToken = localStorage.getItem('token') || token;
    if (!activeToken || isOffline) return;

    const storedRole = normalizeRole(localStorage.getItem('role'));
    const storedUserStr = localStorage.getItem('user');

    if (storedRole && storedRole !== 'employee') {
      if (storedUserStr) {
        try {
          const storedUser = JSON.parse(storedUserStr);
          setUser({ ...storedUser, role: storedRole });
        } catch (e) {
          console.error('Error parsing stored user', e);
        }
      }
      return;
    }

    try {
      const [res, balanceRes] = await Promise.all([
        apiGet('/api/employee/profile'),
        apiGet('/api/employee/balance').catch(() => null),
      ]);
      const apiUser = normalizeApiData(res.data || res);

      const mappedRole = getPrimaryRole(apiUser.roles || apiUser.role);
      const balance = Number(balanceRes?.data?.balance ?? balanceRes?.balance ?? 0);
      const userData = { ...apiUser, balance, role: mappedRole || apiUser.role || 'employee' };
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      if (mappedRole) localStorage.setItem('role', mappedRole);
    } catch (e) {
      console.error('Failed fetching profile', e);
    }
  }, [token, isOffline, apiGet]);

  useEffect(() => {
    if (token) {
      fetchMe();
    }
  }, [token, fetchMe]);

  // Listen to offline/online events
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
    };
    const handleOffline = () => {
      setIsOffline(true);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    const activeToken = localStorage.getItem('token') || token;
    if (!activeToken || isOffline) return;

    try {
      const res = await apiGet('/api/notifications');
      const rawItems = res?.data?.items || res?.items || (Array.isArray(res?.data) ? res.data : []);

      const items = rawItems.map((n: any) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        read: n.is_read,
        timestamp: n.created_at ? new Date(n.created_at).toLocaleString() : '',
      }));
      setNotifications(items);
    } catch (error) {
      console.error("Error loading notifications", error);

    }
  }, [token, apiGet, isOffline]);

  const fetchUnreadCount = useCallback(async () => {
    const activeToken = localStorage.getItem('token') || token;
    if (!activeToken || isOffline) return;

    try {
      const res = await apiGet('/api/notifications/unread-count');
      const count = res?.data?.count ?? res?.count ?? 0;
      setUnreadCount(count);
    } catch (error) {
      console.error(error);
    }
  }, [token, apiGet, isOffline]);


  useEffect(() => {

  if (!token) return;

  fetchNotifications();
  fetchUnreadCount();

  const interval = setInterval(() => {

    fetchNotifications();
    fetchUnreadCount();

  },7000);

  return ()=>clearInterval(interval);

},[
token,
fetchNotifications,
fetchUnreadCount
]);

  // Theme is handled in ThemeContext

  const setLanguage = (lang: 'en') => {
    setLangState(lang);
    i18n.changeLanguage(lang);
    localStorage.setItem('esrom_lang', lang);
  };

const login = async (employeeId: string, password: string): Promise<any> => {
  setGlobalLoading(true);
  try {
    const res = await apiPost('/api/auth/login', { employee_external_id: employeeId, password });
    // apiPost responses are camelCased by normalizeApiData (refresh_token -> refreshToken)
    const { token, refreshToken, user: apiUser } = res.data;

    const role = getPrimaryRole(apiUser.roles || apiUser.role) ?? 'employee';
    const userData = { ...apiUser, role };

    localStorage.setItem('token', token);
    localStorage.setItem('role', role);
    localStorage.setItem('user', JSON.stringify(userData));
    if (refreshToken) localStorage.setItem('refresh_token', refreshToken);

    setToken(token);
    setUser(userData);

    if (role === 'employee') {
      await fetchMe();
    }

    setGlobalLoading(false);
    return { token, refreshToken, user: userData };
  } catch (e) {
    setGlobalLoading(false);
    throw e;
  }
};

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('user');
    localStorage.removeItem('refresh_token');
    setToken(null);
    setUser(null);
    setCart([]);
    setActiveCafe(null);
  };

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.item.id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.item.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => prev.filter((i) => i.item.id !== itemId));
  };

  const updateCartQuantity = (itemId: string, qty: number) => {
    if (qty <= 0) {
      removeFromCart(itemId);
      return;
    }
    setCart((prev) =>
      prev.map((i) => (i.item.id === itemId ? { ...i, quantity: qty } : i))
    );
  };

  const clearCart = () => {
    setCart([]);
  };

  const addNotification = (notif: any) => {
    setNotifications((prev) => [notif, ...prev]);
    setUnreadCount((c) => c + 1);
  };

  const markNotificationsAsRead = async () => {
    if (!token || isOffline) return;
    try {
      await apiPatch('/api/notifications/read-all', {});
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (e) {
      console.error('Error marking read:', e);
    }
  };

  const addToOfflineQueue = (order: any) => {
    const queue = [...offlineQueue, order];
    setOfflineQueue(queue);
    localStorage.setItem('esrom_offline_queue', JSON.stringify(queue));
  };

  // Sync waiter offline queue
  const triggerSync = async () => {
    if (offlineQueue.length === 0 || isOffline) return;
    setGlobalLoading(true);
    try {
      const response = await apiPost('/api/waiter/sync-orders', { orders: offlineQueue });
      const results = response.data?.results ?? response.results ?? [];
      // Keep only orders the server did not accept, so a temporary validation
      // issue never silently loses a meal order.
      const remaining = offlineQueue.filter((_, index) => !results.find((item: any) => item.index === index && item.success));
      setOfflineQueue(remaining);
      localStorage.setItem('esrom_offline_queue', JSON.stringify(remaining));
      setGlobalLoading(false);
      fetchNotifications();
    } catch (e) {
      console.error('Sync failed:', e);
      setGlobalLoading(false);
      throw e;
    }
  };

  // Auto-sync when online restores
  useEffect(() => {
    if (!isOffline && offlineQueue.length > 0 && token) {
      const queueKey = offlineQueue.map((order) => order.queued_at ?? order.employee_id).join('|');
      if (autoSyncAttemptKeyRef.current !== queueKey) {
        autoSyncAttemptKeyRef.current = queueKey;
        triggerSync().catch(console.error);
      }
    } else if (isOffline) {
      // The next online event should always make a fresh sync attempt.
      autoSyncAttemptKeyRef.current = '';
    }
  }, [isOffline, offlineQueue, token]);

  const refreshData = async () => {
    await fetchMe();
    await fetchNotifications();
    await fetchUnreadCount();
  };

  return (
    <AppContext.Provider
      value={{
        user,
        token,
        theme,
        language,
        cart,
        offlineQueue,
        isOffline,
        notifications,
        unreadCount,
        globalLoading,
        activeCafe,
        setActiveCafe,
        showLogoutModal,
        setShowLogoutModal,
        toggleTheme,
        setLanguage,
        login,
        logout,
        addToCart,
        removeFromCart,
        updateCartQuantity,
        clearCart,
        addNotification,
        markNotificationsAsRead,
        triggerSync,
        addToOfflineQueue,
        setGlobalLoading,
        refreshData,
        apiGet,
        apiPost,
        apiPostForm,
        apiPut,
        apiPatch,
        apiDelete,
        apiDownload
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
