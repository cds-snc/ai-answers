import React, { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext.js';

const LogoutPage = () => {
  const { logout } = useAuth();

  useEffect(() => {
    const performLogout = async () => {
      await logout();
    };

    performLogout();
  }, [logout]);

  // AuthContext navigates after the server confirms logout.
  return null;
};

export default LogoutPage;
