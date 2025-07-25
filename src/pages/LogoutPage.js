import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';

const LogoutPage = ({ lang = 'en' }) => {
  const { logout } = useAuth();

  useEffect(() => {
    logout();
  }, [logout]);

  // Redirect to signin page after logout
  return <Navigate to={`/${lang}/signin`} replace />;
};

export default LogoutPage;
