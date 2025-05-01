// handlers/feedback-handler.ts
// Handlers for feedback-related endpoints

import { type Env } from "../types";
import { decodeHashedComponents } from "../utils/hash-utils";
import { corsHeaders } from "../middleware/cors";
import { logError, logInfo } from "../../shared";

/**
 * Handles the feedback endpoint for recording user feedback on messages
 * @param request The incoming request object
 * @param env The environment variables
 * @returns A Response object
 */
export async function handleFeedback(request: Request, env: Env): Promise<Response> {
  try {
    const { conversationId, messageId, messageIndex, feedback } = await request.json() as { 
      conversationId: string, 
      messageId?: string, 
      messageIndex?: number,
      feedback: 'like' | 'dislike' | null 
    };
    
    if (!conversationId || (messageId === undefined && messageIndex === undefined) || feedback === undefined) {
      logInfo("handleFeedback", "Missing required fields in feedback request", { conversationId, messageId, messageIndex, feedback });
      return new Response(JSON.stringify({ error: "Missing required fields: conversationId, messageId/messageIndex, feedback" }), { 
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
      logError("handleFeedback", "Conversation log not found", null, { logId });
      return new Response(JSON.stringify({ error: "Conversation log not found" }), { 
        status: 404, 
        headers: corsHeaders() 
      });
    }

    const log = JSON.parse(logString);

    // Find the message and update feedback
    let messageUpdated = false;

    // First try to update by message index if provided
    if (messageIndex !== undefined) {
      // Find assistant messages only
      const assistantMessages = log.messageObjects.filter((msg: any) => msg.role === 'assistant');
      
      // Check if the index is valid
      if (messageIndex >= 0 && messageIndex < assistantMessages.length) {
        const targetMessageId = assistantMessages[messageIndex].id;
        
        // Now update the actual message in the full array
        log.messageObjects = log.messageObjects.map((msg: any) => {
          if (msg.id === targetMessageId && msg.role === 'assistant') {
            msg.feedback = feedback;
            messageUpdated = true;
            logInfo("handleFeedback", "Found and updated message by index", { 
              index: messageIndex, 
              msgId: msg.id 
            });
          }
          return msg;
        });
      } else {
        logError("handleFeedback", "Invalid assistant message index", null, { 
          messageIndex, 
          totalAssistantMessages: assistantMessages.length 
        });
      }
    }
            
    if (!messageUpdated) {
      // Log detailed debug info but don't block the request
      logError("handleFeedback", "Assistant message not found for feedback update", null, { 
        logId, 
        messageId,
        messageIndex,
        availableMessageIds: log.messageObjects
          .filter((m: any) => m.role === 'assistant')
          .map((m: any, i: number) => ({ index: i, id: m.id }))
      });
      // Don't return error, just log it
    }

    // Update timestamp and save
    log.updatedAt = new Date().toISOString();
    await env.CONVERSATION_LOGS.put(logId, JSON.stringify(log));

    logInfo("handleFeedback", "Feedback recorded successfully", { 
      logId, 
      messageId, 
      messageIndex,
      feedback,
      updated: messageUpdated
    });
    
    return new Response(JSON.stringify({ success: true, updated: messageUpdated }), { 
      status: 200, 
      headers: corsHeaders() 
    });
  } catch (error) {
    logError("handleFeedback", "Error processing feedback request", error);
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