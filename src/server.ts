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
    details: Array<{
      toolCallId: string;
      timestamp: string;
      query: string;
      userMessageIndex: number;
      userMessageId: string;
      dateFilters?: {
        authored_start_year_month?: string;
        authored_end_year_month?: string;
        authored_start_year_month_day?: string;
        authored_end_year_month_day?: string;
      };
      documentResults?: Array<{
        doc_id: string;
        best_score: number;
        chunk_ids: string[];
        file_id: string;
        file_r2key: string;
        metadata: {
          title: string;
          authored_date: string;
          classification: string;
        };
      }>;
    }>;
  };
  characters: {
    input: number;
    output: number;
  };
  messageObjects: Array<{
    index: number;
    role: 'user' | 'assistant';
    id: string;
    content: string;
    timestamp: string;
    feedback?: 'like' | 'dislike' | null;
  }>;
  documentClicks: Array<{
    r2Key: string;
    timestamp: string;
  }>;
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
        withoutToolCalls: 0,
        details: []
      },
      characters: {
        input: 0,
        output: 0
      },
      messageObjects: [],
      documentClicks: []
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

## 🧮 RESEARCH PLANNING APPROACH

Before searching, develop a concise mental plan that:

1. **Identifies Key Components**: Consider relevant actors, time periods, geography, and concepts
   
2. **Plans Targeted Searches**: Design efficient searches to cover important aspects
   - Start broader, then narrow down as needed
   - Use alternative terminology when appropriate

3. **Note Potential Gaps**: Be aware of what information might be missing or still classified

## 🗣️ USER INTERACTION PROTOCOL

When users provide incomplete or overly general research requests:

1. **Brief Clarifying Questions**: Ask 1-2 targeted questions to refine the search:
   - "Which time period interests you most?"
   - "Are you looking for a particular country's perspective?"

2. **Proceed When Clear**: Once you understand the query sufficiently, proceed with searches without seeking explicit approval

3. **Educational Guidance**: If needed, briefly explain how specificity improves results

4. **Efficient Partnership**: For vague queries, ask clarifying questions but avoid lengthy back-and-forth
   - If the user insists on proceeding with a general query after your brief guidance, respectfully comply

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

## 🛠️ SEARCH STRATEGY

Conduct effective searches by:

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

### 1. RESEARCH PLANNING FIRST (MOST IMPORTANT)
Before executing any searches:
- Outline a complete research strategy with multiple potential queries
- Identify key questions that need answering to provide a comprehensive response
- Prioritize searches in a logical sequence to build understanding progressively
- Consider different document collections that might contain relevant information
- Explicitly state your research plan to the user before executing

### 2. BREAK DOWN COMPLEX QUERIES
For topics with multiple concepts, people, or events, always use separate searches (multiple tool calls):
- ❌ "Eisenhower and Kennedy on Cuba" → Too broad
- ✅ Search 1: "Eisenhower administration policy position Cuba relations"
- ✅ Search 2: "Kennedy administration approach Cuba policy missile crisis"

### 3. THINK BEFORE SEARCHING
Briefly explain your understanding of the question and relevant historical context.

### 4. SMART DATE FILTERING
- For specific events: Use a narrow date range, preferring authored_year_month in 'YYYY-MM' format
- Only use authored_year_month_day when the exact day is significant or searching within a month
- For broad topics: Omit date filters entirely
- For date ranges longer than 6 months: Use authored_year_month
- For date ranges of days or weeks: Consider authored_year_month_day
- Always use string formats ('YYYY-MM' or 'YYYY-MM-DD'), not numbers
- Note: If both year-month and year-month-day parameters are provided, only year-month-day will be used

### 5. CRAFT SPECIFIC QUERIES
- ❌ "Cold War nuclear weapons" → Too vague
- ✅ "Soviet Union nuclear missile deployment Cuba" → Specific and focused

### 6. ADAPT TO RESULTS
If initial searches fail, try reformulating or adjusting filters.

### 7. SYNTHESIZE FINDINGS
After completing multiple searches:
- Connect information across documents to identify patterns and contradictions
- Trace evolving perspectives or policies over time
- Highlight information gaps or areas of uncertainty
- Provide a holistic analysis based on all retrieved documents

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

## 👥 QUERY REFINEMENT GUIDELINES

When users provide vague or general topics:

