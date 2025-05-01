// server/index.ts
// Main server entry point that routes incoming requests

import { type Env } from "./types";
import { logError } from "../shared";
import { handleFeedback } from "./handlers/feedback-handler";
import { handleDocumentClick } from "./handlers/document-handler";
import { handleAuthCallback } from "./handlers/auth-handler";
import { routeAgentRequest } from "agents-sdk";

/**
 * Main worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // Simple health check endpoint
    if (url.pathname === "/ping") {
      return new Response("pong", { status: 200 });
    }

    if (url.pathname === "/feedback") {
      return handleFeedback(request, env);
    }

    if (url.pathname === "/document-click") {
      return handleDocumentClick(request, env);
    }

    // Handle authentication callback
    if (url.pathname === "/auth-callback") {
      return handleAuthCallback(request, env);
    }

    return (
        // Route the request to our agent or return 404 if not found
        (await routeAgentRequest(request, env)) ||
        new Response("Not found", { status: 404 })
    );
  },
};

// Re-export Chat class for use in wrangler.toml as agent
export { Chat } from "./models/chat"; 