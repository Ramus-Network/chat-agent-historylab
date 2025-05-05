# Token-Based Authentication System

This document explains the token-based authentication system implemented in the HistoryLab Chat application.

## Overview

The authentication system has been updated from cookie-based auth to a PKCE-based token authentication system to solve cross-domain authentication issues, particularly for iframe embedding scenarios. This approach eliminates the need for third-party cookies.

## How It Works

1. **PKCE Authentication Flow**:
   - The client generates a code verifier and code challenge (SHA-256 hash of verifier)
   - The client requests authorization from Google, passing the code challenge
   - Google returns a code to the callback endpoint on our auth server
   - The auth server exchanges the code + verifier for tokens, creates a session token
   - The token is passed back to the client via postMessage and stored in sessionStorage

2. **Token Format**:
   - The token is a Base64-encoded JSON object containing:
     - `sub`: Google user ID
     - `email`: User's email address 
     - `uuid`: Internal user identifier
     - `exp`: Token expiration timestamp (Unix timestamp)

3. **Token Usage**:
   - The token is stored in sessionStorage under the key `hl_id_token`
   - For API requests, the token is included in the Authorization header as a Bearer token
   - The Authentication provider handles token expiration and refresh

## Key Components

### 1. Authentication Hook (`useAuth.tsx`)

The `useAuth` hook provides authentication context throughout the application:

```tsx
const { user, isLoading, isAuthenticated, login, logout, checkAuth } = useAuth();
```

- `user`: The authenticated user information
- `isLoading`: Whether auth state is being loaded
- `isAuthenticated`: Whether the user is authenticated
- `login()`: Initiates the PKCE login flow
- `logout()`: Logs the user out
- `checkAuth()`: Verifies authentication with the server

### 2. Auth Utilities (`auth.ts`)

Helper functions for working with authentication tokens:

```tsx
import { parseAuthToken, isTokenExpired, getAuthHeader, withAuth } from '../utils/auth';

// Add auth headers to a fetch request
fetch('/api/data', withAuth({
  method: 'POST',
  body: JSON.stringify(data)
}));
```

### 3. Conversation Hook (`useConversation.ts`)

Manages conversation state and integrates with authentication:

```tsx
const { userId, conversationId, createNewConversation } = useConversation();
```

- `userId`: The user's ID (from token when authenticated)
- `conversationId`: Current conversation ID
- `createNewConversation()`: Creates a new conversation

## Implementation Details

1. **Login Process**:
   - User clicks "Login" button
   - `login()` function generates PKCE parameters and opens a popup to Google auth
   - On successful auth, token is stored in sessionStorage
   - The application state updates to reflect authenticated status

2. **API Authentication**:
   - The token is attached to API requests in the Authorization header
   - Backend validates the token for each request
   - If token is invalid or expired, user is redirected to login

3. **Token Refresh**:
   - Authentication provider monitors token expiration
   - Before expiration, silent refresh is attempted
   - If refresh fails, user is logged out

## Migration Path

The system supports backward compatibility with the previous cookie-based authentication:

- Checks for tokens in sessionStorage first
- Falls back to checking for cookies
- Auth server supports both token and cookie authentication

## Usage Examples

### Authentication Check

```tsx
import { useAuth } from '../hooks/useAuth';

function ProtectedComponent() {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return <LoginPrompt />;
  
  return <YourProtectedContent />;
}
```

### Making Authenticated API Requests

```tsx
import { withAuth } from '../utils/auth';

async function fetchUserData() {
  const response = await fetch('/api/user-data', withAuth());
  if (response.ok) {
    return response.json();
  }
  throw new Error('Failed to fetch user data');
}
```

### Adding Auth Headers to Metadata

```tsx
import { AUTH_TOKEN_KEY } from '../hooks/useAuth';

// When preparing metadata for API calls
const metadata = {
  // Other metadata...
};

// Add JWT token from sessionStorage to headers if available
const token = sessionStorage.getItem(AUTH_TOKEN_KEY);
if (token) {
  metadata.headers = {
    Authorization: `Bearer ${token}`
  };
}
``` 