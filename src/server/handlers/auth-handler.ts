// auth-handler.ts
// Handler for authentication callbacks

import type { Env } from "../types";
import { AUTH_CONFIG } from "../../config";

/**
 * Handles the authentication callback from the auth service
 * This sets the token in sessionStorage and redirects to the homepage
 */
export async function handleAuthCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const session = url.searchParams.get('session');
  const token = url.searchParams.get('token');

  if (!session && !token) {
    return new Response('Missing session or token parameter', { 
      status: 400,
      headers: {
        'Content-Type': 'text/html'
      }
    });
  }

  // Create HTML with script to set token and redirect
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Authentication Complete</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background-color: #f5f5f5;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
        }
        .container {
          background-color: white;
          padding: 2rem;
          border-radius: 8px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          text-align: center;
          max-width: 400px;
        }
        h1 {
          color: #333;
          margin-top: 0;
        }
        p {
          color: #666;
          margin-bottom: 1.5rem;
        }
        .spinner {
          display: inline-block;
          width: 40px;
          height: 40px;
          border: 4px solid rgba(0,0,0,0.1);
          border-radius: 50%;
          border-top-color: #6CA0D6;
          animation: spin 1s ease-in-out infinite;
          margin-bottom: 1rem;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="spinner"></div>
        <h1>Authentication Successful</h1>
        <p>You are being redirected to the application...</p>
      </div>
      <script>
        // Set both token and cookie for backward compatibility
        ${token ? `
        // Primary method: Store token in sessionStorage
        sessionStorage.setItem("${AUTH_CONFIG.TOKEN_KEY}", "${token}");
        console.log("Auth token set in sessionStorage");
        ` : ''}
        
        ${session ? `
        // Legacy/fallback method: Set cookie
        document.cookie = "__hl_session=${session}; path=/; max-age=2592000; SameSite=Lax";
        console.log("Auth cookie set as fallback");
        ` : ''}
        
        // Remove parameters from URL for security
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('session');
        cleanUrl.searchParams.delete('token');
        window.history.replaceState({}, document.title, '/');
        
        // Redirect to homepage after a brief delay
        setTimeout(() => {
          window.location.href = '/';
        }, 1000);
      </script>
    </body>
    </html>
  `;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html'
    }
  });
} 