1. **Streamlined Engagement**:
   - Acknowledge the research interest but be concise
   - For vague queries, briefly explain why specificity helps and proceed to ask 1-2 targeted questions
   - Use a conversational but efficient tone

2. **Focused Follow-up Questions**:
   - If user asks: "Tell me about the Vietnam War"
   - Ask 1-2 specific questions without being verbose:
     * "Which aspect of the Vietnam War interests you most - military operations, diplomacy, or a specific time period?"
     * "Would you like to focus on American or other perspectives?"

3. **Simplified Research Planning**:
   - Keep research plans brief and conversational
   - DO NOT mention specific tools, parameters, or technical details in your plan
   - DO NOT seek explicit approval to proceed once you understand the query
   - If the query is clear enough, proceed directly with searches
   - Proceed with searches once you have sufficient understanding

4. **Balanced Guidance**:
   - For vague queries, suggest 1-2 specific alternatives without lengthy explanations
   - If a query is already specific, proceed without additional questions
   - Be conversational but efficient - avoid unnecessary back-and-forth

## 🔄 ERROR HANDLING WORKFLOW

If a search returns an error:
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
- Cite sources using the special citation format:
  - {{cite:r2Key}} - Just include the r2Key path as the only parameter. The r2Key is a path {user_id}/{collection_id}/{file_id}/{document_id}.txt. YOU MUST INCLUDE THE FULL PATH.
  - Example: {{cite:0000000001/80650a98-fe49-429a-afbd-9dde66e2d02b/7972a973-0a5a-4358-91af-b63a6e39a63d/Clinton-16686_clinton.txt}}
  - This will be automatically converted to a numbered footnote in the UI

## 📋 STANDARDIZED DOCUMENT ANALYSIS & PRESENTATION

For each search query, follow this structure:

