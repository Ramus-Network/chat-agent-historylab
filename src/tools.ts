// tools.ts

/**
 * Tool definitions for the AI chat agent
 * Tools can either require human confirmation or execute automatically
 */
import { tool } from "ai";
import { z } from "zod";

import { agentContext, type Env } from "./server";
import { logDebug, logInfo } from "./shared"; 

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

// /**
//  * Get collection information from the D1 database
//  * Returns metadata about a collection including name, description, owner, etc.
//  */
// const getCollectionInfo = tool({
//   description: "get the collection information for a given collection id",
//   parameters: z.object({ collectionId: z.string() }),
//   execute: async ({ collectionId }) => {
//     logInfo("getCollectionInfo", `Getting collection information for collection: ${collectionId}`);
    
//     try {
//       const agent = getAgent();      
//       const db = agent.getDatabase();
//       const collection = await db
//         .prepare(`
//           SELECT 
//             id, name, description, owner_id, is_public, created_at, updated_at 
//           FROM collections 
//           WHERE id = ?
//         `)
//         .bind(collectionId)
//         .first();
      
//       if (!collection) {
//         return { error: `Collection with ID ${collectionId} not found` };
//       }

//       return {
//         id: collection.id,
//         name: collection.name,
//         description: collection.description,
//         owner_id: collection.owner_id,
//         is_public: Boolean(collection.is_public),
//         created_at: collection.created_at,
//         updated_at: collection.updated_at
//       };
//     } catch (error) {
//       logDebug("getCollectionInfo", `Error fetching collection: ${error}`);
//       return { error: "Failed to fetch collection information" };
//     }
//   },
// });


// // NOTE TO SELF: MAKE SURE THAT COLLECTION ID IS AN INDEXED FIELD IN THE DATABASE
// /**
//  * List up to 10 files from a collection with their metadata
//  */
// const listCollectionContents = tool({
//   description: "list the contents of a given collection by id",
//   parameters: z.object({ collectionId: z.string() }),
//   execute: async ({ collectionId }) => {
//     logInfo("listCollectionContents", `Listing contents of collection: ${collectionId}`);
    
//     try {
//       const agent = getAgent();
//       const db = agent.getDatabase();
      
//       const files = await db
//         .prepare(`
//           SELECT 
//             id, name, size, type, r2_key, collection_id, 
//             owner_id, status, created_at, updated_at
//           FROM files 
//           WHERE collection_id = ?
//           LIMIT 10
//         `)
//         .bind(collectionId)
//         .all();
      
//       if (!files?.results?.length) {
//         return { error: `No files found in collection ${collectionId}` };
//       }

//       return {
//         count: files.results.length,
//         files: files.results.map(file => ({
//           ...file,
//           created_at: file.created_at,
//           updated_at: file.updated_at
//         }))
//       };
//     } catch (error) {
//       logDebug("listCollectionContents", `Error fetching files: ${error}`);
//       return { error: "Failed to fetch collection contents" };
//     }
//   },
// });

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
      return { error: "Failed to get document text" };
    }
  },
});
/**
 * Query a given collection using a vector search
 * 
 * This tool allows for semantic searching through historical document collections with various filtering options:
 * - Use collectionId to specify which collection to search (typically "history-lab-1")
 * - Use query for the semantic search text
 * - Filter by corpus to target specific document collections based on the query context
 * - Filter by doc_id when looking for information within a specific document
 * - Filter by authored date range to find documents from specific time periods
 * 
 * The agent should use corpus filtering when the query relates to a specific domain:
 * - For questions about intelligence or CIA operations, filter by "cia" corpus
 * - For US foreign policy or State Department questions, use "frus" corpus
 * - For questions about Bill/Hillary Clinton or 1990s US policy, use "clinton" corpus
 * - For UN-related queries, use the "un" corpus
 * - For questions about World Bank or international development, use "worldbank" corpus
 * - For NATO-related questions, use "nato" corpus
 * - For Cabinet-level decisions, use "cabinet" corpus
 * - For Henry Kissinger-related questions, use "kissinger" corpus
 * 
 * Available corpora:
 * - cfpf: Central Foreign Policy Files (CFPF) - Collection of US State Department communications with diplomatic missions worldwide from 1973-1979, including cables and telegrams forming the backbone of US foreign policy records (1,670,290 documents)
 * - cia: CIA documents, declassified intelligence reports and assessments (~440K docs)
 * - frus: Foreign Relations of the United States - Diplomatic correspondence and State Department records (~159K docs)
 * - un: United Nations documents, resolutions, and reports (~93K docs)
 * - worldbank: World Bank reports on global development and economic policy (~68K docs)
 * - clinton: Documents from the Clinton administration (1990s) (~30K docs)
 * - nato: North Atlantic Treaty Organization documents on security and defense (~23K docs)
 * - cabinet: U.S. Cabinet meeting records and internal communications (~20K docs)
 * - cpdoc: Brazilian historical archives (Centro de Pesquisa e Documentação) (~6K docs)
 * - kissinger: Documents related to Henry Kissinger's diplomatic work (~2K docs)
 * - briefing: Government briefing documents and executive summaries (~924 docs)
 */
