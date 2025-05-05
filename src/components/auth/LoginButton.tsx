import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { AUTH_CONFIG } from '../../config';

const LoginButton: React.FC = () => {
  const { isAuthenticated, isLoading, user, login, logout } = useAuth();

  // Function to check if auth token exists
  const checkAuthToken = (): string => {
    const token = sessionStorage.getItem(AUTH_CONFIG.TOKEN_KEY);
    
    if (token) {
      try {
        const tokenData = JSON.parse(atob(token));
        return `Token exists: ${tokenData.email ? tokenData.email.substring(0, 6) : ''}...`;
      } catch (e) {
        return 'Invalid token';
      }
    }
    return 'No auth token';
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
        <span className="text-xs text-gray-600 truncate max-w-[150px]" title={`${user.email} - ${checkAuthToken()}`}>
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
      <span className="text-xs text-gray-600 hidden sm:inline" title={checkAuthToken()}>
        {checkAuthToken()}
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