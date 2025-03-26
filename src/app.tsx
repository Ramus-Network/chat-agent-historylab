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
import { APPROVAL } from "./shared";
// Type import for available tools defined in tools.ts
import type { tools } from "./tools";
// UI components from the component library
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Avatar, AvatarFallback } from "./components/ui/avatar";
import { Switch } from "./components/ui/switch";
// Markdown rendering components
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
// Icons from the Lucide icon library
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Clipboard,
  Clock,
  CommandIcon,
  FileText,
  HelpCircle,
  Lock,
  AlertTriangle,
  Eye,
  Radio,
  Terminal,
  ServerOff,
  Shield,
  ShieldAlert,
  Skull,
  Cpu,
  Download,
  XSquare,
  MessagesSquare,
  Mic,
  MicOff,
  Moon,
  Send,
  Sun,
  Trash,
  Volume,
  Sparkles,
  RefreshCw,
} from "lucide-react";

// List of tools that require human confirmation before execution
// This is used to determine which tool invocations should display confirmation UI
// These tools must have corresponding executions in the server-side executions object
const toolsRequiringConfirmation: (keyof typeof tools)[] = [
  "testTool", // This matches the testTool defined in tools.ts
];

export default function Chat() {
  // State for theme management (dark/light mode)
  // Uses localStorage to persist user preference
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    // Check localStorage first, default to dark if not found
    const savedTheme = localStorage.getItem("theme");
    return (savedTheme as "dark" | "light") || "dark";
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

  // Collection ID for HistoryLab (commented out, now defined on server-side)
  // const COLLECTION_ID = "80650a98-fe49-429a-afbd-9dde66e2d02b"; // history-lab-1
  // console.log("COLLECTION_ID", COLLECTION_ID);

  // Initialize the agent connection
  // This connects to the backend Chat class in server.ts
  // The 'chat' parameter maps to the Chat class defined in server.ts
  // The 'name' parameter is used to identify this specific agent instance
  const agent = useAgent({
    agent: "chat",
    name: "user1-historylab-convo2"
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
  } = useAgentChat({
    agent,                         // The agent connection initialized above
    maxSteps: 5,                   // Maximum number of steps for AI processing
  });

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
        {toolInvocation.state === 'result' && (
          <div className="font-mono text-xs text-[#5cff5c]">
            Result: {JSON.stringify(toolInvocation.result).substring(0, 100)}...
          </div>
        )}
      </div>
    );
  };

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
                  HISTORY LAB DOCUMENT INTERFACE
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="digital-display hidden md:flex">
                  <Clock className="h-3.5 w-3.5 mr-1.5 text-[#E0E0E0]" />
                  <time dateTime={new Date().toISOString()} className="text-xs font-mono tracking-wide text-[#E0E0E0]">
                    {new Date().toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    })}
                  </time>
                </div>

                <div className="flex items-center">
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
              <div className="pb-[80px]">
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

* **Central Foreign Policy Files** (1.67M documents) - US State Department communications
* **CIA documents** (~440K) - Declassified intelligence reports and assessments
* **Foreign Relations of the United States** (~159K) - Diplomatic correspondence
* **UN documents** (~93K) - Resolutions, reports, and official communications
* **World Bank reports** (~68K) - Documents on global development and economic policy
* **Clinton administration documents** (~30K) - Records from the 1990s US presidency

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
                                m.parts?.map((part, i) => {
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
                                })
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
            <div className="bg-black/60 backdrop-blur-md sticky bottom-0 border-t border-white/10 py-4">
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
                className="flex items-center space-x-2 mx-4"
              >
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <span className="font-mono text-xs text-[#E0E0E0]/80">SEARCH ARCHIVES:</span>
                  </div>
                  <input
                    placeholder="Enter your research query..."
                    className="document-border w-full bg-black/30 backdrop-blur-md py-2 px-4 text-[#E0E0E0] shadow-sm font-mono text-sm placeholder:text-[#E0E0E0]/50 focus:outline-none focus:ring-1 focus:ring-[#5cff5c]/50"
                    value={agentInput}
                    onChange={handleAgentInputChange}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleAgentSubmit(e as unknown as React.FormEvent);
                      }
                    }}
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                    <Mic className="h-4 w-4 text-[#E0E0E0]/70" />
                  </div>
                </div>
                <button
                  type="submit"
                  className="document-border bg-black/40 text-[#E0E0E0] hover:bg-[#5cff5c]/10 px-4 py-2 font-mono text-sm font-medium shadow-sm focus:outline-none focus:ring-1 focus:ring-[#5cff5c]/50"
                >
                  <Send className="h-4 w-4" />
                  <span className="sr-only">Send</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
