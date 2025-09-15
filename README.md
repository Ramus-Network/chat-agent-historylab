# HistoryLab AI: A Production AI Research Assistant Example

> **🎯 This is a Real-World Example Implementation**
> This repository showcases **HistoryLab AI**, a production AI research assistant built by Columbia University's History Lab. It demonstrates how to build sophisticated AI agents using Cloudflare's infrastructure. This is **not a template to copy** but rather an **inspiring example** of what's possible when building advanced AI systems.

![HistoryLab AI](https://github.com/user-attachments/assets/f6d99eeb-1803-4495-9c5e-3cf07a37b402)

## About HistoryLab AI

**HistoryLab AI** is a research assistant that provides natural language access to nearly 5 million declassified historical documents (18+ million pages). Built by [Columbia University's History Lab](https://lab.history.columbia.edu/), it demonstrates advanced retrieval-augmented generation (RAG) techniques for academic research.

### What Makes This Example Special

- **🔍 Advanced RAG Implementation**: Semantic search across 5M+ documents using vector embeddings
- **📚 Multi-Collection Architecture**: Presidential Daily Briefings, CIA files, State Department cables, UN Archives, and more
- **💬 Real-time Chat Interface**: Streaming AI responses with citation handling
- **🛠️ Sophisticated Tool System**: Vector search, document retrieval, feedback collection
- **🔐 Production Authentication**: Google OAuth integration with session management
- **💳 Credits System**: Point-based usage tracking with financial service integration
- **⚡ Cloudflare Infrastructure**: Workers, Durable Objects, R2, KV, and external service bindings

## Architecture Overview

This system demonstrates a complex multi-service architecture:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   React Client  │───▶│  Chat Agent      │───▶│  Vector Search  │
│   (Frontend)    │    │  (Durable Object)│    │  Worker         │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   Document       │    │                      │
                       │   Storage (R2)   │                     │
                       └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │  Conversation    │
                       │  Logs (KV)       │
                       └──────────────────┘
```

## Key Implementation Insights

### 1. Advanced Tool Design

The system implements three sophisticated tools that showcase different patterns:

#### Vector Search Tool (`queryCollection`)
```typescript
// Demonstrates: External service integration, user credit validation, complex filtering
const queryCollection = tool({
  description: "Perform semantic searches through historical document collections",
  parameters: z.object({
    query: z.string(),
    doc_id: z.string().optional(),
    authored_start_year_month: z.string().optional(),
    authored_end_year_month: z.string().optional(),
  }),
  execute: async ({ query, doc_id, authored_start_year_month, authored_end_year_month }) => {
    // 1. Validate user credits via RPC to financial worker
    // 2. Build complex search filters
    // 3. Execute vector search via service binding
    // 4. Deduct credits on success
    // 5. Return structured results
  }
});
```

**Key Learnings:**
- Pre-validation of user permissions/credits before expensive operations
- Complex parameter handling with optional date filtering
- External service integration via Cloudflare service bindings
- Automatic cost tracking and deduction

#### Document Retrieval Tool (`getDocumentText`)
```typescript
// Demonstrates: Simple R2 integration, error handling
const getDocumentText = tool({
  description: "get the text of a given document from the R2 bucket",
  parameters: z.object({ r2Key: z.string() }),
  execute: async ({ r2Key }) => {
    const bucket = agent.getBucket();
    const file = await bucket.get(r2Key);
    return file ? await file.text() : { error: "File not found" };
  }
});
```

**Key Learnings:**
- Direct cloud storage integration
- Graceful error handling
- Agent context access patterns

#### Feedback System (`submitFeedback`)
```typescript
// Demonstrates: Human-in-the-loop, conversation filtering, KV storage
const submitFeedback = tool({
  description: "Submits feedback about technical issues or user experience",
  parameters: z.object({
    description: z.string()
  }),
  // No execute function = requires human confirmation
});

export const executions = {
  submitFeedback: async ({ description }) => {
    // 1. Filter conversation history for privacy
    // 2. Generate unique report ID
    // 3. Store in KV with metadata
    // 4. Return confirmation
  }
};
```

**Key Learnings:**
- Human-in-the-loop confirmation patterns
- Conversation filtering for data privacy
- Structured feedback collection
- KV storage for operational data

### 2. Real-time Chat Architecture

The chat system demonstrates sophisticated real-time patterns:

```typescript
// In Chat Durable Object
async onChatMessage(onFinish: StreamTextOnFinishCallback) {
  return agentContext.run(this, async () => {
    const dataStreamResponse = createDataStreamResponse({
      execute: async (dataStream) => {
        // Process pending tool calls (human-in-the-loop)
        const processedMessages = await processToolCalls({
          messages: this.messages,
          dataStream,
          tools,
          executions,
        });

        // Stream AI response with tool integration
        const result = streamText({
          model: openai("gpt-4o-2024-11-20"),
          system: getSystemPrompt(),
          messages: processedMessages,
          tools,
          onFinish: async (event) => {
            // Log conversation for analytics
            await this.conversationLogger.processStreamCompletion(
              event, this.messages, this.userId, this.collectionId, this.convoId
            );
          }
        });

        result.mergeIntoDataStream(dataStream);
      }
    });
  });
}
```

**Key Learnings:**
- AsyncLocalStorage for agent context sharing
- Tool call processing with human confirmation
- Real-time streaming with conversation logging
- Error handling in streaming contexts

### 3. Production Frontend Patterns

The React frontend showcases several production-ready patterns:

#### Smart Citation Handling
```typescript
// Automatic citation rendering in markdown
// {{cite:r2Key}} becomes clickable footnote
useEffect(() => {
  const handleGlobalCitationClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('citation')) {
      const r2Key = target.getAttribute('data-r2key');
      if (r2Key) {
        window.open(`https://doc-viewer.ramus.network/${r2Key}`, '_blank');
      }
    }
  };
  document.addEventListener('click', handleGlobalCitationClick);
}, []);
```

#### Connection Health Management
```typescript
// Keep-alive mechanism for Durable Objects
useEffect(() => {
  const sendKeepAlive = async () => {
    // Ping every 45 seconds to maintain connection
  };
  const interval = setInterval(sendKeepAlive, 45000);
  return () => clearInterval(interval);
}, [agent, conversationId]);
```

#### Progressive Loading States
```typescript
// Multiple loading states: submitting -> streaming -> ready
const [isSubmitting, setIsSubmitting] = useState(false);
const [isLimbo, setIsLimbo] = useState(false);

