import React, { createContext, useContext, useState, useEffect } from 'react';
import AuthService from '../services/AuthService.js';
import { useNavigate } from 'react-router-dom'; // <-- Add this if using react-router

const AuthContext = createContext();

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate(); 

  useEffect(() => {
    // Load user from localStorage on initial render and validate token
    const user = AuthService.getUser();
    if (user && AuthService.isTokenExpired()) {
      // Token is expired: perform logout to clear storage and redirect
      AuthService.logout();
      setCurrentUser(null);
      setLoading(false);
      try {
        let prefix = '/en';
        if (typeof window !== 'undefined') {
          const path = window.location.pathname;
          if (path.startsWith('/fr')) prefix = '/fr';
        }
        navigate(`${prefix}/signin`);
      } catch (e) {
        // ignore navigation errors
      }
      return;
    }

    setCurrentUser(user);
    setLoading(false);

    // Set up unauthorized callback
    AuthService.setUnauthorizedCallback(() => {
      setCurrentUser(null);
      // Determine language prefix from current location
      let prefix = '/en';
      if (typeof window !== 'undefined') {
        const path = window.location.pathname;
        if (path.startsWith('/fr')) prefix = '/fr';
      }
      navigate(`${prefix}/signin`); // Redirect to language-specific signin
    });

    // Cleanup on unmount
    return () => {
      AuthService.setUnauthorizedCallback(null);
    };
  }, [navigate]);

  // Update context when user logs in or out
  const login = async (email, password) => {
    try {
      setLoading(true);
      const data = await AuthService.login(email, password);
      // If twoFA is required, do not set currentUser yet -- caller should prompt for code
      if (data && data.twoFA) {
        return {
          user: data.user,
          twoFA: true,
          defaultRoute: getDefaultRouteForRole(data.user.role)
        };
      }

      // Update the user state for normal login
      await Promise.resolve(setCurrentUser(data.user));
      return {
        user: data.user,
        defaultRoute: getDefaultRouteForRole(data.user.role)
      };
    } finally {
      setLoading(false);
    }
  };
  
  const signup = async (email, password) => {
    try {
      setLoading(true);
      const data = await AuthService.signup(email, password);
      setCurrentUser(data.user);
      return data;
    } finally {
      setLoading(false);
    }
  };
  
  const logout = () => {
    setLoading(true);
    AuthService.logout();
    setCurrentUser(null);
    setLoading(false);
    // Redirect to signin preserving language prefix
    try {
      let prefix = '/en';
      if (typeof window !== 'undefined') {
        const path = window.location.pathname;
        if (path.startsWith('/fr')) prefix = '/fr';
      }
      navigate(`${prefix}/signin`);
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

  const getDefaultRouteForRole = (role, lang = 'en') => {
    const prefix = lang === 'fr' ? '/fr' : '/en';
    if (role === 'admin' || role === 'partner') {
      return `${prefix}/admin`;
    }
    return prefix;
  };

  const value = {
    currentUser,
    loading,
    login,
    refreshUser: () => setCurrentUser(AuthService.getUser()),
    signup,
    logout,
    isAdmin,
    isPartner,
    hasRole,
    getDefaultRouteForRole
  };
  
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
