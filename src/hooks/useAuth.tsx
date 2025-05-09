import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { AUTH_CONFIG } from '../config';

// Token storage key
export const AUTH_TOKEN_KEY = AUTH_CONFIG.TOKEN_KEY;

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

  const authUrl = AUTH_CONFIG.AUTH_URL;

  // Function to generate PKCE code verifier and challenge
  const generatePKCE = async () => {
    // Create a code verifier (random UUIDs)
    const codeVerifier = crypto.randomUUID() + crypto.randomUUID();
    
    // Create code challenge (SHA-256 hash of verifier)
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    
    // Base64url encode the challenge
    const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    return { codeVerifier, codeChallenge };
  };

  // Wrap checkAuth in useCallback
  const checkAuth = useCallback(async (): Promise<boolean> => {
    // If already checking auth, don't start another check
    if (isCheckingAuth.current) {
      // console.log('Auth check already in progress, skipping this request');
      return isAuthenticated;
    }

    // Check if we should throttle requests
    const now = Date.now();
    const timeSinceLastCheck = now - lastAuthCheck.current;
    // Allow check if not authenticated, even if throttled, to ensure login state propagates quickly
    if (!isAuthenticated && timeSinceLastCheck < AUTH_RETRY_DELAY && lastAuthCheck.current > 0) {
      // console.log(`Auth check throttled but allowing because user is not authenticated.`);
    } else if (isAuthenticated && timeSinceLastCheck < AUTH_RETRY_DELAY && lastAuthCheck.current > 0) {
      // console.log(`Auth check throttled (${timeSinceLastCheck}ms < ${AUTH_RETRY_DELAY}ms), reusing previous state:`, isAuthenticated);
      return isAuthenticated; // Only return early if already authenticated and throttled
    }

    // Mark that we're starting a check and update last check time
    isCheckingAuth.current = true;
    lastAuthCheck.current = now;
    
    try {
      setIsLoading(true);
      
      // Check for token in URL (used in mobile redirect flow)
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token');
      
      if (urlToken) {
        console.log('Found token in URL parameters');
        localStorage.setItem(AUTH_TOKEN_KEY, urlToken);
        
        // Clean the URL by removing the token parameter
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('token');
        window.history.replaceState({}, document.title, cleanUrl.toString());
      }
      
      // Get token from localStorage or sessionStorage
      let token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) {
        token = sessionStorage.getItem(AUTH_TOKEN_KEY);
        if (token) {
          // Move to localStorage for consistency and to trigger storage events for other tabs
          localStorage.setItem(AUTH_TOKEN_KEY, token);
          sessionStorage.removeItem(AUTH_TOKEN_KEY); // Clean up from session
        }
      }
      
      if (!token) {
        // console.log('No auth token found in localStorage or sessionStorage');
        setUser(null);
        setIsAuthenticated(false);
        // No need to return here, finally block handles loading/checking state
      } else {
        // console.log('Auth token found in localStorage or sessionStorage');
        
        // Verify token with the server
        const response = await fetch(`${authUrl}/user`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
  
        // console.log('Auth check response status:', response.status);
        
        if (response.ok) {
          const userData = await response.json() as User;
          // console.log('User authenticated successfully:', userData.email);
          setUser(userData);
          setIsAuthenticated(true);
          return true;
        } else {
          // console.log('Authentication failed:', response.status, response.statusText);
          
          // If token is invalid, clear it
          localStorage.removeItem(AUTH_TOKEN_KEY);
          
          setUser(null);
          setIsAuthenticated(false);
          return false;
        }
      }
    } catch (error) {
      console.error('Authentication check failed with exception:', error);
      
      // Don't clear token on network errors
      setUser(null);
      setIsAuthenticated(false);
      return false;
    } finally {
      setIsLoading(false);
      isCheckingAuth.current = false;
    }
    // Added explicit return false if token check was skipped
    return false; 
  // Add dependencies for useCallback
  }, [isAuthenticated, authUrl, setIsLoading, setUser, setIsAuthenticated]); 

  const login = useCallback(async () => { // Also wrap login in useCallback
    try {
      // 1. Generate PKCE verifier and challenge
      const { codeVerifier, codeChallenge } = await generatePKCE();
      
      // 2. Generate state
      const state = crypto.randomUUID();
      
      // 3. Store the verifier on the server
      const initResponse = await fetch(`${authUrl}/pkce/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          state, 
          codeVerifier,
          returnUrl: window.location.href // Tell the server where to return after auth
        })
      });
      
      if (!initResponse.ok) {
        throw new Error('Failed to initialize authentication');
      }
      
      // 4. Build the authorization URL
      const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authorizationUrl.searchParams.set('client_id', AUTH_CONFIG.CLIENT_ID);
      authorizationUrl.searchParams.set('response_type', 'code');
      authorizationUrl.searchParams.set('scope', AUTH_CONFIG.SCOPES);
      authorizationUrl.searchParams.set('redirect_uri', AUTH_CONFIG.REDIRECT_URI);
      authorizationUrl.searchParams.set('code_challenge_method', 'S256');
      authorizationUrl.searchParams.set('code_challenge', codeChallenge);
      authorizationUrl.searchParams.set('state', state);
      
      // 5. Open popup for auth or redirect for mobile
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (isMobile) {
        // Mobile: Redirect flow
        const currentUrl = window.location.href;
        localStorage.setItem('authRedirectReturnPath', currentUrl);
        
        // For mobile, explicitly add the return_url parameter to the auth URL
        authorizationUrl.searchParams.set('return_url', currentUrl);
        window.location.href = authorizationUrl.toString();
      } else {
        // Desktop: Popup flow
        const popup = window.open(authorizationUrl.toString(), '_blank', 'width=500,height=600');
        
        if (popup) {
          // 6. Set up window message listener to receive token
          const messageHandler = (event: MessageEvent) => {
            // Check origin for security
            if (event.origin !== authUrl) { 
              console.warn(`Received message from unexpected origin: ${event.origin}`);
              return;
            }
            // Check if this is our token message
            if (event.data && event.data.hl_id_token) {
              // console.log('Received token via postMessage');
              // Store the token in localStorage directly
              localStorage.setItem(AUTH_TOKEN_KEY, event.data.hl_id_token);
              
              // Remove listener and close popup
              window.removeEventListener('message', messageHandler);
              if (popup && !popup.closed) {
                popup.close();
              }
              
              // Refresh authentication state immediately
              // console.log('Triggering auth check after postMessage');
              checkAuth(); 
            }
          };
          window.addEventListener('message', messageHandler);

          // Optional: Monitor popup closure to remove listener if user closes it manually
          const popupTimer = setInterval(() => {
            if (popup.closed) {
              clearInterval(popupTimer);
              window.removeEventListener('message', messageHandler);
            }
          }, 500);

        } else {
          console.error('Failed to open popup. Please ensure popups are not blocked.');
          // Fallback: could attempt redirect for desktop if popup fails
          // localStorage.setItem('authRedirectReturnPath', window.location.href);
          // window.location.href = authorizationUrl.toString();
        }
      }
    } catch (err) {
      console.error('Error starting login process:', err);
    }
  // Add checkAuth and authUrl as dependencies
  }, [checkAuth, authUrl]); 

  const logout = useCallback(() => { // Also wrap logout in useCallback
    // Clear token from localStorage
    localStorage.removeItem(AUTH_TOKEN_KEY);
    
    // Update state
    setUser(null);
    setIsAuthenticated(false);
    
    // Redirect to logout URL
    const currentUrl = window.location.origin;
    const logoutUrl = `${authUrl}/logout?redirect_uri=${encodeURIComponent(currentUrl)}`;
    window.location.href = logoutUrl;
  // Add authUrl as dependency
  }, [authUrl, setUser, setIsAuthenticated]); 

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
    // console.log('AuthProvider mounted, checking initial authentication');
    checkAuth();
  }, []);

  // Check for token in URL when app first loads or when URL changes
  useEffect(() => {
    const handleURLChange = () => {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('token')) {
        console.log('Auth token found in URL, triggering auth check...');
        checkAuth();
      }
    };

    // Check immediately when component mounts
    handleURLChange();

    // Also listen to changes in URL (popstate events)
    window.addEventListener('popstate', handleURLChange);
    return () => {
      window.removeEventListener('popstate', handleURLChange);
    };
  }, [checkAuth]);

  // Listen for storage events to detect token changes from other tabs/windows
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === AUTH_TOKEN_KEY) {
        // console.log('Auth token changed in localStorage (storage event), re-checking auth...');
        checkAuth();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [checkAuth]); // Add checkAuth dependency

  // Set up token refresh before expiration
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;
    
    try {
      const tokenData = JSON.parse(atob(token));
      if (!tokenData.exp) return;
      
      const expiryTime = tokenData.exp * 1000;
      const now = Date.now();
      
      if (expiryTime <= now) {
        console.log('Token expired, logging out');
        logout(); // Use memoized logout
        return;
      }
      
      const refreshTime = Math.max(0, expiryTime - now - AUTH_CONFIG.REFRESH_BUFFER);
      // console.log(`Scheduling token refresh in ${Math.floor(refreshTime / 1000)} seconds`);
      
      const refreshTimer = setTimeout(() => {
        console.log('Token refresh timer triggered for silent refresh attempt');
        login(); // Use memoized login for silent refresh
      }, refreshTime);
      
      return () => clearTimeout(refreshTimer);
    } catch (e) {
      console.error('Error parsing token for refresh:', e);
    }
  // Add login and logout as dependencies
  }, [isAuthenticated, login, logout]); 

  // Effect to handle redirecting back after mobile authentication
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      const returnPath = localStorage.getItem('authRedirectReturnPath');
      if (returnPath) {
        console.log('Authentication successful after redirect, returning to:', returnPath);
        localStorage.removeItem('authRedirectReturnPath');
        // Ensure we are not redirecting to the exact same page 
        // if already there (e.g. after a refresh on the returnPath itself)
        if (window.location.href !== returnPath) {
          window.location.href = returnPath;
        }
      }
    }
  }, [isLoading, isAuthenticated]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        login, // Pass memoized login
        logout, // Pass memoized logout
        checkAuth // Pass memoized checkAuth
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