// Timeout detection for stuck requests
useEffect(() => {
  if (status === 'submitted') {
    const timeout = setTimeout(() => {
      console.log('Status remained submitted too long - reloading');
      window.location.reload();
    }, 10000);
    return () => clearTimeout(timeout);
  }
}, [status]);
```

### 4. Authentication & Session Management

The system implements a sophisticated OAuth flow:

```typescript
// PKCE flow with session management
export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Auto-refresh tokens before expiration
  useEffect(() => {
    const checkAndRefreshToken = async () => {
      const token = sessionStorage.getItem(AUTH_CONFIG.TOKEN_KEY);
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const timeUntilExpiry = (payload.exp * 1000) - Date.now();

        if (timeUntilExpiry < AUTH_CONFIG.REFRESH_BUFFER) {
          // Refresh token logic
        }
      }
    };

    const interval = setInterval(checkAndRefreshToken, 60000);
    return () => clearInterval(interval);
  }, []);
};
```

## System Prompt Engineering

The system includes a sophisticated 279-line system prompt that demonstrates:

- **Research Planning**: Multi-step query decomposition
- **Search Strategy**: Date filtering, query optimization
- **Citation Standards**: Structured document attribution
- **Error Handling**: Graceful failure recovery
- **User Interaction**: Clarifying questions, feedback loops

## Production Deployment Considerations

### Cloudflare Configuration
```jsonc
{
  "name": "history-lab-chat-agent-3",
  "durable_objects": {
    "bindings": [{ "name": "Chat", "class_name": "Chat" }]
  },
  "r2_buckets": [
    { "binding": "BUCKET", "bucket_name": "ramus-files" }
  ],
  "services": [
    { "binding": "VECTORIZE_SEARCH", "service": "vector-search-worker-3" }
  ],
  "kv_namespaces": [
    { "binding": "CONVERSATION_LOGS", "id": "..." },
    { "binding": "FEEDBACK_LOGS", "id": "..." }
  ]
}
```

### Environment Variables
```bash
# AI Model API Keys
OPENAI_API_KEY=sk-...
GOOGLE_GENERATIVE_AI_API_KEY=...

