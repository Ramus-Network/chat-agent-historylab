// handlers/document-handler.ts
// Handlers for document-related endpoints

import { type Env } from "../types";
import { decodeHashedComponents } from "../utils/hash-utils";
import { corsHeaders } from "../middleware/cors";
import { logError, logInfo } from "../../shared";

/**
 * Handles document click tracking
 * @param request The incoming request
 * @param env The environment variables
 * @returns A Response object
 */
export async function handleDocumentClick(request: Request, env: Env): Promise<Response> {
  try {
    const { conversationId, r2Key } = await request.json() as { 
      conversationId: string, 
      r2Key: string
    };
    
    if (!conversationId || !r2Key) {
      logInfo("handleDocumentClick", "Missing required fields in document click request", { conversationId, r2Key });
      return new Response(JSON.stringify({ error: "Missing required fields: conversationId, r2Key" }), { 
        status: 400, 
        headers: corsHeaders() 
      });
    }

    // Decode conversation components
    const { userId, collectionId, convoId } = decodeHashedComponents(conversationId);
    const logId = `${userId}-${collectionId}-${convoId}`;

    // Retrieve the conversation log
    const logString = await env.CONVERSATION_LOGS.get(logId);
    if (!logString) {
      logError("handleDocumentClick", "Conversation log not found", null, { logId });
      return new Response(JSON.stringify({ error: "Conversation log not found" }), { 
        status: 404, 
        headers: corsHeaders() 
      });
    }

    const log = JSON.parse(logString);

    // Create the document click entry with just r2Key and timestamp
    const clickEntry = {
      r2Key,
      timestamp: new Date().toISOString()
    };

    // Add the document click to the log
    if (!log.documentClicks) {
      log.documentClicks = [];
    }
    log.documentClicks.push(clickEntry);

    // Update timestamp and save
    log.updatedAt = new Date().toISOString();
    await env.CONVERSATION_LOGS.put(logId, JSON.stringify(log));

    logInfo("handleDocumentClick", "Document click recorded successfully", { 
      logId, 
      r2Key
    });
    
    return new Response(JSON.stringify({ success: true }), { 
      status: 200, 
      headers: corsHeaders() 
    });
  } catch (error) {
    logError("handleDocumentClick", "Error processing document click request", error);
    let errorMessage = "Internal server error";
    if (error instanceof SyntaxError) {
      errorMessage = "Invalid JSON payload";
      return new Response(JSON.stringify({ error: errorMessage }), { 
        status: 400, 
        headers: corsHeaders() 
      });
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    return new Response(JSON.stringify({ error: errorMessage }), { 
      status: 500, 
      headers: corsHeaders() 
    });
  }
} 