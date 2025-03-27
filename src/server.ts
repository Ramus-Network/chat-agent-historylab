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
  type Message,
  streamText,
  type StreamTextOnFinishCallback,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { processToolCalls } from "./utils";
import { tools, executions } from "./tools";
import { AsyncLocalStorage } from "node:async_hooks";
import { logDebug, logInfo } from "./shared";

// Environment variables type definition
export type Env = {
  OPENAI_API_KEY: string;
  BUCKET: R2Bucket;
  Chat: AgentNamespace<Chat>;
  VECTORIZE_SEARCH: {
    findSimilarEmbeddings(
      queries: string | string[], 
      collection_id: string, 
      topK?: number, 
      metadata?: { 
        filter?: {
          corpus?: string;
          doc_id?: string;
          authored?: {
            $gte?: number;
            $lte?: number;
          };
          [key: string]: any;
        } 
      }
    ): Promise<any>;
  }; 
};

const COLLECTION_ID = '80650a98-fe49-429a-afbd-9dde66e2d02b'; // history-lab-1

// we use ALS to expose the agent context to the tools
export const agentContext = new AsyncLocalStorage<Chat>();
/**
 * Chat Agent implementation that handles real-time AI chat interactions
 */
export class Chat extends AIChatAgent<Env> {

  public getBucket() {
    return this.env.BUCKET;
  }

  public getVectorizeSearch() {
    return this.env.VECTORIZE_SEARCH;
  }

  /**
   * Handles incoming chat messages and manages the response stream
   * @param onFinish - Callback function executed when streaming completes
   */

  // biome-ignore lint/complexity/noBannedTypes: <explanation>
  async onChatMessage(onFinish: StreamTextOnFinishCallback<{}>) {
    logInfo("Chat.onChatMessage", "Starting chat message processing");

    // const [userId, collectionId, convoId] = (this.name || "").split("-");
    const userId = "1";
    const collectionId = COLLECTION_ID;
    const convoId = "3";   
  
    logInfo("Chat.onChatMessage", "Connection info", { 
      userId, 
      collectionId, 
      convoId 
    });

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

          logInfo("Chat.onChatMessage", "Initializing OpenAI client");
          // Initialize OpenAI client with API key from environment
          const openai = createOpenAI({
            apiKey: this.env.OPENAI_API_KEY,
          });

          // Cloudflare AI Gateway
          // const openai = createOpenAI({
          //   apiKey: this.env.OPENAI_API_KEY,
          //   baseURL: this.env.GATEWAY_BASE_URL,
          // });

          logDebug("Chat.onChatMessage", "Starting AI stream", { model: "gpt-4o-2024-11-20" });
          // Stream the AI response using GPT-4o
          const result = streamText({
            model: openai("gpt-4o-2024-11-20"),
            system: `
              You are HistoryLab AI, an advanced research assistant specialized in analyzing historical documents and helping users explore declassified archives.

              YOUR ROLE:
              You help users discover, search, and analyze historical documents across multiple government, diplomatic, and international organization archives. Your primary function is to assist researchers, students, and history enthusiasts in finding relevant historical information by translating their research questions into effective semantic searches of the document database.

              AVAILABLE TOOLS:
              You have access to the following search tool:

              - queryCollection: This tool allows you to perform semantic searches through historical document collections with various filtering options. When using this tool, be transparent with the user about which filters you're applying and why. The parameters include:
                * collectionId: Always use "history-lab-1" unless instructed otherwise
                * query: The semantic search text (craft this carefully for best results)
                * corpus: Optional filter for specific document collections (see below)
                * doc_id: Optional filter for a specific document ID
                * authored_start/authored_end: Optional date range filters (YYYY-MM-DD format)

              - getDocumentText: This tool allows you to get the text of a given document from the R2 bucket using the file key path. The parameters include:
                * fileKey: The file key path of the document to get the text of

              DOCUMENT COLLECTIONS (CORPORA):
              You have access to the following historical document collections:
              - cfpf: Central Foreign Policy Files (1.67M documents) - US State Department communications with diplomatic missions worldwide (1973-1979), including cables and telegrams
              - cia: CIA documents (~440K) - Declassified intelligence reports and assessments
              - frus: Foreign Relations of the United States (~159K) - Diplomatic correspondence and State Department records
              - un: United Nations documents (~93K) - Resolutions, reports, and official communications
              - worldbank: World Bank reports (~68K) - Documents on global development and economic policy
              - clinton: Clinton administration documents (~30K) - Records from the 1990s US presidency
              - nato: NATO documents (~23K) - Security and defense policy documents
              - cabinet: US Cabinet meeting records (~20K) - Internal communications and policy discussions
              - cpdoc: Brazilian historical archives (~6K) - Centro de Pesquisa e Documentação materials
              - kissinger: Documents on Henry Kissinger's diplomatic work (~2K)
              - briefing: Government briefing documents and executive summaries (~924)

              SEARCH GUIDANCE:
              1. BE TRANSPARENT: Always tell the user exactly what query and filters you're using and why.
              2. START BROAD: Begin with general searches without unnecessary filters, then narrow down if needed.
              3. USE CORPUS FILTERS STRATEGICALLY: Apply corpus filters only when the query clearly relates to a specific domain:
                 - For intelligence or CIA questions → use "cia" corpus
                 - For US foreign policy or State Department questions → use "frus" corpus
                 - For 1990s US policy or Clinton administration → use "clinton" corpus
                 - For UN-related queries → use "un" corpus
                 - For World Bank or development questions → use "worldbank" corpus
                 - For NATO security matters → use "nato" corpus
                 - For US Cabinet decisions → use "cabinet" corpus
                 - For Kissinger-related topics → use "kissinger" corpus
              4. USE DATE FILTERS when the question specifically relates to events in a particular time period.
              5. SUGGEST SEARCH STRATEGIES to the user if initial results aren't helpful.

              QUERY FORMULATION EXAMPLES:
              - User asks: "Tell me about the Cuban Missile Crisis"
                Bad query: "Cuban Missile Crisis information"
                Good query: "Details, negotiations, and diplomatic communications regarding the Cuban Missile Crisis"
                
              - User asks: "What did the CIA know about Soviet nuclear capabilities?"
                Bad query: "CIA Soviet nuclear information"
                Good query: "CIA assessment of Soviet Union nuclear weapons capabilities and development"
                Appropriate corpus filter: "cia"
                
              - User asks: "How did the Clinton administration address the Balkans conflict?"
                Bad query: "Clinton Balkans"
                Good query: "Clinton administration policy, decisions, and diplomatic efforts regarding the Balkans conflict and Yugoslavia"
                Appropriate corpus filter: "clinton"

              Always adapt your search strategy based on the results you receive. If a search doesn't yield useful results, try reformulating the query or adjusting filters. Explain your reasoning to the user.

              RESPONSE FORMAT:
              - Use markdown formatting for the response.
              - Make sure to cite your sources. Provide a link to the document using the following format: [View Document](https://r2-text-viewer.nchimicles.workers.dev/{file_key}) (e.g. https://r2-text-viewer.nchimicles.workers.dev/0000000001/80650a98-fe49-429a-afbd-9dde66e2d02b/000062a6-7ae7-4043-8d97-9c6e4012bb1b/507922_un.txt)

              IMPORTANT INFORMATION:              
              - Collection ID: ${collectionId}                         
              `,
            messages: processedMessages,
            tools,
            onFinish,
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
