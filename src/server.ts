// server.ts

import {
  type AgentNamespace,
  type Connection,
  routeAgentRequest,
  type Agent,
  type Schedule,
} from "agents-sdk";
import { AIChatAgent } from "agents-sdk/ai-chat-agent";
import {
  createDataStreamResponse,
  generateId,
  type LanguageModelV1,
  type Message,
  streamText,
  type StreamTextOnFinishCallback,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
// import { createWorkersAI } from 'workers-ai-provider';
import { processToolCalls } from "./utils";
import { tools, executions } from "./tools";
import { AsyncLocalStorage } from "node:async_hooks";
import { logDebug, logInfo } from "./shared";

// Environment variables type definition
export type Env = {
  OPENAI_API_KEY: string;
  GOOGLE_GENERATIVE_AI_API_KEY: string;
  BUCKET: R2Bucket;
  Chat: AgentNamespace<Chat>;
  VECTORIZE_SEARCH: {
    findSimilarEmbeddings(
      queries: string | string[], 
      collection_id: string, 
      topK?: number, 
      filters?: Record<string, any>
    ): Promise<{
      status: string;
      matches?: Array<{
        id: string;
        text: string;
        score: number;
        metadata?: Record<string, any>;
      }>;
      message?: string;
      error?: string;
    }>;
  }; 
  CONVERSATION_LOGS: KVNamespace;
};

// Type definition for conversation logs
interface ConversationLog {
  id: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
  collectionId: string;
  convoId: string;
  messageCount: number;
  toolCalls: {
    total: number;
    byType: Record<string, number>;
  };
  queries: {
    total: number;
    withToolCalls: number;
    withoutToolCalls: number;
  };
  characters: {
    input: number;
    output: number;
  };
}

const COLLECTION_ID = '80650a98-fe49-429a-afbd-9dde66e2d02b'; // history-lab-1
const useGemini = true;

// Function to decode the hashed components - Must match the frontend implementation
function decodeHashedComponents(hash: string): { userId: string, collectionId: string, convoId: string } {
  try {
    // Decode the base64 string - use Buffer for Node.js environment
    const decoded = Buffer.from(hash, 'base64').toString('utf-8');
    
    // Split by the delimiter
    const [userId, collectionId, convoId] = decoded.split('|');
    
    return { userId, collectionId, convoId };
  } catch (e) {
    logInfo("decodeHashedComponents", "Failed to decode hash", { hash, error: e });
    // Return fallback values if decoding fails
    return { 
      userId: 'unknown', 
      collectionId: COLLECTION_ID, 
      convoId: `fallback-${Date.now()}`
    };
  }
}

// we use ALS to expose the agent context to the tools
export const agentContext = new AsyncLocalStorage<Chat>();
/**
 * Chat Agent implementation that handles real-time AI chat interactions
 */
export class Chat extends AIChatAgent<Env> {

  // Track conversation state
  private conversationLog: ConversationLog | null = null;

  public getBucket() {
    return this.env.BUCKET;
  }

  public getVectorizeSearch() {
    return this.env.VECTORIZE_SEARCH;
  }

  /**
   * Initialize or retrieve the conversation log
   */
  private async initConversationLog(userId: string, collectionId: string, convoId: string): Promise<ConversationLog> {
    // Generate a unique ID for this conversation if we don't have one
    const conversationId = `${userId}-${collectionId}-${convoId}`;
    
    // Check if we already have a log for this conversation
    try {
      const existingLog = await this.env.CONVERSATION_LOGS.get(conversationId, 'json');
      if (existingLog) {
        logInfo("Chat.initConversationLog", "Retrieved existing conversation log", { conversationId });
        return existingLog as ConversationLog;
      }
    } catch (error) {
      logInfo("Chat.initConversationLog", "Error retrieving conversation log", { error, conversationId });
    }
    
    // Create a new conversation log
    const now = new Date().toISOString();
    const newLog: ConversationLog = {
      id: conversationId,
      createdAt: now,
      updatedAt: now,
      userId,
      collectionId,
      convoId,
      messageCount: 0,
      toolCalls: {
        total: 0,
        byType: {}
      },
      queries: {
        total: 0,
        withToolCalls: 0,
        withoutToolCalls: 0
      },
      characters: {
        input: 0,
        output: 0
      }
    };
    
    // Store the new log
    await this.env.CONVERSATION_LOGS.put(conversationId, JSON.stringify(newLog));
    logInfo("Chat.initConversationLog", "Created new conversation log", { conversationId });
    
    return newLog;
  }
  
  /**
   * Update the conversation log with new stats
   */
  private async updateConversationLog(stats: Partial<ConversationLog>): Promise<void> {
    if (!this.conversationLog) {
      logInfo("Chat.updateConversationLog", "No conversation log to update");
      return;
    }
    
    // Update the conversation log
    this.conversationLog = {
      ...this.conversationLog,
      ...stats,
      updatedAt: new Date().toISOString()
    };
    
    // Store the updated log
    await this.env.CONVERSATION_LOGS.put(this.conversationLog.id, JSON.stringify(this.conversationLog));
    logInfo("Chat.updateConversationLog", "Updated conversation log", { 
      id: this.conversationLog.id,
      messageCount: this.conversationLog.messageCount,
      toolCalls: this.conversationLog.toolCalls
    });
  }

  /**
   * Handles incoming chat messages and manages the response stream
   * @param onFinish - Callback function executed when streaming completes
   */

  // biome-ignore lint/complexity/noBannedTypes: <explanation>
  async onChatMessage(onFinish: StreamTextOnFinishCallback<{}>) {
    logInfo("Chat.onChatMessage", "Starting chat message processing");

    // Get the hashed ID from the agent name and decode it
    let userId = "unknown";
    let collectionId = COLLECTION_ID;
    let convoId = "unknown";
    
    if (this.name) {
      try {
        const decodedComponents = decodeHashedComponents(this.name);
        userId = decodedComponents.userId;
        collectionId = decodedComponents.collectionId;
        convoId = decodedComponents.convoId;
        
        logInfo("Chat.onChatMessage", "Successfully decoded conversation components", { 
          userId, 
          collectionId, 
          convoId 
        });
      } catch (error) {
        logInfo("Chat.onChatMessage", "Failed to decode conversation components, using defaults", { 
          error, 
          agentName: this.name 
        });
      }
    } else {
      logInfo("Chat.onChatMessage", "No agent name provided, using default values");
    }
  
    logInfo("Chat.onChatMessage", "Connection info", { 
      userId, 
      collectionId, 
      convoId 
    });  

    // Initialize conversation log if we don't have one
    if (!this.conversationLog) {
      this.conversationLog = await this.initConversationLog(userId, collectionId, convoId);
    }

    // Create a streaming response that handles both text and tool outputs
    return agentContext.run(this, async () => {
      logDebug("Chat.onChatMessage", "Setting up data stream response");
      const dataStreamResponse = createDataStreamResponse({
        execute: async (dataStream) => {          
          logDebug("Chat.onChatMessage", "Processing pending tool calls", { messageCount: this.messages.length });
          // Process any pending tool calls from previous messages
          // This handles human-in-the-loop confirmations for tools
          const processedMessages = await processToolCalls({
            messages: this.messages,
            dataStream,
            tools,
            executions,
          });

          // Declare model variable that will be set in the conditionals
          let model;

          if (useGemini) {
            logInfo("Chat.onChatMessage", "Initializing Gemini client");                              
            // Initialize Google client with API key from environment
            const googleAI = createGoogleGenerativeAI({
              apiKey: this.env.GOOGLE_GENERATIVE_AI_API_KEY
            });
            model = googleAI("models/gemini-2.0-flash-exp");
          } else {
            logInfo("Chat.onChatMessage", "Initializing OpenAI client");                  
              
            // Initialize OpenAI client with API key from environment
            const openai = createOpenAI({
              apiKey: this.env.OPENAI_API_KEY,
            });

            const model_name = "gpt-4o-2024-11-20";
            // const model_name = "gpt-4o-mini-2024-07-18";

            logDebug("Chat.onChatMessage", "Starting AI stream", { model: model_name });
            model = openai(model_name);
          }

          // Stream the AI response using GPT-4o
          const result = streamText({
            model: model as LanguageModelV1,
            system: `
              You are HistoryLab AI, an advanced research assistant specialized in analyzing historical documents and helping users explore declassified archives.

              YOUR ROLE:
              You help users discover, search, and analyze historical documents across multiple government, diplomatic, and international organization archives. Your primary function is to assist researchers, students, and history enthusiasts in finding relevant historical information by translating their research questions into effective semantic searches of the document database.

              RESEARCH PRINCIPLES:
              1. ACCURACY OVER COMPLETENESS: Never hallucinate or fabricate information. If you can't find something in the documents, clearly state this to the user.
              2. TRANSPARENCY: Always distinguish between direct quotes from documents and your own analysis or summaries.
              3. ACKNOWLEDGE LIMITATIONS: It's valuable for researchers to know when information isn't in the archives. If you can't find exactly what they're looking for, explain this and offer the closest relevant information you did find.
              4. NO MISATTRIBUTION: Never attribute quotes or information to sources that don't explicitly contain them.
              5. AVOID GRANDIOSE CONCLUSIONS: Your primary role is to present information from documents, not to draw sweeping historical conclusions.

              AVAILABLE TOOLS:
              You have access to the following search tool:

              - queryCollection: This tool allows you to perform semantic searches through historical document collections with various filtering options. When using this tool, be transparent with the user about which filters you're applying and why. The parameters include:
                * collectionId: Always use "history-lab-1" unless instructed otherwise
                * query: The semantic search text (craft this carefully for best results)
                * doc_id: Optional filter for a specific document ID
                * authored_start/authored_end: Optional date range filters (YYYY-MM-DD format)

              - getDocumentText: This tool allows you to get the text of a given document from the R2 bucket using the file key path. The parameters include:
                * fileKey: The file key path of the document to get the text of

              SEARCH STRATEGY - CRITICAL APPROACH:
              1. BREAK DOWN COMPLEX QUERIES: This is the MOST IMPORTANT strategy. For ANY topic involving multiple distinct concepts, people, events, or questions, you MUST break it into multiple separate searches rather than combining them in one query.
                 Examples:
                 - "What did Eisenhower and Kennedy say about Cuba?" → Make separate searches:
                    1. "Eisenhower administration policy position Cuba relations"
                    2. "Kennedy administration approach Cuba policy missile crisis"
                 
                 - "Tell me about the Strategic Bombing Survey and area bombing of Dresden and Hamburg" → Break into:
                    1. "United States Strategic Bombing Survey findings methodology conclusions"
                    2. "Dresden bombing raid casualties damage assessment"
                    3. "Hamburg bombing operation Gomorrah effects civilian impact"
              
              2. THINK ALOUD FIRST: Before querying, verbalize your understanding of what the user is asking about, including relevant historical context, key figures, and events. Do this concisely.
              
              3. IDENTIFY TIME PERIODS: For any historical query, determine the appropriate time period and use date filters when applicable. Always err on the side of having a wider time period rather than a more condensed one to avoid missing relevant documents. For example:
                 - "Cuban Missile Crisis" → authored_start: "1962-10-01", authored_end: "1962-11-30"
                 - "Nixon's visit to China" → authored_start: "1971-07-01", authored_end: "1972-03-31"
                 - "Vietnam War" → authored_start: "1955-01-01", authored_end: "1975-12-31" (wider time period to capture the full conflict and related diplomatic communications)
                 
              4. MAKE QUERIES SPECIFIC AND FOCUSED: A good query should be focused on a specific aspect of the topic:
                 - Bad: "Cold War nuclear weapons"
                 - Good: "Soviet Union nuclear missile deployment Cuba October 1962"
                 
                 - Bad: "Vietnam War bombing campaigns"
                 - Good: "Operation Rolling Thunder Vietnam bombing effectiveness military targets civilian casualties"
              
              5. START BROAD, THEN NARROW: Begin with general searches, then narrow down based on initial results.
              
              6. ADAPT BASED ON RESULTS: If initial searches don't yield useful results, try reformulating the query or adjusting filters. Explain your reasoning to the user.

              RESPONSE FORMAT:
              - Use markdown formatting for the response.
              - Clearly distinguish between direct quotes (using quotation marks and citation) and your summaries.
              - When you can't find information, explicitly state this and explain what you did find instead.
              - Make sure to cite your sources. Provide a link to the document using the following format: [View Document](https://r2-text-viewer.nchimicles.workers.dev/{file_key}) (e.g. https://r2-text-viewer.nchimicles.workers.dev/0000000001/80650a98-fe49-429a-afbd-9dde66e2d02b/000062a6-7ae7-4043-8d97-9c6e4012bb1b/507922_un.txt)                                               

              IMPORTANT INFO:
              - collectionId is always "${COLLECTION_ID}"
              `,
            messages: processedMessages,
            tools,
            // onFinish,
            onFinish: async (event) => {
              // First, call the original onFinish callback if it exists
              if (onFinish) {
                await onFinish(event as any);                          
              }

              // Now we can add custom actions to perform when the stream completes
              logInfo("Chat.onChatMessage.onFinish", "Stream completed", { 
                steps: event.steps.length,
                userId,
                collectionId,
                convoId
              });
              
              // Count tool calls and track stats
              const toolCallsByType: Record<string, number> = {};
              const totalToolCalls = event.steps.reduce((count, step) => {
                // Count tool calls across all steps
                if (step.toolCalls && step.toolCalls.length > 0) {
                  step.toolCalls.forEach(toolCall => {
                    const toolName = toolCall.toolName;
                    toolCallsByType[toolName] = (toolCallsByType[toolName] || 0) + 1;
                  });
                  return count + step.toolCalls.length;
                }
                return count;
              }, 0);
              
              // Find the last user message to calculate input characters
              const lastUserMessage = this.messages.findLast(m => m.role === 'user');
              const userInputChars = lastUserMessage ? 
                (typeof lastUserMessage.content === 'string' ? 
                  lastUserMessage.content.length : 
                  JSON.stringify(lastUserMessage.content).length) 
                : 0;
              
              // Find the last assistant message to calculate output characters
              const lastAssistantMessage = this.messages.findLast(m => m.role === 'assistant');
              const assistantOutputChars = lastAssistantMessage ? 
                (typeof lastAssistantMessage.content === 'string' ? 
                  lastAssistantMessage.content.length : 
                  JSON.stringify(lastAssistantMessage.content).length) 
                : 0;
              
              // Check if this query used tool calls
              const queryHadToolCalls = totalToolCalls > 0;
              
              // Update the conversation log with the new stats
              if (this.conversationLog) {
                await this.updateConversationLog({
                  messageCount: this.messages.length,
                  toolCalls: {
                    total: this.conversationLog.toolCalls.total + totalToolCalls,
                    byType: Object.entries(toolCallsByType).reduce((merged, [key, value]) => {
                      merged[key] = (this.conversationLog?.toolCalls.byType[key] || 0) + value;
                      return merged;
                    }, { ...this.conversationLog.toolCalls.byType })
                  },
                  queries: {
                    total: this.conversationLog.queries.total + 1,
                    withToolCalls: this.conversationLog.queries.withToolCalls + (queryHadToolCalls ? 1 : 0),
                    withoutToolCalls: this.conversationLog.queries.withoutToolCalls + (queryHadToolCalls ? 0 : 1)
                  },
                  characters: {
                    input: this.conversationLog.characters.input + userInputChars,
                    output: this.conversationLog.characters.output + assistantOutputChars
                  }
                });
              }
              
              logInfo("Chat.onChatMessage.onFinish", "Conversation stats", {
                toolCallCount: totalToolCalls,
                totalSteps: event.steps.length,
                toolCallsByType,
                messageCount: this.messages.length,
                inputChars: userInputChars,
                outputChars: assistantOutputChars
              });

              logDebug("Chat.onChatMessage.onFinish", "Completed messages", {
                messages: this.messages
              });
            },
            maxSteps: 10,
          });

          logDebug("Chat.onChatMessage", "Merging AI response stream with tool outputs");
          // Merge the AI response stream with tool execution outputs
          result.mergeIntoDataStream(dataStream);
        },
      });

      return dataStreamResponse;
    });
  }
  async executeTask(description: string, task: Schedule<string>) {
    logInfo("Chat.executeTask", "Executing scheduled task", { description });
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        content: `scheduled message: ${description}`,
      },
    ]);
    logDebug("Chat.executeTask", "Task execution completed");
  }
}

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    logDebug("fetch", "Processing incoming request", { url: request.url });
    if (!env.OPENAI_API_KEY) {
      logInfo("fetch", "OPENAI_API_KEY not set");
      console.error(
        "OPENAI_API_KEY is not set, don't forget to set it locally in .dev.vars, and use `wrangler secret bulk .dev.vars` to upload it to production"
      );
      return new Response("OPENAI_API_KEY is not set", { status: 500 });
    }
    
    logDebug("fetch", "Routing agent request");
    return (
      // Route the request to our agent or return 404 if not found
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
