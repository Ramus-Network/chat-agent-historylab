# Backend Authentication Migration Guide

This document outlines the changes needed on the backend to support the new token-based authentication system.

## Overview

The authentication system has been updated from cookie-based to token-based using PKCE flow. The backend needs to:

1. Add new PKCE endpoints for initialization and callback
2. Update existing endpoints to accept tokens in the Authorization header
3. Maintain backward compatibility with cookie-based authentication
4. Implement JWT token generation and validation

## Required Backend Changes

### 1. New PKCE Endpoints

Two new endpoints need to be implemented:

#### a. PKCE Initialization Endpoint

```typescript
// POST /pkce/init
export async function handlePkceInit(request: Request, env: Env): Promise<Response> {
  // Parse request body
  const { state, codeVerifier } = await request.json();
  
  if (!state || !codeVerifier) {
    return new Response(JSON.stringify({ error: 'Missing state or codeVerifier' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Store the code verifier with the state as key (10 min TTL)
  await env.USERS.put(`pkce:${state}`, codeVerifier, { expirationTtl: 600 });
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
```

#### b. PKCE Callback Endpoint

```typescript
// GET /pkce/callback
export async function handlePkceCallback(request: Request, env: Env): Promise<Response> {
  // Get URL parameters
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  
  if (!code || !state) {
    return new Response('Missing code or state parameter', { status: 400 });
  }
  
  // Retrieve the code verifier from the state
  const codeVerifier = await env.USERS.get(`pkce:${state}`);
  if (!codeVerifier) {
    return new Response('Invalid or expired state', { status: 400 });
  }
  
  // Clean up the state entry
  await env.USERS.delete(`pkce:${state}`);
  
  // Exchange code for tokens
  const tokenParams = new URLSearchParams();
  tokenParams.set('client_id', env.OAUTH_CLIENT_ID);
  tokenParams.set('code_verifier', codeVerifier);
  tokenParams.set('code', code);
  tokenParams.set('redirect_uri', env.OAUTH_REDIRECT);
  tokenParams.set('grant_type', 'authorization_code');
  
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: tokenParams
  });
  
  const tokenData = await tokenResponse.json();
  
  if (!tokenData.id_token) {
    return new Response('Failed to get id_token', { status: 400 });
  }
  
  // Decode ID token (JWT)
  const payload = tokenData.id_token.split('.')[1];
  const decodedPayload = JSON.parse(
    atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
  );
  
  const googleId = decodedPayload.sub;
  const email = decodedPayload.email;
  
  // Check if user already exists
  let uuid = await env.USERS.get(`google:${googleId}`);
  let isNew = false;
  
  if (!uuid) {
    // First-time registration
    uuid = crypto.randomUUID();
    isNew = true;
    
    // Create mapping from Google ID to UUID
    await env.USERS.put(`google:${googleId}`, uuid);
    
    // Create minimal user record
    const user = {
      googleId,
      email,
      createdAt: Date.now(),
      profileComplete: false
    };
    
    await env.USERS.put(`user:${uuid}`, JSON.stringify(user));
  }
  
  // Create a JWT-like token (in production, use proper JWT signing)
  const hlToken = JSON.stringify({
    sub: googleId,
    email: email,
    uuid: uuid,
    exp: Math.floor(Date.now()/1000) + 60*60 // 1 hour expiry
  });
  
  // Base64 encode the token
  const encodedToken = btoa(hlToken);
  
  // Return HTML with postMessage
  const html = `
    <html><body>
      <script>
        // Send token to parent/opener window
        const message = { hl_id_token: '${encodedToken}' };
        
        // Try opener first (popup case)
        if (window.opener) {
          window.opener.postMessage(message, '*');
          window.close();
        } 
        // Try parent (iframe case)
        else if (window !== window.parent) {
          window.parent.postMessage(message, '*');
        }
        // Fallback for direct navigation
        else {
          sessionStorage.setItem('hl_id_token', '${encodedToken}');
          window.location.href = '/';
        }
      </script>
      Authentication successful! You can close this window.
    </body></html>
  `;
  
  return new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  });
}
```

### 2. Update Authentication Utility

Create a utility function to extract the token from the Authorization header:

```typescript
// src/server/utils/auth.ts
export async function authenticateRequest(request: Request, env: Env): Promise<string | null> {
  // First try to get token from Authorization header
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7); // Remove "Bearer " prefix
    try {
      // Decode and parse the token
      const tokenData = JSON.parse(atob(token));
      
      // Check if token is expired
      if (tokenData.exp && tokenData.exp < Date.now()/1000) {
        console.log('Token expired');
        return null;
      }
      
      return tokenData.uuid;
    } catch (e) {
      console.error('Invalid token format:', e);
      return null;
    }
  }
  
  // Fallback to cookie-based authentication
  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map(c => c.trim());
    const sessionCookie = cookies.find(c => c.startsWith('__hl_session='));
    if (sessionCookie) {
      return sessionCookie.split('=')[1];
    }
  }
  
  // Try query parameter as last resort
  const url = new URL(request.url);
  return url.searchParams.get('session');
}
```

### 3. Update API Endpoints

Update all protected API endpoints to use the new authentication utility:

```typescript
export async function handleProtectedEndpoint(request: Request, env: Env): Promise<Response> {
  // Authenticate the request
  const userId = await authenticateRequest(request, env);
  
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Proceed with the authenticated request
  // ...
}
```

### 4. Update Logout Handler

Update the logout handler to clear both tokens and cookies:

```typescript
export async function handleLogout(request: Request, env: Env): Promise<Response> {
  const redirect = new URL(request.url).searchParams.get('redirect_uri') || '/';
  
  // Return HTML that clears both token and cookie
  return new Response(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Logging out...</title>
    </head>
    <body>
      <p>Logging out...</p>
      <script>
        // Clear token from sessionStorage
        sessionStorage.removeItem('hl_id_token');
        
        // Clear cookie for backward compatibility
        document.cookie = "__hl_session=; path=/; max-age=0";
        
        // Redirect to specified URL
        window.location.href = "${redirect}";
      </script>
    </body>
    </html>
  `, {
    headers: {
      'Content-Type': 'text/html',
      // Also clear the cookie in HTTP header for non-JS clients
      'Set-Cookie': '__hl_session=; path=/; max-age=0'
    }
  });
}
```

## Testing the Implementation

To test that your backend changes are working correctly:

1. **PKCE Flow Test**:
   - Initialize PKCE flow with `fetch('/pkce/init', { method: 'POST', body: '{"state":"test","codeVerifier":"test"}' })`
   - Verify that the verifier is stored in KV
   - Simulate the callback with a mock OAuth response
   - Verify the token is generated correctly

2. **API Authentication Test**:
   - Create a test token with `btoa(JSON.stringify({sub: 'test', email: 'test@example.com', uuid: 'test-uuid', exp: Date.now()/1000 + 3600}))`
   - Make a request with `fetch('/api/user', { headers: { Authorization: 'Bearer ' + token } })`
   - Verify the request is authenticated

3. **Backward Compatibility Test**:
   - Make a request with a cookie: `fetch('/api/user', { headers: { Cookie: '__hl_session=test-uuid' } })`
   - Verify the request is still authenticated

## Migration Timeline

1. Deploy backend changes with support for both authentication methods
2. Update frontend to use the new token-based authentication
3. Monitor usage and errors
4. Eventually remove cookie-based authentication support once all clients have migrated 