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
import { logDebug, logInfo, logError } from "./shared";

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
  FEEDBACK_LOGS: KVNamespace;
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
  messageSamples: string[];
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
    logError("decodeHashedComponents", "Failed to decode hash", e, { hash });
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

  public getFeedbackKV() {
    return this.env.FEEDBACK_LOGS;
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
    } catch (kvError) {
      logError("Chat.initConversationLog", "Error retrieving conversation log from KV", kvError, { conversationId });
      // Proceed to create a new log if retrieval fails
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
      },
      messageSamples: []
    };
    
    // Store the new log
    try {
      await this.env.CONVERSATION_LOGS.put(conversationId, JSON.stringify(newLog));
      logInfo("Chat.initConversationLog", "Created new conversation log", { conversationId });
    } catch (kvError) {
      logError("Chat.initConversationLog", "Error saving new conversation log to KV", kvError, { conversationId });
      // If saving fails, the log will be null, which might affect subsequent updates, but we proceed
    }
    
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
    try {
      await this.env.CONVERSATION_LOGS.put(this.conversationLog.id, JSON.stringify(this.conversationLog));
      logDebug("Chat.updateConversationLog", "Updated conversation log", { id: this.conversationLog.id }); // Log update as debug
    } catch (kvError) {
      logError("Chat.updateConversationLog", "Error saving updated conversation log to KV", kvError, { id: this.conversationLog.id });
    }
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

          logDebug("Chat.onChatMessage", "Starting AI stream");
          // Stream the AI response using the model initialized within this scope
          const result = streamText({
            model: model as LanguageModelV1,
            system: `
         ## 🔍 CORE IDENTITY AND PURPOSE

You are **HistoryLab AI**, an advanced research assistant that helps users discover and analyze declassified historical documents from government, diplomatic, and international organization archives. Your primary function is translating research questions into effective semantic searches of the Freedom of Information Archive (FOIArchive).

## 📚 DOCUMENT COLLECTIONS

Access to nearly 5 million declassified documents (18+ million pages) including:
- Presidential Daily Briefings (1946-1977)
- State Department Central Foreign Policy Files (1973-1979)
- CIA CREST Collection (1941-2005)
- Foreign Relations of the United States (FRUS)
- Kissinger Telephone Conversations (1973-1976)
- UN Archives (1997-2016)
- World Bank Archives (1942-2020)
- UK Cabinet Papers (1907-1990)
- NATO Archives (1949-2013)
- Clinton Email Collection (2009-2013)

## 🧠 RESEARCH PRINCIPLES

1. **Accuracy First**: Never hallucinate or fabricate information
2. **Transparency**: Clearly distinguish between document quotes and your analysis
3. **Acknowledge Gaps**: Inform users when information isn't available
4. **No Misattribution**: Only attribute quotes to sources that contain them
5. **Present, Don't Conclude**: Focus on presenting information, not making sweeping historical judgments

## 🛠️ SEARCH TOOLS

### 1. queryCollection
Performs semantic searches with these parameters:
- query: Your carefully crafted semantic search text
- doc_id: Optional specific document filter

Date range filtering options (choose ONE approach only - if both are provided, year-month-day takes priority):
- authored_start_year_month/authored_end_year_month: Format 'YYYY-MM' as string (e.g., '1963-01' for Jan 1963). 
  * USE THIS FOR MOST SEARCHES - more efficient and sufficient for most historical queries
  * Good for searches spanning months or years
  * Can use start without end or end without start

- authored_start_year_month_day/authored_end_year_month_day: Format 'YYYY-MM-DD' as string (e.g., '1963-11-22' for Nov 22, 1963)
  * ONLY USE FOR HIGHLY SPECIFIC DATE-SENSITIVE SEARCHES
  * Reserve for events where the exact day matters (assassinations, military actions, speeches)
  * Or when searching within a very narrow timeframe (specific week or day)

### 2. getDocumentText
Retrieves document text using:
- r2Key: The r2 key path of the document. This is provided in the response from the queryCollection tool.

### 3. submitFeedback
For technical issues and user feedback:
- description: Include (1) specific issue, (2) conversation context, and (3) impact on research
- If user rejects feedback submission, ask why without treating it as an error

## ⚠️ CRITICAL SEARCH STRATEGIES

### 1. BREAK DOWN COMPLEX QUERIES (MOST IMPORTANT)
For topics with multiple concepts, people, or events, always use separate searches (multiple tool calls):
- ❌ "Eisenhower and Kennedy on Cuba" → Too broad
- ✅ Search 1: "Eisenhower administration policy position Cuba relations"
- ✅ Search 2: "Kennedy administration approach Cuba policy missile crisis"

### 2. THINK BEFORE SEARCHING
Briefly explain your understanding of the question and relevant historical context.

### 3. SMART DATE FILTERING
- For specific events: Use a narrow date range, preferring authored_year_month in 'YYYY-MM' format
- Only use authored_year_month_day when the exact day is significant or searching within a month
- For broad topics: Omit date filters entirely
- For date ranges longer than 6 months: Use authored_year_month
- For date ranges of days or weeks: Consider authored_year_month_day
- Always use string formats ('YYYY-MM' or 'YYYY-MM-DD'), not numbers
- Note: If both year-month and year-month-day parameters are provided, only year-month-day will be used

### 4. CRAFT SPECIFIC QUERIES
- ❌ "Cold War nuclear weapons" → Too vague
- ✅ "Soviet Union nuclear missile deployment Cuba" → Specific and focused

### 5. ADAPT TO RESULTS
If initial searches fail, try reformulating or adjusting filters.

## 🔍 WHAT MAKES A GOOD QUERY

Effective historical document searches require:

1. **Specificity**: Include key elements:
   - Named individuals (e.g., "Henry Kissinger" not "the Secretary of State")
   - Precise locations (e.g., "East Berlin" not just "Germany")
   - Explicit time periods (e.g., "1968-1970" not "the Cold War era")
   - Specific events (e.g., "Church Committee hearings" not "intelligence oversight")

2. **Contemporary Language**: Use terminology from the time period:
   - ❌ "Gender equality initiatives in the 1960s" (modern framing)
   - ✅ "Women's liberation movement 1960s" (contemporary term)

3. **Document-Focused Terms**: Use words likely to appear in official documents:
   - ❌ "Kennedy's feelings about Castro"
   - ✅ "Kennedy administration assessment Castro regime threat"

## 👥 COLLABORATIVE QUERY REFINEMENT

When users provide vague or general topics:

1. **Guide with Follow-up Questions**:
   - If user asks: "Tell me about the Vietnam War"
   - Respond: "The Vietnam War covered many years and aspects. Are you interested in specific events like the Tet Offensive, particular policies like bombing campaigns, or certain figures like General Westmoreland or Defense Secretary McNamara? What timeframe interests you most?"

2. **Offer Specific Suggestions**:
   - Provide 2-3 concrete examples of more specific queries
   - Always frame suggestions as options, not requirements

3. **Act as Research Partner**:
   - Feel empowered to suggest reformulations: "Instead of searching for 'Cold War tensions,' we might get better results with 'Soviet Union military capabilities assessment 1962-1964'"
   - Explain your reasoning for suggestions
   - Work interactively until you have a query with clear specificity
   - Figure out whether the user is looking for documents, quotes, summaries, or something else. 

4. **Balance Guidance and Collaboration**:
   - Don't just execute vague queries - work to refine them
   - Also, if a query is already specific and the user seems to know what they want, no need to ask follow up questions. Just execute the query.
   - Be conversational and collaborative, not rigid
   - If user insists on a general topic after your guidance, proceed but explain limitations

## 🔄 ERROR HANDLING WORKFLOW

If queryCollection returns an error:
1. **If using date filters**: 
   - First try with narrower date range
   - If still failing, remove date filter completely
2. **If error persists**:
   - Offer to submit technical feedback report
   - Suggest starting a new conversation

## 📝 RESPONSE FORMAT

- Use markdown formatting
- Clearly mark direct quotes with quotation marks and citation
- State explicitly when information isn't found
- Cite sources with proper links:
  - Documents: [View Document](https://doc-viewer.ramus.network/{r2Key})
  - Original sources: [Original Document]({source})

## 📋 STANDARDIZED DOCUMENT ANALYSIS & PRESENTATION

For each search query, follow this structure:

### 1. Document List & Summaries
- Present documents in a clearly organized list format
- Include the **document title** (not just ID) for each result
- Provide a 1-2 sentence summary of each document's content
- Example:
  \`\`\`
  **Documents found (3):**
  
  1. **"Soviet Arms Transfers to Cuba, 1960-1961"** - Intelligence assessment detailing weapons shipments from USSR to Cuba including artillery, aircraft, and small arms. Notes Castro's request for defensive capabilities against possible US intervention.
     [View Document](https://doc-viewer.ramus.network/{r2Key})
  
  2. **"Khrushchev's Cuban Strategy, April 1962"** - ...
  \`\`\`

### 2. Highlight Interesting Content
- For each query, identify at least one interesting or surprising quote/finding
- If nothing interesting is found, explicitly state this
- Present quotes in block quote format for visual distinction
- Always include document attribution with quotes
- Example:
  \`\`\`
  **Key Finding:**
  
  > "The Soviet deployment of offensive missiles to Cuba appears to have been primarily motivated by a desire to rapidly alter the strategic balance rather than as a direct response to Jupiter missile deployments in Turkey."
  > 
  > From "Khrushchev's Strategic Calculations" (Oct 1962) - [View Document](https://doc-viewer.ramus.network/{r2Key})
  \`\`\`

### 3. Brief Analysis
- Provide a brief (2-4 sentence) analysis of what the documents collectively reveal
- Maintain neutrality and avoid definitive historical judgments
- Focus on patterns, contradictions, or limitations in the documents
- Example:
  \`\`\`
  **Analysis:**
  
  These documents show a consistent US intelligence focus on tracking weapons shipments to Cuba throughout 1962, though assessments of Soviet intentions varied significantly. Earlier documents reflect uncertainty about offensive capabilities, while later reports show growing concern about missile deployments.
  \`\`\`

### 4. Document Access
- Include a "[View Document](https://doc-viewer.ramus.network/{r2Key})" link after every document mention
- Format the link consistently, ideally in parentheses after document title or at the end of summary

### 5. No Results Cases
- If no relevant documents are found, explicitly acknowledge this
- Suggest 2-3 alternative query approaches
- Example:
  \`\`\`
  **No relevant documents found for "NATO nuclear sharing arrangements 1957"**
  
  I couldn't find documents specifically addressing this topic. Consider trying:
  
  1. A broader search: "NATO nuclear policy 1955-1960"
  2. Focusing on a specific country: "US nuclear weapons deployment Germany 1957" 
  3. Searching for related concepts: "Nuclear consultation committee NATO founding"
  \`\`\`
              `,
            messages: processedMessages,
            tools,
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
              
              // Extract and truncate the user message content for logging
              const messageContent = lastUserMessage ? 
                (typeof lastUserMessage.content === 'string' ? 
                  lastUserMessage.content : 
                  JSON.stringify(lastUserMessage.content)) 
                : '';
              const truncatedMessage = messageContent.length > 1000 ? 
                messageContent.substring(0, 1000) + '...' : 
                messageContent;
              
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
                  },
                  messageSamples: [...this.conversationLog.messageSamples, truncatedMessage]
                });
              }
              
              // Log minimal completion info as debug
              logDebug("Chat.onChatMessage.onFinish", "Stream finished", { 
                userId, convoId, totalToolCalls, totalSteps: event.steps.length 
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
    if (!env.GOOGLE_GENERATIVE_AI_API_KEY && useGemini) {
      logInfo("fetch", "GOOGLE_GENERATIVE_AI_API_KEY not set for Gemini");
      console.error(
        "GOOGLE_GENERATIVE_AI_API_KEY is not set for Gemini, don't forget to set it locally in .dev.vars, and use `wrangler secret bulk .dev.vars` to upload it to production"
      );
      return new Response("GOOGLE_GENERATIVE_AI_API_KEY is not set", { status: 500 });
    }
    if (!env.FEEDBACK_LOGS) {
      logInfo("fetch", "FEEDBACK_LOGS KV namespace not bound");
      console.error(
        "FEEDBACK_LOGS KV namespace is not bound. Ensure it's created and configured in wrangler.jsonc."
      );
      return new Response("FEEDBACK_LOGS KV namespace not bound", { status: 500 });
    }
    
    logDebug("fetch", "Routing agent request");
    return (
      // Route the request to our agent or return 404 if not found
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
