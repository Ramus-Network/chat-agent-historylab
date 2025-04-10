// app.tsx

// React hooks for managing component state and lifecycle
import { useEffect, useState, useRef, useCallback } from "react";
// Hooks from Cloudflare Agents SDK for frontend integration
import { useAgent } from "agents-sdk/react";
// Hook to manage chat interactions with the agent
import { useAgentChat } from "agents-sdk/ai-react";
// Type definition for chat messages
import type { Message } from "@ai-sdk/react";
// Constants shared between frontend and backend for approval states

// Type import for available tools defined in tools.ts
import type { tools } from "./tools";
// UI components from the component library
// Markdown rendering components
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
// Icons from the Lucide icon library
import {
  Clock,
  CommandIcon,
  FileText,
  Mic,
  Send,
  Trash,
  Link as LinkIcon,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";

// Collection ID constant (matches the server-side constant)
const COLLECTION_ID = '80650a98-fe49-429a-afbd-9dde66e2d02b'; // history-lab-1

// List of tools that require human confirmation before execution
// This is used to determine which tool invocations should display confirmation UI
// These tools must have corresponding executions in the server-side executions object
const toolsRequiringConfirmation: (keyof typeof tools)[] = [
  "testTool", // This matches the testTool defined in tools.ts
];

// Simple hash function to obfuscate the ID components
function hashComponents(userId: string, collectionId: string, conversationId: string): string {
  // Create a string with all components separated by a delimiter that won't appear in the IDs
  const combined = `${userId}|${collectionId}|${conversationId}`;
  
  // Use btoa for base64 encoding (simple obfuscation, not secure encryption)
  // Note: For environments where btoa is not available, we would need to use 
  // a different approach, like Buffer in Node.js. Here we're in a browser context.
  // For true security, we'd use a proper encryption algorithm.
  return btoa(combined);
}

// Function to decode the hashed components (server-side counterpart)
function decodeHashedComponents(hash: string): { userId: string, collectionId: string, conversationId: string } {
  try {
    // Decode the base64 string
    const decoded = atob(hash);
    
    // Split by the delimiter
    const [userId, collectionId, conversationId] = decoded.split('|');
    
    return { userId, collectionId, conversationId };
  } catch (e) {
    console.error('Failed to decode hashed components:', e);
    // Return fallback values if decoding fails
    return { 
      userId: 'unknown', 
      collectionId: COLLECTION_ID, 
      conversationId: `fallback-${Date.now()}`
    };
  }
}

export default function Chat() {
  // State for theme management (dark/light mode)
  // Uses localStorage to persist user preference
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    // Check localStorage first, default to dark if not found
    const savedTheme = localStorage.getItem("theme");
    return (savedTheme as "dark" | "light") || "dark";
  });
  
  // Get or create userId from cookies
  const [userId, setUserId] = useState<string>(() => {
    // Try to get userId from cookies
    const cookies = document.cookie.split(';').map(c => c.trim());
    const userIdCookie = cookies.find(c => c.startsWith('historylab_user_id='));
    
    if (userIdCookie) {
      return userIdCookie.split('=')[1];
    }
    
    // If no userId found, generate a new one
    const newUserId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Set the cookie (expires in 1 year)
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    document.cookie = `historylab_user_id=${newUserId};expires=${expiryDate.toUTCString()};path=/;SameSite=Strict`;
    
    return newUserId;
  });
  
  // State for tracking whether the URL has been copied (for share button feedback)
  const [urlCopied, setUrlCopied] = useState(false);
  
  // Reference to the textarea for auto-resizing
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // State to track if textarea has reached max height
  const [isAtMaxHeight, setIsAtMaxHeight] = useState(false);
  
  // State for conversation ID (from URL query parameter or newly generated)
  const [conversationId, setConversationId] = useState(() => {
    // Check if there's an ID in the URL query parameter
    const urlParams = new URLSearchParams(window.location.search);
    const idFromUrl = urlParams.get('id');
    
    // If we have an ID and it's a hash we created, use it
    if (idFromUrl && idFromUrl.length > 20) {
      try {
        // Try to decode it to ensure it's valid
        const decoded = decodeHashedComponents(idFromUrl);
        return idFromUrl;
      } catch (e) {
        console.error('Invalid conversation ID format:', e);
        // Fall through to create a new ID
      }
    }
    
    // Create a new conversation-specific ID
    const newConvoId = `convo_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Hash the components
    const hashedId = hashComponents(userId, COLLECTION_ID, newConvoId);
    
    // Update the URL with the new ID as a query parameter
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('id', hashedId);
    window.history.pushState({}, '', newUrl.toString());
    
    return hashedId;
  });
  
  // State for toggling debug information display
  const [showDebug, setShowDebug] = useState(false);
  
  // Reference to the bottom of the messages container for auto-scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Function to scroll to the bottom of messages
  // Wrapped in useCallback to avoid unnecessary re-renders
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Effect to apply theme classes to the document
  // Runs on mount and whenever theme changes
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    }

    // Save theme preference to localStorage
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Scroll to bottom on component mount
  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  // Function to toggle between dark and light theme
  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
  };

  // Function to create a new conversation ID
  const createNewConversation = () => {
    // Create a new conversation-specific ID
    const newConvoId = `convo_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Hash the components 
    const hashedId = hashComponents(userId, COLLECTION_ID, newConvoId);
    
    // Update state and URL
    setConversationId(hashedId);
    
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('id', hashedId);
    window.history.pushState({}, '', newUrl.toString());
    
    // Clear history
    clearHistory();
    
    return hashedId;
  };

  // Function to share current conversation URL
  const shareConversationUrl = () => {
    navigator.clipboard.writeText(window.location.href);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000); // Reset copied state after 2 seconds
  };

  // Initialize the agent connection
  // This connects to the backend Chat class in server.ts
  // The 'chat' parameter maps to the Chat class defined in server.ts
  // The 'name' parameter is used to identify this specific agent instance
  const agent = useAgent({
    agent: "chat",
    name: conversationId // Now contains all components hashed
  });

  // Hook to manage the chat state and interactions
  // This communicates with the backend via the agent connection
  const {
    messages: agentMessages,       // Array of message objects from the chat
    input: agentInput,             // Current input field value
    handleInputChange: handleAgentInputChange,  // Handler for input changes
    handleSubmit: handleAgentSubmit,            // Handler for form submission
    addToolResult,                 // Function to add tool execution results
    clearHistory,                  // Function to clear chat history
    status,                        // Current status of the chat: "ready", "submitted", "streaming", or "error"
  } = useAgentChat({
    agent,                         // The agent connection initialized above
    maxSteps: 5,                   // Maximum number of steps for AI processing
  });

  // Auto-resize the textarea whenever input changes
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    // Function to adjust height based on content
    const adjustHeight = () => {
      // Store the current scroll position
      const scrollPos = window.scrollY;
      
      // Reset height to measure the scrollHeight accurately
      textarea.style.height = "40px";
      
      // Only grow if content exceeds the single line
      if (textarea.scrollHeight > 40) {
        // Limit the max height
        const newHeight = Math.min(textarea.scrollHeight, 200);
        textarea.style.height = `${newHeight}px`;
        
        // Check if we've reached max height
        setIsAtMaxHeight(textarea.scrollHeight >= 200);
      } else {
        setIsAtMaxHeight(false);
      }
      
      // Restore scroll position to prevent page jump
      window.scrollTo(0, scrollPos);
    };
    
    adjustHeight();
    
    // Add resize event listener for window resizing
    window.addEventListener("resize", adjustHeight);
    return () => window.removeEventListener("resize", adjustHeight);
  }, [agentInput]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const idFromUrl = urlParams.get('id');
      
      if (idFromUrl && idFromUrl.length > 20) {
        try {
          // Try to decode it to ensure it's valid
          const decoded = decodeHashedComponents(idFromUrl);
          setConversationId(idFromUrl);
          clearHistory(); // Clear and reload chat for the new ID
        } catch (e) {
          console.error('Invalid conversation ID from URL:', e);
          // Create a new conversation if the ID is invalid
          createNewConversation();
        }
      } else {
        // Create a new conversation if no ID is found
        createNewConversation();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [clearHistory]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    agentMessages.length > 0 && scrollToBottom();
  }, [agentMessages, scrollToBottom]);

  // Format timestamp for message display
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Render message content with styling and markdown support
  const renderMessageContent = (text: string, messageId: string) => {
    return (
      <div className="whitespace-pre-wrap break-words text-[#5cff5c] markdown-condensed">
        <ReactMarkdown 
          rehypePlugins={[rehypeRaw]} 
          remarkPlugins={[remarkGfm]}
          components={{
            // Style different markdown elements while maintaining the terminal green color
            h1: ({node, ...props}) => <h1 className="text-[#5cff5c] font-bold" {...props} />,
            h2: ({node, ...props}) => <h2 className="text-[#5cff5c] font-bold" {...props} />,
            h3: ({node, ...props}) => <h3 className="text-[#5cff5c] font-bold" {...props} />,
            h4: ({node, ...props}) => <h4 className="text-[#5cff5c] font-bold" {...props} />,
            p: ({node, ...props}) => <p className="text-[#5cff5c]" {...props} />,
            a: ({node, ...props}) => <a className="markdown-link" {...props} />,
            strong: ({node, ...props}) => <strong className="text-[#5cff5c] font-bold" {...props} />,
            em: ({node, ...props}) => <em className="text-[#5cff5c] italic" {...props} />,
            ul: ({node, ...props}) => <ul className="text-[#5cff5c] list-disc" {...props} />,
            ol: ({node, ...props}) => <ol className="text-[#5cff5c] list-decimal" {...props} />,
            li: ({node, ...props}) => <li className="text-[#5cff5c]" {...props} />,
            blockquote: ({node, ...props}) => <blockquote className="markdown-blockquote text-[#5cff5c]" {...props} />,
            code: ({node, inline, className, ...props}: any) => 
              inline 
                ? <code className="markdown-code text-[#5cff5c]" {...props} />
                : <code className="markdown-code-block text-[#5cff5c] block" {...props} />,
            pre: ({node, ...props}) => <pre className="markdown-code-block text-[#5cff5c]" {...props} />,
            table: ({node, ...props}) => <table className="markdown-table text-[#5cff5c]" {...props} />,
            th: ({node, ...props}) => <th className="text-[#5cff5c]" {...props} />,
            td: ({node, ...props}) => <td className="text-[#5cff5c]" {...props} />,
            hr: ({node, ...props}) => <hr className="border-[#5cff5c]/30 my-2" {...props} />,
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    );
  };

  // Render tool invocation with appropriate UI
  const renderToolInvocation = (toolInvocation: any, messageId: string, index: number) => {
    // Simple rendering for tool invocations
    return (
      <div key={`${messageId}-tool-${index}`} className="bg-black/40 p-2 my-2 document-border">
        <div className="font-mono text-xs text-[#E0E0E0] mb-1">
          Tool: {toolInvocation.toolName}
        </div>
        {toolInvocation.args && Object.keys(toolInvocation.args).length > 0 && (
          <div className="font-mono text-xs text-[#A0A0A0] mb-1 mt-1">
            <div className="mb-1">Parameters:</div>
            {Object.entries(toolInvocation.args).map(([key, value]) => (
              <div key={key} className="pl-2 text-[10px] flex flex-wrap">
                <span className="text-[#E0E0E0] mr-1">{key}:</span>
                <span className="text-[#5cff5c]">{typeof value === 'string' ? value : JSON.stringify(value)}</span>
              </div>
            ))}
          </div>
        )}
        {toolInvocation.state === 'result' && (
          <div className="font-mono text-xs text-[#A0A0A0] mt-1">
            <div className="mb-1">Result:</div>
            <div className="pl-2 text-[10px]">
              {toolInvocation.result && typeof toolInvocation.result === 'object' && 'matches' in toolInvocation.result ? (
                <div className="text-[#5cff5c]">
                  <div className="mb-1">Found {toolInvocation.result.matches?.length || 0} documents:</div>
                  {toolInvocation.result.matches?.map((match: any, i: number) => (
                    <div key={i} className="mb-1 pl-2">
                      <span className="text-[#E0E0E0]">{i+1}. </span>
                      {match.metadata?.file_key ? (
                        <a 
                          href={`https://r2-text-viewer.nchimicles.workers.dev/${match.metadata.file_key}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#5cff5c] hover:underline"
                        >
                          {match.metadata?.doc_id || 'Unknown'}
                        </a>
                      ) : (
                        <span className="text-[#5cff5c]">{match.metadata?.doc_id || 'Unknown'}</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-[#5cff5c]">
                  {JSON.stringify(toolInvocation.result).substring(0, 200)}{JSON.stringify(toolInvocation.result).length > 200 ? '...' : ''}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // State for tracking which message content has been copied
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  
  // Function to extract text content from message parts
  const extractMessageText = (message: Message): string => {
    if (!message.parts || message.parts.length === 0) return '';
    
    return message.parts
      .filter(part => part.type === 'text')
      .map(part => (part.type === 'text' ? part.text : ''))
      .join('\n\n');
  };
  
  // Function to copy message content to clipboard
  const copyMessageContent = (message: Message) => {
    const textContent = extractMessageText(message);
    navigator.clipboard.writeText(textContent);
    setCopiedMessageId(message.id);
    setTimeout(() => setCopiedMessageId(null), 2000); // Reset after 2 seconds
  };
  
  // Render copy button for messages
  const renderCopyButton = (message: Message) => {
    return (
      <div className="flex justify-end mt-2">
        <button
          onClick={() => copyMessageContent(message)}
          className="inline-flex h-7 items-center justify-center document-border bg-black/40 text-xs font-medium transition-colors hover:bg-[#5cff5c]/10 px-2 text-[#E0E0E0] gap-1"
          aria-label="Copy message content"
        >
          {copiedMessageId === message.id ? (
            <>
              <Check className="h-3 w-3 text-[#5cff5c]" />
              <span className="text-[10px]">COPIED</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span className="text-[10px]">COPY</span>
            </>
          )}
        </button>
      </div>
    );
  };

  // Add scrollbar hiding styles to document
  useEffect(() => {
    // Only add/remove style if needed based on maxHeight state
    if (isAtMaxHeight) return;
    
    // Create style element for webkit browsers
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      textarea::-webkit-scrollbar {
        display: none;
      }
    `;
    document.head.appendChild(styleElement);
    
    // Clean up on unmount
    return () => {
      document.head.removeChild(styleElement);
    };
  }, [isAtMaxHeight]);

  // Render the chat interface
  return (
    <div className="flex min-h-screen w-full flex-col bg-background antialiased transition-all pb-0">
      <header className="sticky top-0 z-10 bg-black/80 backdrop-blur-md border-b border-white/10 shadow-lg">
        <div className="container flex h-14 items-center px-4 md:px-6">
          <div className="flex flex-1 items-center space-x-2 md:justify-between justify-end">
            <div className="w-full flex justify-between items-center">
              <div className="flex items-center space-x-2">
                {/* <FileText className="h-5 w-5 text-[#5cff5c] mr-1" /> */}
                <span className="font-mono text-xl text-[#E0E0E0] tracking-wider">
                  HISTORY LAB
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  {/* Chat status indicator */}
                  {status === "streaming" && (
                    <div className="px-2 py-1 text-xs font-mono text-[#5cff5c] bg-black/40 document-border">
                      Processing...
                    </div>
                  )}
                  {status === "ready" && agentMessages.length > 0 && (
                    <div className="px-2 py-1 text-xs font-mono text-[#5cff5c] bg-black/40 document-border">
                      Ready
                    </div>
                  )}
                  {status === "error" && (
                    <div className="px-2 py-1 text-xs font-mono text-red-500 bg-black/40 document-border">
                      Error
                    </div>
                  )}
                  
                  <button
                    onClick={shareConversationUrl}
                    className="inline-flex h-9 items-center justify-center document-border bg-black/40 text-sm font-medium ring-offset-background transition-colors hover:bg-[#5cff5c]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 px-2 text-[#E0E0E0] text-xs"
                  >
                    <LinkIcon className="h-4 w-4 icon-visible mr-1" />
                    <span>{urlCopied ? "COPIED!" : "COPY URL"}</span>
                  </button>
                  <a
                    href={window.location.pathname}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center justify-center document-border bg-black/40 text-sm font-medium ring-offset-background transition-colors hover:bg-[#5cff5c]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 px-2 text-[#E0E0E0] text-xs"
                  >
                    <ExternalLink className="h-4 w-4 icon-visible mr-1" />
                    <span>NEW CONV</span>
                  </a>
                  <button
                    onClick={clearHistory}
                    className="inline-flex h-9 w-9 items-center justify-center document-border bg-black/40 text-sm font-medium ring-offset-background transition-colors hover:bg-[#5cff5c]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <Trash className="h-4 w-4 icon-visible" />
                    <span className="sr-only">Clear history</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-hidden">
        <div className="glass-panel mx-auto max-w-5xl mt-4 mb-0 flex-1 overflow-hidden px-4 lg:px-8 py-0">
          <div className="flex flex-col h-[calc(100vh-7.5rem)] overflow-hidden">
            {/* Message interface */}
            <div className="flex-1 overflow-y-auto mt-2" ref={messagesEndRef}>
              <div className="pb-[40px]">
                {agentMessages.length === 0 ? (
                  <div className="glass-panel p-4 m-4 mt-8">
                    <div className="document-border p-4 bg-black/60">
                      <h4 className="font-mono text-[#E0E0E0] mb-2 text-left text-sm">HISTORY LAB RESEARCH ASSISTANT</h4>
                      <div className="markdown-condensed text-[#5cff5c] text-sm text-left mb-3 font-mono">
                        {renderMessageContent(`
# Welcome to HistoryLab AI

An advanced research assistant specialized in analyzing historical documents and helping explore declassified archives.

## Available Document Collections

Access collections including:

* **Central Foreign Policy Files** - US State Department communications
* **CIA documents** - Declassified intelligence reports and assessments
* **Foreign Relations of the United States** - Diplomatic correspondence
* **UN documents** - Resolutions, reports, and official communications
* **World Bank reports** - Documents on global development and economic policy
* **Clinton administration documents** - Records from the 1990s US presidency

> Ask questions about historical events, people, or periods to search through these archives.
`, 'welcome')}
                      </div>
                    </div>
                  </div>
                ) : (
                  agentMessages.map((m: Message, index) => {
                    const isUser = m.role === "user";
                    const showAvatar =
                      index === 0 || agentMessages[index - 1]?.role !== m.role;
                    const showRole = showAvatar && !isUser;
                    const isLastMessage = index === agentMessages.length - 1;
                    const shouldShowCopyButton = !isUser && (!isLastMessage || status === "ready");

                    return (
                      <div
                        className={`mb-4 flex flex-col ${
                          isUser ? "items-end" : "items-start"
                        }`}
                        key={m.id}
                      >
                        <div
                          className={`flex w-full max-w-4xl ${
                            isUser ? "justify-end" : "justify-start"
                          }`}
                        >
                          <div
                            className={`rounded-sm flex flex-col ${
                              isUser
                                ? "bg-secondary/30 backdrop-blur-sm document-border mr-2"
                                : "bg-black/40 backdrop-blur-sm document-border ml-2"
                            } w-fit max-w-[86%]`}
                          >
                            <div
                              className={`terminal-header justify-between ${
                                isUser ? "bg-secondary/50" : "bg-black"
                              }`}
                            >
                              <div className="flex items-center">
                                {isUser ? (
                                  <CommandIcon className="h-3 w-3 mr-1.5 text-[#E0E0E0]" />
                                ) : (
                                  <FileText className="h-3 w-3 mr-1.5 text-[#E0E0E0]" />
                                )}
                                <span className="font-mono text-xs tracking-widest text-[#E0E0E0]">
                                  {isUser ? "RESEARCHER" : "ASSISTANT"}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <time
                                  dateTime={m.createdAt?.toString() ?? new Date().toString()}
                                  className="text-[10px] text-[#E0E0E0] font-mono"
                                >
                                  {formatTime(new Date(m.createdAt ?? new Date()))}
                                </time>
                                {!isUser && (
                                  <div className="font-mono bg-black/50 text-[10px] px-1 text-[#E0E0E0] border border-[#5cff5c]/20">
                                    HISTORYLAB
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="px-4 py-3 text-sm text-[#5cff5c] font-mono">
                              {!m.parts || m.parts.length === 0 ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-[#5cff5c]/70 text-xs">Processing query...</span>
                                </div>
                              ) : (
                                <>
                                  {m.parts.map((part, i) => {                                    
                                    // Render text parts as message bubbles
                                    if (part.type === "text") {
                                      return (
                                        <div key={i} className="relative">
                                          {renderMessageContent(part.text, m.id)}
                                        </div>
                                      );
                                    }
                                    
                                    // Render tool invocation parts
                                    if (part.type === "tool-invocation") {
                                      return renderToolInvocation(part.toolInvocation, m.id, i);
                                    }                                    
                                    
                                    return null;
                                  })}
                                  
                                  {/* Show copy button based on message position and status */}
                                  {shouldShowCopyButton && renderCopyButton(m)}
                                </>
                              )}
                            </div>
                          </div>
                          <div
                            className={`h-8 w-8 overflow-hidden document-border flex-none ${
                              isUser ? "order-last ml-2" : "order-first mr-2"
                            }`}
                          >
                            {isUser ? (
                              <div className="h-full w-full bg-secondary/30 flex items-center justify-center">
                                <CommandIcon className="h-4 w-4 text-[#E0E0E0]" />
                              </div>
                            ) : (
                              <div className="h-full w-full bg-black/40 flex items-center justify-center">
                                <FileText className="h-4 w-4 text-[#E0E0E0]" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            
            {/* Input interface */}
            <div className="bg-black/60 backdrop-blur-md sticky bottom-0 border-t border-white/10 py-2">
              <form
                onSubmit={(e) =>
                  handleAgentSubmit(e, {
                    data: {
                      annotations: {
                        hello: "world",
                      },
                    },
                  })
                }
                className="mx-4"
              >
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 flex items-start pl-3 pt-2 pointer-events-none">
                    <span className="font-mono text-xs text-[#E0E0E0]/80">SEARCH ARCHIVES:</span>
                  </div>
                  <textarea
                    ref={textareaRef}
                    placeholder="Enter your research query..."
                    className={`document-border w-full bg-black/30 backdrop-blur-md py-2 px-4 text-[#E0E0E0] shadow-sm font-mono text-sm placeholder:text-[#E0E0E0]/50 focus:outline-none focus:ring-1 focus:ring-[#5cff5c]/50 resize-none pr-12 pb-12`}
                    value={agentInput}
                    onChange={handleAgentInputChange}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleAgentSubmit(e as unknown as React.FormEvent);
                      }
                    }}
                    rows={1}
                    maxLength={60000}
                    style={{ 
                      height: "40px", 
                      minHeight: "40px", 
                      maxHeight: "200px", 
                      overflowY: "auto",
                      ...(isAtMaxHeight 
                        ? {} 
                        : {
                            msOverflowStyle: "none",
                            scrollbarWidth: "none",
                            WebkitOverflowScrolling: "touch"
                          }),
                    }}
                  />
                  <div className="absolute top-2 right-0 flex items-center pr-3">
                    <Mic className="h-4 w-4 text-[#E0E0E0]/70" />
                  </div>
                  <button
                    type="submit"
                    className="document-border bg-black/70 text-[#E0E0E0] hover:bg-[#E0E0E0]/30 hover:text-white hover:border-white/50 hover:scale-105 rounded-full p-2 absolute bottom-3 right-3 flex items-center justify-center transition-all duration-200 shadow-sm"
                    disabled={status === "streaming"}
                  >
                    <Send className="h-6 w-6" />
                    <span className="sr-only">Send</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}