import React from 'react';
import { useAuth, AUTH_COOKIE_NAME } from '../../hooks/useAuth';

const LoginButton: React.FC = () => {
  const { isAuthenticated, isLoading, user, login, logout } = useAuth();

  // Function to check if auth cookie exists
  const checkAuthCookie = (): string => {
    const cookies = document.cookie.split(';').map(cookie => cookie.trim());
    const authCookie = cookies.find(cookie => cookie.startsWith(`${AUTH_COOKIE_NAME}=`));
    
    if (authCookie) {
      const value = authCookie.split('=')[1];
      return `Cookie exists: ${value.substring(0, 6)}...`;
    }
    return 'No auth cookie';
  };

  if (isLoading) {
    return (
      <button disabled className="inline-flex h-8 items-center justify-center text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed bg-[#6CA0D6] text-white px-3 py-1 rounded-md opacity-90 transition-opacity hover:opacity-100">
        Loading...
      </button>
    );
  }

  if (isAuthenticated && user) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-600 truncate max-w-[150px]" title={`${user.email} - ${checkAuthCookie()}`}>
          {user.email}
        </span>
        <button
          onClick={logout}
          className="inline-flex h-8 items-center justify-center text-sm font-medium bg-gray-200 text-gray-800 px-3 py-1 rounded-md hover:bg-gray-300 transition-colors"
        >
          Logout
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-600 hidden sm:inline" title={checkAuthCookie()}>
        {checkAuthCookie()}
      </span>
      <button
        onClick={login}
        className="inline-flex h-8 items-center justify-center text-sm font-medium bg-[#6CA0D6] text-white px-3 py-1 rounded-md opacity-90 transition-opacity hover:opacity-100"
      >
        Login
      </button>
    </div>
  );
};

export default LoginButton; 