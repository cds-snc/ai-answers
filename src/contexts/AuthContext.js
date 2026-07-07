import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import AuthService from '../services/AuthService.js';
import { useLocation, useNavigate } from 'react-router-dom';
import { getPath } from '../utils/routes.js';
import { getPublicAuthExemptPaths } from '../config/appRoutePaths.js';

const AuthContext = createContext();
const SESSION_EXPIRED_REASON = 'session-expired';
const SESSION_WARNING_WINDOW_MS = 60 * 1000;

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpiresAt, setSessionExpiresAt] = useState(null);
  const [sessionWarningVisible, setSessionWarningVisible] = useState(false);
  const [sessionExpiredRedirecting, setSessionExpiredRedirecting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const currentUserRef = useRef(null);
  const redirectingRef = useRef(false);
  const sessionCheckInFlightRef = useRef(false);
  const sessionWarningTimerRef = useRef(null);
  const sessionLogoutTimerRef = useRef(null);
  const requireAuthForChat = typeof window !== 'undefined' && window.RUNTIME_CONFIG && window.RUNTIME_CONFIG.REQUIRE_AUTH_FOR_CHAT;
  const publicAuthExemptPaths = useRef(getPublicAuthExemptPaths(requireAuthForChat)).current;

  const isPublicAuthExemptPath = useCallback((pathname) => {
    const normalizedPathname = pathname && pathname !== '/' ? pathname.replace(/\/+$/, '') : pathname;
    return publicAuthExemptPaths.has(normalizedPathname || '/');
  }, [publicAuthExemptPaths]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const getSigninPath = useCallback(() => {
    const pathname = (typeof window !== 'undefined' && window.location && window.location.pathname)
      || '/en';
    const lang = pathname.startsWith('/fr') ? 'fr' : 'en';
    return `${getPath('signin', lang)}?reason=${SESSION_EXPIRED_REASON}`;
  }, []);

  const clearSessionTimers = useCallback(() => {
    if (sessionWarningTimerRef.current) {
      clearTimeout(sessionWarningTimerRef.current);
      sessionWarningTimerRef.current = null;
    }
    if (sessionLogoutTimerRef.current) {
      clearTimeout(sessionLogoutTimerRef.current);
      sessionLogoutTimerRef.current = null;
    }
  }, []);

  const syncSessionExpiry = useCallback(() => {
    const expiry = AuthService.getSessionExpiresAt();
    setSessionExpiresAt(typeof expiry === 'number' ? expiry : null);
    return typeof expiry === 'number' ? expiry : null;
  }, []);

  const redirectToSignin = useCallback((options = {}) => {
    const { clearSession = true, hardReload = true } = options;
    if (redirectingRef.current) return;
    redirectingRef.current = true;
    setSessionExpiredRedirecting(true);
    const signinPath = getSigninPath();

    if (clearSession) {
      AuthService.logout();
    }

    clearSessionTimers();
    setSessionWarningVisible(false);
    setSessionExpiresAt(null);

    try {
      if (hardReload && typeof window !== 'undefined') {
        // Force a full reload so the app boots from a clean session state.
        window.location.replace(signinPath);
      } else {
        navigate(signinPath);
      }
    } catch (e) {
      // Fallback to SPA navigation if the hard redirect fails.
      try { navigate(signinPath); } catch (err) { /* ignore */ }
    }

    currentUserRef.current = null;
    setCurrentUser(null);
    setLoading(false);
  }, [clearSessionTimers, getSigninPath, navigate]);

  const scheduleSessionExpiryState = useCallback((expiryOverride = null) => {
    clearSessionTimers();
    setSessionWarningVisible(false);

    if (!currentUserRef.current || isPublicAuthExemptPath(location.pathname)) {
      return;
    }

    const expiry = typeof expiryOverride === 'number' ? expiryOverride : sessionExpiresAt;
    if (typeof expiry !== 'number' || Number.isNaN(expiry)) {
      return;
    }

    const now = Date.now();
    const timeUntilLogout = expiry - now;
    if (timeUntilLogout <= 0) {
      redirectToSignin({ hardReload: false });
      return;
    }

    const timeUntilWarning = timeUntilLogout - SESSION_WARNING_WINDOW_MS;
    if (timeUntilWarning <= 0) {
      setSessionWarningVisible(true);
    } else {
      sessionWarningTimerRef.current = setTimeout(() => {
        setSessionWarningVisible(true);
      }, timeUntilWarning);
    }

    sessionLogoutTimerRef.current = setTimeout(() => {
      redirectToSignin({ hardReload: false });
    }, timeUntilLogout);
  }, [clearSessionTimers, location.pathname, redirectToSignin, sessionExpiresAt]);

  const revalidateSession = useCallback(async () => {
    if (sessionCheckInFlightRef.current || redirectingRef.current || !currentUserRef.current) {
      return;
    }

    if (isPublicAuthExemptPath(location.pathname)) {
      return;
    }

    sessionCheckInFlightRef.current = true;
    try {
      const user = await AuthService.getCurrentUser();
      if (user && user.active !== false) {
        currentUserRef.current = user;
        setCurrentUser(user);
        const expiry = syncSessionExpiry();
        scheduleSessionExpiryState(expiry);
        return;
      }

      redirectToSignin({ hardReload: false });
    } catch (error) {
      console.error('Session revalidation failed:', error);
      if (currentUserRef.current) {
        redirectToSignin({ hardReload: false });
      }
    } finally {
      sessionCheckInFlightRef.current = false;
    }
  }, [redirectToSignin, isPublicAuthExemptPath, location.pathname]);

  useEffect(() => {
    // Load user from server on initial render
    const initAuth = async () => {
    try {
      const user = await AuthService.getCurrentUser();
      setCurrentUser(user);
      const expiry = syncSessionExpiry();
      scheduleSessionExpiryState(expiry);
    } catch (error) {
      console.error('Failed to load user:', error);
      setCurrentUser(null);
      setSessionExpiresAt(null);
    } finally {
      setLoading(false);
    }
    };

    initAuth();

    // Set up unauthorized callback
    AuthService.setUnauthorizedCallback(() => redirectToSignin({ clearSession: false }));

    // Cleanup on unmount
    return () => {
      AuthService.setUnauthorizedCallback(null);
    };
  }, [redirectToSignin]);

  useEffect(() => {
    if (!currentUserRef.current) return;
    if (isPublicAuthExemptPath(location.pathname)) return;
    scheduleSessionExpiryState();

    const handleFocus = () => {
      revalidateSession();
    };

    const handleVisibilityChange = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        revalidateSession();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUser, isPublicAuthExemptPath, location.pathname, revalidateSession, scheduleSessionExpiryState]);

  // Update context when user logs in or out
  const login = async (email, password) => {
    const lang = (typeof window !== 'undefined' && window.location.pathname.startsWith('/fr')) ? 'fr' : 'en';
    try {
      setLoading(true);
      const data = await AuthService.login(email, password);
      setSessionExpiredRedirecting(false);
      // If twoFA is required, do not set currentUser yet -- caller should prompt for code
      if (data && data.twoFA) {
        return {
          user: data.user,
          twoFA: true,
          defaultRoute: getDefaultRouteForRole(data.user.role, lang)
        };
      }

      // Update the user state for normal login
      setCurrentUser(data.user);
      const expiry = syncSessionExpiry();
      scheduleSessionExpiryState(expiry);
      return {
        user: data.user,
        defaultRoute: getDefaultRouteForRole(data.user.role, lang)
      };
    } finally {
      setLoading(false);
    }
  };

  const signup = async (email, password) => {
    try {
      setLoading(true);
      const data = await AuthService.signup(email, password);
      setSessionExpiredRedirecting(false);
      setCurrentUser(data.user);
      const expiry = syncSessionExpiry();
      scheduleSessionExpiryState(expiry);
      return data;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setLoading(true);
    AuthService.logout();
    redirectingRef.current = false;
    sessionCheckInFlightRef.current = false;
    setSessionExpiredRedirecting(false);
    clearSessionTimers();
    currentUserRef.current = null;
    setCurrentUser(null);
    setSessionExpiresAt(null);
    setSessionWarningVisible(false);
    setLoading(false);
    // Redirect to signin preserving language prefix
    try {
      let prefix = '/en';
      if (typeof window !== 'undefined') {
        const path = window.location.pathname;
        if (path.startsWith('/fr')) prefix = '/fr';
      }

      // Use full page replace so the app starts fresh on signin
      window.location.replace(getPath('signin', prefix === '/fr' ? 'fr' : 'en'));

    } catch (e) {
      // ignore navigation errors
    }
  };

  // Helper methods for role checking
  const isAdmin = () => {
    return currentUser?.role === 'admin';
  };

  const isPartner = () => {
    return currentUser?.role === 'partner';
  };

  const hasRole = (role) => {
    return currentUser?.role === role;
  };

  const refreshUser = async () => {
    try {
      const user = await AuthService.getCurrentUser();
      setCurrentUser(user);
      const expiry = syncSessionExpiry();
      scheduleSessionExpiryState(expiry);
    } catch (error) {
      console.error('Failed to refresh user:', error);
      setCurrentUser(null);
      setSessionExpiresAt(null);
    }
  };

  const getDefaultRouteForRole = (role, lang = 'en') => {
    if (role === 'admin' || role === 'partner') {
      return getPath('admin', lang);
    }
    return `/${lang}`;
  };

  const value = {
    currentUser,
    loading,
    login,
    refreshUser,
    signup,
    logout,
    isAdmin,
    isPartner,
    hasRole,
    getDefaultRouteForRole,
    sessionWarningVisible,
    sessionExpiresAt,
    sessionExpiredRedirecting
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
