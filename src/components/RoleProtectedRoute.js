import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';
import AuthService from '../services/AuthService.js';

// Basic authentication protection
export const ProtectedRoute = ({ children, lang = 'en' }) => {
  const location = useLocation();
  const { currentUser, loading } = useAuth();
  
  if (loading) {
    return null; // or a loading spinner component
  }
  
  // Also block if token is expired even when currentUser is present
  if (!currentUser || AuthService.isTokenExpired()) {
    // Redirect to signin page with return url
    return <Navigate to={`/${lang}/signin`} state={{ from: location }} replace />;
  }

  return children;
};

// Role-based route protection
export const RoleProtectedRoute = ({ 
  children, 
  roles = [], // Array of allowed roles
  lang = 'en',
  redirectTo = null // Custom redirect path
}) => {
  const location = useLocation();
  const { currentUser, loading, getDefaultRouteForRole } = useAuth();
  
  // If still loading, don't redirect yet
  if (loading) {
    return null; // or a loading spinner component
  }
  
  // First check authentication
  if (!currentUser || AuthService.isTokenExpired()) {
    return <Navigate to={`/${lang}/signin`} state={{ from: location }} replace />;
  }
    // If roles are specified, check if user has one of them
  if (roles.length > 0 && !roles.includes(currentUser.role)) {
    // Redirect to custom path or the default route for user's role
    return <Navigate to={redirectTo || getDefaultRouteForRole(currentUser.role, lang)} replace />;
  }
  
  // User is authenticated and has proper role
  return children;
};

// Admin-only route
export const AdminRoute = ({ children, lang = 'en', redirectTo = null }) => {
  return (
    <RoleProtectedRoute roles={['admin']} lang={lang} redirectTo={redirectTo}>
      {children}
    </RoleProtectedRoute>
  );
};

// Partner-only route
export const PartnerRoute = ({ children, lang = 'en', redirectTo = null }) => {
  return (
    <RoleProtectedRoute roles={['partner']} lang={lang} redirectTo={redirectTo}>
      {children}
    </RoleProtectedRoute>
  );
};

// Higher-Order Components (HOCs)

/**
 * HOC that protects a component with basic authentication
 * Usage: export default withProtection(MyComponent)
 */
export const withProtection = (Component) => {
  const ProtectedComponent = (props) => {
    const { lang = 'en', ...restProps } = props;
    
    return (
      <ProtectedRoute lang={lang}>
        <Component {...restProps} lang={lang} />
      </ProtectedRoute>
    );
  };
  
  // Set display name for debugging and React DevTools
  ProtectedComponent.displayName = `withProtection(${Component.displayName || Component.name || 'Component'})`;
  
  return ProtectedComponent;
};

/**
 * HOC that protects a component with role-based authentication
 * Usage: export default withRoleProtection(['admin'], { redirectTo: '/home' })(MyComponent)
 */
export const withRoleProtection = (roles = [], options = {}) => {
  return (Component) => {    const RoleProtectedComponent = (props) => {
      const { lang = 'en', ...restProps } = props;
      const { currentUser, getDefaultRouteForRole } = useAuth();
      
      // If user is not authenticated or doesn't have required role
      if (!currentUser || (roles.length > 0 && !roles.includes(currentUser.role))) {
        return (
          <RoleProtectedRoute 
            roles={roles} 
            lang={lang} 
            redirectTo={options.redirectTo || (currentUser ? getDefaultRouteForRole(currentUser.role, lang) : undefined)}
          >
            <Component {...restProps} lang={lang} />
          </RoleProtectedRoute>
        );
      }
      
      // User is authenticated and has proper role
      return <Component {...restProps} lang={lang} />;
    };
    
    // Set display name for debugging and React DevTools
    const roleNames = roles.join(',');
    RoleProtectedComponent.displayName = `withRoleProtection(${roleNames})(${Component.displayName || Component.name || 'Component'})`;
    
    return RoleProtectedComponent;
  };
};

/**
 * HOC that protects a component for admin users only
 * Usage: export default withAdminProtection()(MyComponent)
 */
export const withAdminProtection = (redirectTo = null) => {
  return (Component) => {
    const AdminProtectedComponent = withRoleProtection(['admin'], redirectTo)(Component);
    AdminProtectedComponent.displayName = `withAdminProtection(${Component.displayName || Component.name || 'Component'})`;
    return AdminProtectedComponent;
  };
};

/**
 * HOC that protects a component for partner users only
 * Usage: export default withPartnerProtection()(MyComponent)
 */
export const withPartnerProtection = (redirectTo = null) => {
  return (Component) => {
    const PartnerProtectedComponent = withRoleProtection(['partner'], redirectTo)(Component);
    PartnerProtectedComponent.displayName = `withPartnerProtection(${Component.displayName || Component.name || 'Component'})`;
    return PartnerProtectedComponent;
  };
};

export default ProtectedRoute;
