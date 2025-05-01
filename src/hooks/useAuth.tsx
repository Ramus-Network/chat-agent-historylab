import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

// Export the auth cookie name for use in other modules
export const AUTH_COOKIE_NAME = '__hl_session';

// Retry delay for failed auth checks (in milliseconds)
const AUTH_RETRY_DELAY = 10000; // 10 seconds

interface User {
  email: string;
  name?: string;
  institution?: string;
  position?: string;
  profileComplete: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // References to prevent multiple simultaneous auth checks
  const isCheckingAuth = useRef(false);
  const lastAuthCheck = useRef<number>(0);
  const authRetryTimeout = useRef<NodeJS.Timeout | null>(null);

  const authUrl = 'https://auth.ramus.network';

  const login = () => {
    // Get the current app URL for the redirect
    const currentUrl = window.location.origin;
    const callbackUrl = `${currentUrl}/auth-callback`;
    
    // Build the login URL with redirect parameter
    const loginUrl = `${authUrl}/login?redirect_uri=${encodeURIComponent(callbackUrl)}`;
    
    console.log('Initiating login redirect to:', loginUrl);
    window.location.href = loginUrl;
  };

  const logout = () => {
    // Get the current app URL for the redirect
    const currentUrl = window.location.origin;
    
    // Build the logout URL with redirect parameter
    const logoutUrl = `${authUrl}/logout?redirect_uri=${encodeURIComponent(currentUrl)}`;
    
    console.log('Initiating logout redirect to:', logoutUrl);
    
    // Clear the local cookie too when logging out
    document.cookie = `${AUTH_COOKIE_NAME}=; path=/; max-age=0`;
    
    window.location.href = logoutUrl;
  };

  const checkAuth = async (): Promise<boolean> => {
    // If already checking auth, don't start another check
    if (isCheckingAuth.current) {
      console.log('Auth check already in progress, skipping this request');
      return isAuthenticated;
    }

    // Check if we should throttle requests
    const now = Date.now();
    const timeSinceLastCheck = now - lastAuthCheck.current;
    if (timeSinceLastCheck < AUTH_RETRY_DELAY && lastAuthCheck.current > 0) {
      console.log(`Auth check throttled (${timeSinceLastCheck}ms < ${AUTH_RETRY_DELAY}ms), reusing previous state:`, isAuthenticated);
      return isAuthenticated;
    }

    // Mark that we're starting a check and update last check time
    isCheckingAuth.current = true;
    lastAuthCheck.current = now;
    
    try {
      setIsLoading(true);
      
      // Log all cookies for debugging
      console.log('Cookies before auth check:', document.cookie);
      
      // First, check for local cookie before making a network request
      const cookies = document.cookie.split(';').map(c => c.trim());
      const authCookie = cookies.find(c => c.startsWith(`${AUTH_COOKIE_NAME}=`));
      
      if (!authCookie) {
        console.log('No auth cookie found, skipping auth check');
        setUser(null);
        setIsAuthenticated(false);
        setIsLoading(false);
        isCheckingAuth.current = false;
        return false;
      }
      
      console.log('Auth cookie found:', authCookie);
      
      // Get the session value from the cookie
      const sessionId = authCookie.split('=')[1];
      
      // At this point we have a local cookie, let's try to verify it with the auth server
      // Use the session in the URL for more reliable cross-domain transfer
      console.log('Making auth check request with session in URL. making request to:', `${authUrl}/auth?session=${sessionId}`);
      const response = await fetch(`${authUrl}/auth?session=${sessionId}`, {
        credentials: 'include', // Still include cookies as backup
        headers: {
          'Accept': 'application/json'
        }
      });

      console.log('Auth check response status:', response.status);
      
      if (response.ok) {
        const userData = await response.json() as User;
        console.log('User authenticated successfully:', userData.email);
        setUser(userData);
        setIsAuthenticated(true);
        return true;
      } else {
        console.log('Authentication failed:', response.status, response.statusText);
        
        // If we get a 401, try to read the response body for more details
        if (response.status === 401) {
          try {
            const errorData = await response.text();
            console.log('Auth error details:', errorData);
          } catch (e) {
            console.log('Could not read error response');
          }
        }
        
        // If we received a 401 but we have a local cookie, let's use that as a fallback
        // This allows the app to work offline or when the auth server is down
        if (response.status === 401 && authCookie) {
          console.log('Auth server returned 401 but we have a local cookie. Using minimal authentication.');
          
          // Extract UUID from cookie for minimal user identification
          const uuid = authCookie.split('=')[1];
          
          // Create a minimal user profile
          const minimalUser: User = {
            email: `user-${uuid.substring(0, 8)}`,
            profileComplete: true
          };
          
          setUser(minimalUser);
          setIsAuthenticated(true);
          return true;
        }
        
        setUser(null);
        setIsAuthenticated(false);
        return false;
      }
    } catch (error) {
      console.error('Authentication check failed with exception:', error);
      
      // Even if network request failed, if we have a cookie, consider the user authenticated
      // This is a fallback for offline mode or when auth server is unreachable
      const cookies = document.cookie.split(';').map(c => c.trim());
      const authCookie = cookies.find(c => c.startsWith(`${AUTH_COOKIE_NAME}=`));
      
      if (authCookie) {
        console.log('Network request failed but found local auth cookie. Using minimal authentication.');
        
        // Extract UUID from cookie for minimal user identification
        const uuid = authCookie.split('=')[1];
        
        // Create a minimal user profile
        const minimalUser: User = {
          email: `user-${uuid.substring(0, 8)}`,
          profileComplete: true
        };
        
        setUser(minimalUser);
        setIsAuthenticated(true);
        return true;
      }
      
      setUser(null);
      setIsAuthenticated(false);
      return false;
    } finally {
      setIsLoading(false);
      isCheckingAuth.current = false;
    }
  };

  // Clear any pending retry on unmount
  useEffect(() => {
    return () => {
      if (authRetryTimeout.current) {
        clearTimeout(authRetryTimeout.current);
        authRetryTimeout.current = null;
      }
    };
  }, []);

  // Check authentication status on mount - only once
  useEffect(() => {
    console.log('AuthProvider mounted, checking initial authentication');
    checkAuth();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        login,
        logout,
        checkAuth
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 