### 1. Document List & Summaries
- Present documents in a clearly organized list format
- Include the **document title** (not just ID) for each result
- Provide a 1-2 sentence summary of each document's content
- Example:
  \`\`\`
  **Documents found (3):**
  
  1. **"Soviet Arms Transfers to Cuba, 1960-1961"** - Intelligence assessment detailing weapons shipments from USSR to Cuba including artillery, aircraft, and small arms. Notes Castro's request for defensive capabilities against possible US intervention. {{cite:r2key/path/document1}}
  
  2. **"Khrushchev's Cuban Strategy, April 1962"** - ... {{cite:r2key/path/document2}}
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
  > From "Khrushchev's Strategic Calculations" (Oct 1962) {{cite:r2key/path/document3}}
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

### 4. Document Citations
- Include a citation {{cite:r2Key}} after every document mention
- Always include the full r2Key provided by the queryCollection tool
- Do not add any other parameters to the citation - just the r2Key

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

### 6. Synthesize Results
- After completing multiple searches, synthesize the results into a coherent analysis
- Present a holistic overview of the findings
- Highlight key patterns, contradictions, or gaps
- Provide a clear conclusion or summary of the research
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
              
              // Extract query details for logging
              const queryDetails: ConversationLog['queries']['details'] = [];
              
              // Get the last assistant message to extract tool invocations and log content
              const lastAssistantMessage = this.messages.findLast(m => m.role === 'assistant');
              const assistantMessageIndex = this.messages.length - 1; // Index of the last message (assistant)
              
              // Find the triggering user message
              const lastUserMessageIndex = this.messages.length - 2; // Last user message before the assistant response
              const lastUserMessage = this.messages[lastUserMessageIndex];
              
              // Log all messages for debugging ID issues
              logDebug("Chat.onChatMessage.onFinish", "Messages in this.messages array", { 
                messageCount: this.messages.length,
                messageIds: this.messages.map(m => ({ role: m.role, id: m.id, createdAt: m.createdAt }))
              });
              
              // Extract and truncate the user message content for logging
              const userMessageContent = lastUserMessage ? 
                (typeof lastUserMessage.content === 'string' ? 
                  lastUserMessage.content : 
                  JSON.stringify(lastUserMessage.content)) 
                : '';
              const truncatedUserMessage = userMessageContent.length > 1000 ? 
                userMessageContent.substring(0, 1000) + '...' : 
                userMessageContent;
              
              // Create the user message object for logging
              const userMsgObj: ConversationLog['messageObjects'][number] | null = lastUserMessage ? {
                index: lastUserMessageIndex,
                role: 'user',
                id: lastUserMessage.id || `msg-${lastUserMessageIndex}`, // Use ID or generate one
                content: truncatedUserMessage,
                timestamp: new Date(lastUserMessage.createdAt ?? Date.now()).toISOString()
              } : null;
              
              // Extract and truncate the assistant message content for logging
              const assistantMessageContent = lastAssistantMessage ?
                (typeof lastAssistantMessage.content === 'string' ? 
                  lastAssistantMessage.content : 
                  JSON.stringify(lastAssistantMessage.content)) 
                : '';
              const truncatedAssistantMessage = assistantMessageContent.length > 4000 ? 
                assistantMessageContent.substring(0, 4000) + '...' : 
                assistantMessageContent;

              // Create the assistant message object for logging
              const assistantMsgObj: ConversationLog['messageObjects'][number] | null = lastAssistantMessage ? {
                index: assistantMessageIndex,
                role: 'assistant',
                id: lastAssistantMessage.id,
                content: truncatedAssistantMessage,
                timestamp: new Date(lastAssistantMessage.createdAt ?? Date.now()).toISOString(),
                feedback: null // Initialize feedback as null
              } : null;

              // Filter out null messages before adding to array
              const newMessageObjects = [userMsgObj, assistantMsgObj].filter(Boolean) as ConversationLog['messageObjects'];

              // Extract query details from message parts instead of directly from toolInvocations
              if (lastAssistantMessage && Array.isArray(lastAssistantMessage.parts)) {
                lastAssistantMessage.parts.forEach(part => {
                  // Check if the part is a tool invocation for 'queryCollection'
                  if (part.type === 'tool-invocation' && part.toolInvocation?.toolName === 'queryCollection') {
                    const toolInvocation = part.toolInvocation;
                    const args = toolInvocation.args || {};
                    
                    // Only process if the tool invocation has a result
                    if (toolInvocation.state === 'result') {
                      // Access the result from toolInvocation.result
                      const result = toolInvocation.result || {}; // Use {} as default if result is null/undefined
                      
                      // Create a record of this query
                      const queryDetail = {
                        toolCallId: toolInvocation.toolCallId || '',
                        timestamp: new Date().toISOString(),
                        query: args.query || '',
                        userMessageIndex: lastUserMessageIndex, // Link to the user message that triggered this
                        userMessageId: lastUserMessage?.id || '', // Store the actual message ID for direct reference
                        dateFilters: {
                          authored_start_year_month: args.authored_start_year_month,
                          authored_end_year_month: args.authored_end_year_month,
                          authored_start_year_month_day: args.authored_start_year_month_day,
                          authored_end_year_month_day: args.authored_end_year_month_day,
                        },
                        documentResults: [] // Initialize as empty array
                      };
                      
                      // Extract document results if available and status is 'success'
                      if (result.status === 'success' && Array.isArray(result.documents)) {
                        queryDetail.documentResults = result.documents.map((doc: any) => {
                          // Extract chunk IDs, scores, and truncated texts from the document's chunks
                          const chunkIds: string[] = [];
                          const chunkScores: number[] = [];
                          const chunkTexts: string[] = [];
                          
                          if (doc.chunks && Array.isArray(doc.chunks)) {
                            doc.chunks.forEach((chunk: any) => {
                              if (chunk.id) {
                                chunkIds.push(chunk.id);
                                
                                // Capture score for each chunk if available
                                if (typeof chunk.score === 'number') {
                                  chunkScores.push(chunk.score);
                                }
                                
                                // Store the first 50 characters of text for context if available
                                if (chunk.text && typeof chunk.text === 'string') {
                                  const truncatedText = chunk.text.substring(0, 50) + (chunk.text.length > 50 ? '...' : '');
                                  chunkTexts.push(truncatedText);
                                }
                              }
                            });
                          }
                          
                          // Include more metadata from the document and file_info for better analysis
                          return {
                            doc_id: doc.file_info?.metadata?.doc_id || '', // Document ID like "Clinton-82559"
                            best_score: doc.best_score || 0,
                            chunk_ids: chunkIds,
                            chunk_scores: chunkScores, // Include chunk scores
                            // chunk_texts: chunkTexts, // Optionally include truncated texts for debugging
                            file_id: doc.file_info?.id || '', // File ID (UUID)
                            file_r2key: doc.file_info?.r2Key || '', // The R2 key path
                            metadata: { // Extract relevant metadata from file_info.metadata
                              title: doc.file_info?.metadata?.title || '',
                              authored_date: doc.file_info?.metadata?.authored || doc.file_info?.metadata?.date || '', // Check multiple fields for date
                              classification: doc.file_info?.metadata?.classification || ''
                              // Removed document_type as it's actually the document_id and now properly set above
                            }
                          };
                        });
                      } else if (result.status !== 'success') {
                        logInfo("Chat.onChatMessage.onFinish", "Query Collection tool did not succeed", { toolCallId: toolInvocation.toolCallId, status: result.status });
                      }
                      
                      queryDetails.push(queryDetail);
                    } else {
                       logDebug("Chat.onChatMessage.onFinish", "Skipping tool invocation part without result state", { toolCallId: toolInvocation.toolCallId, state: toolInvocation.state });
                    }
                  }
                });
              }
              
              // Find the last user message to calculate input characters
              const userInputChars = lastUserMessage ? 
                (typeof lastUserMessage.content === 'string' ? 
                  lastUserMessage.content.length : 
                  JSON.stringify(lastUserMessage.content).length) 
                : 0;
              
              // Calculate output characters using the existing lastAssistantMessage variable
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
                    withoutToolCalls: this.conversationLog.queries.withoutToolCalls + (queryHadToolCalls ? 0 : 1),
                    details: [...this.conversationLog.queries.details, ...queryDetails]
                  },
                  characters: {
                    input: this.conversationLog.characters.input + userInputChars,
                    output: this.conversationLog.characters.output + assistantOutputChars
                  },
                  messageObjects: [...(this.conversationLog.messageObjects || []), ...newMessageObjects]
                });
              }

              // Log the messages so we can verify the IDs being captured
              logDebug("Chat.onChatMessage.onFinish", "Saved message objects", {
                userMsgId: userMsgObj?.id,
                assistantMsgId: assistantMsgObj?.id, 
              });
              
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
    const url = new URL(request.url);
    logDebug("fetch", "Processing incoming request", { url: url.pathname, method: request.method });

    // Handle CORS preflight requests (OPTIONS) globally
    if (request.method === "OPTIONS") {
      return handleOptions(request);
    }

    // Feedback Endpoint Logic
    if (url.pathname === "/feedback" && request.method === "POST") {
      try {
        const { conversationId, messageId, messageIndex, feedback } = await request.json() as { 
          conversationId: string, 
          messageId?: string, 
          messageIndex?: number,
          feedback: 'like' | 'dislike' | null 
        };
        
        if (!conversationId || (messageId === undefined && messageIndex === undefined) || feedback === undefined) {
          logInfo("fetch:/feedback", "Missing required fields in feedback request", { conversationId, messageId, messageIndex, feedback });
          return new Response(JSON.stringify({ error: "Missing required fields: conversationId, messageId/messageIndex, feedback" }), { status: 400, headers: corsHeaders() });
        }

        // Decode conversation components
        const { userId, collectionId, convoId } = decodeHashedComponents(conversationId);
        const logId = `${userId}-${collectionId}-${convoId}`;

        // Retrieve the conversation log
        const logString = await env.CONVERSATION_LOGS.get(logId);
        if (!logString) {
          logError("fetch:/feedback", "Conversation log not found", null, { logId });
          return new Response(JSON.stringify({ error: "Conversation log not found" }), { status: 404, headers: corsHeaders() });
        }

        const log: ConversationLog = JSON.parse(logString);

        // Find the message and update feedback
        let messageUpdated = false;

        // First try to update by message index if provided
        if (messageIndex !== undefined) {
          // Find assistant messages only
          const assistantMessages = log.messageObjects.filter(msg => msg.role === 'assistant');
          
          // Check if the index is valid
          if (messageIndex >= 0 && messageIndex < assistantMessages.length) {
            const targetMessageId = assistantMessages[messageIndex].id;
            
            // Now update the actual message in the full array
            log.messageObjects = log.messageObjects.map(msg => {
              if (msg.id === targetMessageId && msg.role === 'assistant') {
                msg.feedback = feedback;
                messageUpdated = true;
                logInfo("fetch:/feedback", "Found and updated message by index", { 
                  index: messageIndex, 
                  msgId: msg.id 
                });
              }
              return msg;
            });
          } else {
            logError("fetch:/feedback", "Invalid assistant message index", null, { 
              messageIndex, 
              totalAssistantMessages: assistantMessages.length 
            });
          }
        }
                
        if (!messageUpdated) {
          // Log detailed debug info but don't block the request
          logError("fetch:/feedback", "Assistant message not found for feedback update", null, { 
            logId, 
            messageId,
            messageIndex,
            availableMessageIds: log.messageObjects
              .filter(m => m.role === 'assistant')
              .map((m, i) => ({ index: i, id: m.id }))
          });
          // Don't return error, just log it
        }

        // Update timestamp and save
        log.updatedAt = new Date().toISOString();
        await env.CONVERSATION_LOGS.put(logId, JSON.stringify(log));

        logInfo("fetch:/feedback", "Feedback recorded successfully", { 
          logId, 
          messageId, 
          messageIndex,
          feedback,
          updated: messageUpdated
        });
        
        return new Response(JSON.stringify({ success: true, updated: messageUpdated }), { status: 200, headers: corsHeaders() });

      } catch (error) {
        logError("fetch:/feedback", "Error processing feedback request", error);
        let errorMessage = "Internal server error";
        if (error instanceof SyntaxError) {
            errorMessage = "Invalid JSON payload";
            return new Response(JSON.stringify({ error: errorMessage }), { status: 400, headers: corsHeaders() });
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }
        return new Response(JSON.stringify({ error: errorMessage }), { status: 500, headers: corsHeaders() });
      }
    }

    // Document Click Tracking Endpoint
    if (url.pathname === "/document-click" && request.method === "POST") {
      try {
        const { conversationId, r2Key } = await request.json() as { 
          conversationId: string, 
          r2Key: string
        };
        
        if (!conversationId || !r2Key) {
          logInfo("fetch:/document-click", "Missing required fields in document click request", { conversationId, r2Key });
          return new Response(JSON.stringify({ error: "Missing required fields: conversationId, r2Key" }), { status: 400, headers: corsHeaders() });
        }

        // Decode conversation components
        const { userId, collectionId, convoId } = decodeHashedComponents(conversationId);
        const logId = `${userId}-${collectionId}-${convoId}`;

        // Retrieve the conversation log
        const logString = await env.CONVERSATION_LOGS.get(logId);
        if (!logString) {
          logError("fetch:/document-click", "Conversation log not found", null, { logId });
          return new Response(JSON.stringify({ error: "Conversation log not found" }), { status: 404, headers: corsHeaders() });
        }

        const log: ConversationLog = JSON.parse(logString);

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

        logInfo("fetch:/document-click", "Document click recorded successfully", { 
          logId, 
          r2Key
        });
        
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders() });

      } catch (error) {
        logError("fetch:/document-click", "Error processing document click request", error);
        let errorMessage = "Internal server error";
        if (error instanceof SyntaxError) {
            errorMessage = "Invalid JSON payload";
            return new Response(JSON.stringify({ error: errorMessage }), { status: 400, headers: corsHeaders() });
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }
        return new Response(JSON.stringify({ error: errorMessage }), { status: 500, headers: corsHeaders() });
      }
    }

    // Original Agent Routing Logic
    logDebug("fetch", "Checking environment variables");
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
    // Route the request to our agent or return 404 if not found
    const agentResponse = await routeAgentRequest(request, env);
    
    if (!agentResponse) {
      logError("fetch", "No response from routeAgentRequest", { request })
      return new Response("Not found", { status: 404, headers: corsHeaders() })
    }

    // Add CORS headers to the agent response
    const responseWithCors = new Response(agentResponse.body, agentResponse);
    Object.entries(corsHeaders()).forEach(([key, value]) => {
      responseWithCors.headers.set(key, value);
    });

    return responseWithCors;
  },
} satisfies ExportedHandler<Env>;

// Helper function for CORS headers
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*', // Allow all origins (adjust in production)
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization', // Add any other headers your frontend sends
  };
}

// Helper function to handle OPTIONS requests for CORS preflight
function handleOptions(request: Request) {
  // Ensure necessary headers are present for CORS preflight success
  if (
    request.headers.get('Origin') !== null &&
    request.headers.get('Access-Control-Request-Method') !== null &&
    request.headers.get('Access-Control-Request-Headers') !== null
  ) {
    // Respond with CORS headers
    return new Response(null, {
      headers: corsHeaders(),
    });
  } else {
    // Handle standard OPTIONS request
    return new Response(null, {
      headers: {
        Allow: 'GET, POST, OPTIONS',
      },
    });
  }
}
