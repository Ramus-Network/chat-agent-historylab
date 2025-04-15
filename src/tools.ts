// tools.ts

/**
 * Tool definitions for the AI chat agent
 * Tools can either require human confirmation or execute automatically
 */
import { tool } from "ai";
import { z } from "zod";

import { agentContext, type Env } from "./server";
import { logDebug, logInfo, logError } from "./shared"; 

function getAgent() {
  const agent = agentContext.getStore();
  if (!agent) {
    throw new Error("Agent not found");
  }
  return agent;
}

// EXAMPLES OF TOOLS
/**
 * Weather information tool that requires human confirmation
 * When invoked, this will present a confirmation dialog to the user
 * The actual implementation is in the executions object below
 */
const testTool = tool({
  description: "show the weather in a given city to the user",
  parameters: z.object({ city: z.string() }),
  
  execute: async ({ city }) => {
    logInfo("testTool", `Getting weather information for city: ${city}`);
    return `This is a test tool`;
  },
});

/**
 * Get the text of a given document from the R2 bucket using the file key path
 */
const getDocumentText = tool({
  description: "get the text of a given document from the R2 bucket",
  parameters: z.object({ fileKey: z.string() }),
  execute: async ({ fileKey }) => {
    logInfo("getDocumentText", `Getting document text for document: ${fileKey}`);

    try {
      const agent = getAgent();
      const bucket = agent.getBucket();
      const file = await bucket.get(fileKey);
      if (!file) {
        return { error: "File not found" };
      }
      const text = await file.text();
      return text;
    } catch (error) {
      logDebug("getDocumentText", `Error getting document text: ${error}`);
      logError("getDocumentText", "Error getting document text", error);
      return { error: "Failed to get document text" };
    }
  },
});
/**
 * Query a given collection using a vector search
 * 
 * This tool allows for semantic searching through historical document collections with various filtering options:
 * - Use query for the semantic search text (craft this carefully for best results)
 * - Filter by doc_id when looking for information within a specific document
 * - Filter by authored date range to find documents from specific time periods
 * 
 * IMPORTANT QUERYING STRATEGY:
 * For best results, break down complex queries into multiple separate searches.
 * Instead of combining multiple concepts, people, or events in a single query,
 * make multiple focused queries and then synthesize the results.
 * 
 * Examples of breaking down queries:
 * - "What did Nixon and Kissinger discuss about China?" → Make separate queries:
 *   1. "Richard Nixon discussions communications China visit diplomatic relations"
 *   2. "Henry Kissinger negotiations China diplomatic strategy"
 * 
 * - "How did the US respond to the Cuban Missile Crisis?" → Break into:
 *   1. "United States government executive committee response Cuban Missile Crisis"
 *   2. "Kennedy administration decisions actions Cuban Missile Crisis blockade"
 *   3. "Military preparations deployment Cuban Missile Crisis"
 *   4. "Diplomatic negotiations communications Soviet Union Cuban Missile Crisis resolution"
 */
