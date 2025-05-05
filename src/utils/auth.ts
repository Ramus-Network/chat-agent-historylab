import { AUTH_CONFIG } from '../config';

/**
 * Parse the JWT token from sessionStorage
 * @returns Parsed token data or null if no valid token exists
 */
export function parseAuthToken(): { uuid?: string; email?: string; exp?: number } | null {
  try {
    const token = sessionStorage.getItem(AUTH_CONFIG.TOKEN_KEY);
    if (!token) return null;
    
    // Decode the base64 token
    const tokenData = JSON.parse(atob(token));
    return tokenData;
  } catch (e) {
    console.error('Error parsing auth token:', e);
    return null;
  }
}

/**
 * Check if the current token is expired
 * @returns True if token is expired or invalid, false otherwise
 */
export function isTokenExpired(): boolean {
  const tokenData = parseAuthToken();
  if (!tokenData || !tokenData.exp) return true;
  
  const expiryTime = tokenData.exp * 1000; // Convert to milliseconds
  return Date.now() >= expiryTime;
}

/**
 * Get the authorization header value for API requests
 * @returns The Authorization header value or null if no valid token exists
 */
export function getAuthHeader(): { Authorization: string } | null {
  const token = sessionStorage.getItem(AUTH_CONFIG.TOKEN_KEY);
  if (!token) return null;
  
  return { Authorization: `Bearer ${token}` };
}

/**
 * Attach the auth token to fetch requests
 * @param options Fetch options to enhance with auth
 * @returns Enhanced fetch options with auth headers if available
 */
export function withAuth(options: RequestInit = {}): RequestInit {
  const authHeader = getAuthHeader();
  if (!authHeader) return options;
  
  return {
    ...options,
    headers: {
      ...options.headers,
      ...authHeader
    }
  };
} 