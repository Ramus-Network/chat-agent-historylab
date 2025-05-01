# History Lab AI Server

This folder contains the modular implementation of the History Lab AI server. It's organized into a structured format to improve maintainability, readability, and extensibility.

## Folder Structure

- `index.ts` - Main entry point that routes incoming requests
- `types.ts` - Type definitions used across the server
- `config.ts` - Configuration values and settings 

### `/models`
- `chat.ts` - The Chat agent implementation that handles AI chat interactions

### `/handlers`
- `agent-handler.ts` - Handler for agent-related requests
- `feedback-handler.ts` - Handler for feedback endpoint
- `document-handler.ts` - Handler for document click tracking

### `/middleware`
- `cors.ts` - CORS-related middleware for handling cross-origin requests

### `/utils`
- `hash-utils.ts` - Utilities for working with hashed conversation components
- `tool-utils.ts` - Utilities for processing tool calls

## Key Features

1. **Modular Design** - Code is broken down into logical modules for better organization and maintainability
2. **Robust Error Handling** - Each endpoint includes proper error catching and response formatting
3. **CORS Support** - Consistent CORS headers across all endpoints
4. **Logging System** - Structured logging with different levels (debug, info, error) for better debugging
5. **Type Safety** - Comprehensive TypeScript type definitions for all components

## Usage

The server exports the `Chat` class and default handler from `src/server/index.ts`, which is then imported by the main `server.ts` file for backwards compatibility.

```typescript
// server.ts
export { default } from "./server/index";
export { Chat } from "./server/models/chat";
export * from "./server/types";
```

## Error Handling

Each handler implements comprehensive error handling:

1. Input validation with appropriate error responses
2. Try/catch blocks around all async operations
3. Proper error logging with context information
4. User-friendly error messages in responses

## CORS Support

CORS headers are consistently applied across all endpoints through the middleware utilities:

- `corsHeaders()` - Returns standard CORS headers
- `handleOptions()` - Handles OPTIONS requests for preflight
- `applyCorsToPesponse()` - Applies CORS headers to existing Response objects 