const queryCollection = tool({
  description: "Perform semantic searches through historical document collections. For complex topics, make MULTIPLE separate tool calls with focused queries. Use narrow date ranges (e.g., ~5 years) when possible, as wider ranges increase error likelihood.",
  parameters: z.object({ 
    // collectionId: z.string().describe("Collection ID to search within (use 'history-lab-1' unless instructed otherwise)"),
    query: z.string().describe("The semantic search query text - make focused, specific queries rather than combining multiple topics"),
    doc_id: z.string().optional().describe("Filter by specific document ID when looking for more information within a document"),
    authored_start: z.string().optional().describe("Start date for filtering documents (format: YYYY-MM-DD)"),
    authored_end: z.string().optional().describe("End date for filtering documents (format: YYYY-MM-DD)")
  }),
  execute: async ({ query, doc_id, authored_start, authored_end }) => {
    // Log the search parameters
    logInfo(
      "queryCollection", 
      `Querying collection: history-lab-1 with query: ${query}` + 
      (doc_id ? `, doc_id: ${doc_id}` : "") +
      (authored_start ? `, authored from: ${authored_start}` : "") +
      (authored_end ? `, to: ${authored_end}` : "")
    );

    try {
      const agent = getAgent();
      const vectorizeSearch = agent.getVectorizeSearch();

      const k = 7;
      
      // Build filters for the search
      const filters: Record<string, any> = {};
      
      // Add document ID filter if specified
      if (doc_id) {
        filters.doc_id = doc_id;
      }
      
      // Add date range filters if specified
      if (authored_start || authored_end) {
        filters.authored = {};
        
        if (authored_start) {
          // Convert to unix timestamp
          filters.authored.$gte = new Date(authored_start).getTime();
        }
        
        if (authored_end) {
          filters.authored.$lte = new Date(authored_end).getTime();
        }
      }
      
      // Always use the history-lab-1 collection ID
      const finalCollectionId = "80650a98-fe49-429a-afbd-9dde66e2d02b"; // history-lab-1
      
      // Log the complete search request for debugging
      logDebug("queryCollection", `Search request: {
        queries: "${query}",
        collection_id: "${finalCollectionId}",
        topK: 10,
        filters: ${JSON.stringify(filters)}
      }`);
      
      // Create the request object for the new API format
      const request = {
        queries: query,
        collection_id: finalCollectionId,
        topK: k,
        filters: Object.keys(filters).length > 0 ? filters : undefined
      };
      
      // Call the vector search with parameters using the new format
      const results = await vectorizeSearch.findSimilarEmbeddings(
        request.queries,
        request.collection_id,
        request.topK,
        request.filters
      );

      // Check for error
      if (results?.error) {
        logError("queryCollection", `Error querying collection`, results.error, { query, doc_id, authored_start, authored_end });        
      }                
      
      // Log the number of results returned
      logInfo("queryCollection", `Search returned ${results?.matches?.length || 0} results`);
      
      // Log detailed results for debugging
      logDebug("queryCollection", `Results: ${JSON.stringify(results)}`);
      return results;
    } catch (error) {
      // logDebug("queryCollection", `Error querying collection: ${error}`);
      logError("queryCollection", "Error querying collection", error, { query, doc_id, authored_start, authored_end });
      return { error: "Failed to query collection" };
    }
  },
});

/**
 * Submit Feedback tool
 * This tool allows the user to submit feedback about their interaction.
 * The AI should first ask the user if they want to submit feedback.
 * If the user confirms, the AI should call this tool with a description of the issue.
 * The tool automatically captures the conversation context.
 */
const submitFeedback = tool({
  description: "Submits feedback. Use this tool for filing reports about technical issues (e.g., tool failures, unexpected empty results) or when the user expresses any feedback/emotion about the service. Requires user confirmation.",
  parameters: z.object({
    description: z.string().describe("A detailed description that includes: (1) the specific technical issue or user feedback, (2) relevant context from the conversation (what the user was trying to accomplish), and (3) how this feedback relates to their research or experience."),
  }),
});

/**
 * Export all available tools
 * These will be provided to the AI model to describe available capabilities
 */
export const tools = {
  // getCollectionInfo,
  // listCollectionContents,
  queryCollection,
  getDocumentText,
  submitFeedback
};

/**
 * Recursively traverses an object or array and truncates long strings.
 * @param data The data to process (object, array, string, etc.).
 * @param maxLength The maximum allowed length for strings.
 * @returns The processed data with long strings truncated.
 */
function truncateLargeStrings(data: any, maxLength: number): any {
  if (typeof data === 'string') {
    return data.length > maxLength ? data.substring(0, maxLength) + '...' : data;
  } else if (Array.isArray(data)) {
    return data.map(item => truncateLargeStrings(item, maxLength));
  } else if (data !== null && typeof data === 'object') {
    const newData: { [key: string]: any } = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        newData[key] = truncateLargeStrings(data[key], maxLength);
      }
    }
    return newData;
  }
  // Return numbers, booleans, null, undefined as is
  return data;
}