# External Service URLs
VECTORIZE_SEARCH_URL=https://...
FINANCIAL_WORKER_URL=https://...
```

## What You Can Learn From This Example

### For AI Agent Builders:
1. **Tool Design Patterns**: Simple tools vs. complex workflows
2. **Human-in-the-Loop**: When and how to require confirmations
3. **External Service Integration**: Service bindings, RPC patterns
4. **Context Management**: Agent state, conversation history
5. **Error Handling**: Graceful degradation, user feedback

### For Frontend Developers:
1. **Real-time UI**: Streaming responses, progressive loading
2. **Citation Systems**: Dynamic content rendering
3. **Connection Management**: Keep-alive, reconnection logic
4. **Authentication Flow**: OAuth, session management
5. **Mobile Considerations**: iframe detection, responsive design

### For System Architects:
1. **Multi-Worker Architecture**: Service decomposition
2. **Data Storage Patterns**: R2, KV, Durable Objects
3. **Cost Management**: Credit systems, usage tracking
4. **Observability**: Logging, monitoring, debugging
5. **Scalability**: Stateful vs. stateless components

## Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Backend**: Cloudflare Workers, Durable Objects
- **AI**: OpenAI GPT-4, Google Gemini, Vercel AI SDK
- **Storage**: Cloudflare R2, KV
- **Search**: Custom vector search worker
- **Auth**: Google OAuth with PKCE
- **Build**: Vite, TypeScript, Biome

## Repository Structure

```
src/
├── app.tsx                 # Main React application
├── server/
│   ├── index.ts           # Worker entry point
│   ├── models/chat.ts     # Chat Durable Object
│   ├── config.ts          # System prompt & settings
│   ├── handlers/          # Request handlers
│   ├── services/          # Business logic
│   └── utils/             # Helper functions
├── components/
│   ├── chat/              # Chat UI components
│   ├── auth/              # Authentication UI
│   └── ui/                # Reusable components
├── hooks/                 # React hooks
├── tools.ts               # AI tool definitions
└── config.ts              # App configuration
```

## Key Dependencies

```json
{
  "agents-sdk": "^0.0.23",           // Cloudflare Agents framework
  "ai": "^4.1.51",                  // Vercel AI SDK
  "@ai-sdk/openai": "^1.2.0",       // OpenAI integration
  "@ai-sdk/google": "^1.2.10",      // Google AI integration
  "react": "^19.0.0",               // Frontend framework
  "react-router-dom": "^7.5.3",     // Client-side routing
  "zod": "^3.24.2"                  // Schema validation
}
```

## Running This Example

> **⚠️ Important**: This is a production system with specific external dependencies. You cannot run it directly without:
> - Vector search worker deployment
> - Document storage setup
> - Authentication service configuration

To explore the code:

```bash
# Install dependencies
npm install

# View the code structure
npm run check

# Build (will fail without proper env setup)
npm run deploy
```

## Inspiration for Your Own System

Instead of copying this code, use it as inspiration for:

1. **RAG System Architecture**: How to structure document retrieval
2. **Tool Design Patterns**: Building AI tools that work well
3. **Production Considerations**: Authentication, logging, error handling
4. **UI/UX Patterns**: Real-time chat, citation handling
5. **Cloudflare Integration**: Workers, Durable Objects, service bindings

## Related Resources

- [Columbia University History Lab](https://lab.history.columbia.edu/)
- [HistoryLab AI (Live System)](https://history-lab.ramus.network)
- [Cloudflare Agents SDK](https://github.com/cloudflare/agents)
- [Ramus Network](https://landing.ramus.network)

## License

MIT License - This code is provided as an educational example. See the live system's terms of service for usage of the actual HistoryLab AI service.

---

*Built by the [Columbia University History Lab](https://lab.history.columbia.edu/) team, powered by the [Ramus Network](https://landing.ramus.network) infrastructure.*