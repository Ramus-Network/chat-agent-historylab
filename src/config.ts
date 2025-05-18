/**
 * Application configuration
 */

// Auth configuration
export const AUTH_CONFIG = {
  // OAuth client ID for Google authentication
  CLIENT_ID: '359213098644-b1lmm80b8rep4j4jd5438in6l6ganamv.apps.googleusercontent.com',
  
  // Auth service URL
  // AUTH_URL: 'https://auth.ramus.network',
  AUTH_URL: 'https://auth-login-2.nchimicles.workers.dev',
  
  // OAuth redirect URL
  // REDIRECT_URI: 'https://auth.ramus.network/pkce/callback',
  REDIRECT_URI: 'https://auth-login-2.nchimicles.workers.dev/pkce/callback',
  
  // OAuth scopes
  SCOPES: 'openid email profile',
  
  // Token storage key
  TOKEN_KEY: 'hl_id_token',
  
  // Token refresh buffer (in milliseconds) - 5 minutes
  REFRESH_BUFFER: 5 * 60 * 1000
};

// API Configuration
export const API_CONFIG = {
  // Base URL for API requests
  BASE_URL: process.env.API_URL || 'https://history-lab-chat-agent.nchimicles.workers.dev',
  
  // Points system API URL
  POINTS_API_URL: 'https://stripe-payment-app.nchimicles.workers.dev',
  
  // Number of search results to return
  SEARCH_RESULTS_LIMIT: 5
};

// Export default config
export default {
  auth: AUTH_CONFIG,
  api: API_CONFIG
}; 