/**
 * Filters the conversation history to remove large tool result content,
 * suitable for feedback submission.
 * @param messages The original array of messages.
 * @returns A new array with filtered messages.
 */
function filterConversationForFeedback(messages: any[]) {
  return messages.map(message => {
    // Deep copy message to avoid modifying the original agent state
    const filteredMessage = JSON.parse(JSON.stringify(message));

    const charLimit = 1000;

    if (filteredMessage.role === 'assistant' && filteredMessage.toolInvocations) {
      filteredMessage.toolInvocations = filteredMessage.toolInvocations.map((invocation: any) => {
        if (invocation.result) {
           try {
             // Universally truncate long strings in the result object/array
             const truncatedResult = truncateLargeStrings(invocation.result, charLimit);
             return { ...invocation, result: truncatedResult };
           } catch (error) {
             logDebug("filterConversationForFeedback", `Error truncating tool result for ${invocation.toolName}: ${error}`, { invocation });
             logError("filterConversationForFeedback", `Error truncating tool result for ${invocation.toolName}`, error, { invocation });
             // Fallback: Replace the entire result if truncation fails unexpectedly
             return { ...invocation, result: { error: "Failed to truncate tool result content." } };
           }
        }
        return invocation; // No result to filter or filter failed
      });
    }

    // Optionally, truncate long assistant text content itself if needed
    if (filteredMessage.role === 'assistant' && filteredMessage.content && typeof filteredMessage.content === 'string') {
      filteredMessage.content = truncateLargeStrings(filteredMessage.content, 1000); // Limit assistant text too
    }

    return filteredMessage;
  });
}

/**
 * Implementation of confirmation-required tools
 * This object contains the actual logic for tools that need human approval
 * Each function here corresponds to a tool above that doesn't have an execute function
 */
export const executions = {
  submitFeedback: async ({ description }: { description: string }) => {
    logInfo("SubmitFeedback", `Received feedback submission request.`);

    try {
      const agent = getAgent();
      const feedbackKV = agent.getFeedbackKV();
      const messages = agent.messages; // Original messages
      const agentName = agent.name || 'unknown-agent';

      // Filter the conversation history
      const filteredConversation = filterConversationForFeedback(messages);

      // Decode user/convo IDs (reuse existing logic if possible, or basic split)
      // Basic split for now, ideally reuse decodeHashedComponents if accessible
      let userId = 'unknown';
      let collectionId = 'unknown';
      let convoId = 'unknown';
      try {
        // Attempt to reuse decoding logic or implement a simple version
        const decoded = Buffer.from(agentName, 'base64').toString('utf-8').split('|');
        if (decoded.length === 3) {
          [userId, collectionId, convoId] = decoded;
        }
      } catch (error) {
        logError("SubmitFeedback", "Failed to decode agent name for IDs, using defaults.", error, { agentName });
      }

      // Generate a unique report ID
      const reportId = `feedback-${userId}-${convoId}-${Date.now()}`;

      const feedbackData = {
        reportId,
        timestamp: new Date().toISOString(),
        userId,
        collectionId,
        convoId,
        description,
        conversation: filteredConversation, // Use the filtered conversation
      };

      // Save to KV
      await feedbackKV.put(reportId, JSON.stringify(feedbackData));

      logInfo("SubmitFeedback", `Successfully saved feedback report: ${reportId}`);
      return { success: true, reportId: reportId, message: "Thank you for your feedback. A report has been submitted." };

    } catch (error) {
      logError("SubmitFeedback", "Error submitting feedback", error, { description });
      return { success: false, error: "Failed to submit feedback due to an internal error." };
    }
  },
};