const queryCollection = tool({
  description: "Query historical document collections with semantic search and filtering options. When using this tool, be transparent about which filters you apply and why. For topic-specific queries, use the appropriate corpus filter (e.g., 'cia' for intelligence questions, 'clinton' for 1990s policy). For date-specific searches, use authored_start/authored_end with YYYY-MM-DD format.",
  parameters: z.object({ 
    collectionId: z.string().describe("Collection ID to search within"),
    query: z.string().describe("The semantic search query text"),
    corpus: z.string().optional().describe("Filter by specific corpus (e.g., 'cia', 'frus', 'clinton', 'un', 'worldbank', 'nato', 'cabinet', 'cfpf', 'cpdoc', 'kissinger', 'briefing') - use when query relates to a specific collection"),
    doc_id: z.string().optional().describe("Filter by specific document ID when looking for more information within a document"),
    authored_start: z.string().optional().describe("Start date for filtering documents (format: YYYY-MM-DD)"),
    authored_end: z.string().optional().describe("End date for filtering documents (format: YYYY-MM-DD)")
  }),
  execute: async ({ collectionId, query, corpus, doc_id, authored_start, authored_end }) => {
    // Log the search parameters
    logInfo(
      "queryCollection", 
      `Querying collection: ${collectionId} with query: ${query}` + 
      (corpus ? `, corpus: ${corpus}` : "") +
      (doc_id ? `, doc_id: ${doc_id}` : "") +
      (authored_start ? `, authored from: ${authored_start}` : "") +
      (authored_end ? `, to: ${authored_end}` : "")
    );

    try {
      const agent = getAgent();
      const vectorizeSearch = agent.getVectorizeSearch();
      
      // Define type for the filters object
      interface Filters {
        corpus?: string;
        doc_id?: string;
        authored?: {
          $gte?: number;
          $lte?: number;
        };
      }
      
      // Prepare filters for the search
      const filters: Filters = {};
      
      // Add corpus filter if specified
      if (corpus) {
        filters.corpus = corpus;
      }
      
      // Add document ID filter if specified
      if (doc_id) {
        filters.doc_id = doc_id;
      }
      
      // Add date range filters if specified
      if (authored_start || authored_end) {
        filters.authored = {};
        if (authored_start) {
          // conver to unix timestamp
          filters.authored.$gte = new Date(authored_start).getTime();
        }
        if (authored_end) {
          filters.authored.$lte = new Date(authored_end).getTime();
        }
      }
      
      // Create metadata object for the search if filters are present
      const metadata = Object.keys(filters).length > 0 ? { filter: filters } : undefined;
      
      // Log the complete search request for debugging
      logDebug("queryCollection", `Search request: {
        query: "${query}",
        collectionId: "${collectionId}",
        topK: 10,
        metadata: ${JSON.stringify(metadata)}
      }`);
      
      // Call the vector search with parameters
      // The findSimilarEmbeddings function accepts: (query, collectionId, topK?, metadata?)
      const results = await vectorizeSearch.findSimilarEmbeddings(
        query,          // The semantic search query
        collectionId,   // The collection ID to search within
        10,             // Top K results to return (default 10)
        metadata        // Optional metadata filters with corpus, doc_id, and authored date range
      );
      
      // Log the number of results returned
      logInfo("queryCollection", `Search returned ${results?.matches?.length || 0} results`);
      
      // Log detailed results for debugging
      logDebug("queryCollection", `Results: ${JSON.stringify(results)}`);
      return results;
    } catch (error) {
      logDebug("queryCollection", `Error querying collection: ${error}`);
      return { error: "Failed to query collection" };
    }
  },
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
  testTool
};

// /**
//  * Implementation of confirmation-required tools
//  * This object contains the actual logic for tools that need human approval
//  * Each function here corresponds to a tool above that doesn't have an execute function
//  */
export const executions = {
  getWeatherInformation: async ({ city }: { city: string }) => {
    logInfo("getWeatherInformation", `Getting weather information for city: ${city}`);
    return `The weather in ${city} is sunny`;
  },
};
