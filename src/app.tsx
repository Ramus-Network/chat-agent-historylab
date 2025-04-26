// app.tsx

// React hooks for managing component state and lifecycle
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
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
  Square,
  AlertTriangle,
  RefreshCw,
  Settings,
  User,
  Bot,
} from "lucide-react";

// Collection ID constant (matches the server-side constant)
const COLLECTION_ID = '80650a98-fe49-429a-afbd-9dde66e2d02b'; // history-lab-1
// Response timeout in milliseconds (5 seconds)
const RESPONSE_TIMEOUT = 5000;

// List of tools that require human confirmation before execution
// This is used to determine which tool invocations should display confirmation UI
// These tools must have corresponding executions in the server-side executions object
const toolsRequiringConfirmation: (keyof typeof tools)[] = [
  "submitFeedback", // This matches the submitFeedback defined in tools.ts
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
  
  // State for tracking local submission state (separate from API status)
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // State to track if we're in a limbo state (submitted but no response)
  const [isLimbo, setIsLimbo] = useState(false);
  
  // Ref to store timeout ID
  const limboTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // State to track padding space needed after user message
  const [paddingHeight, setPaddingHeight] = useState(0);
  // Track if we're on the first AI response in the conversation
  const isFirstConversationRef = useRef(true);
  // Track the ID of the message being observed
  const observedMessageIdRef = useRef<string | null>(null);
  // Track interval timer for fallback height checking
  const heightCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
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
    
    // Update the URL with the new ID as a query parameter using replaceState for the initial load
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('id', hashedId);
    // Use replaceState so the initial load doesn't create an extra history entry
    window.history.replaceState({ conversationId: hashedId }, '', newUrl.toString());
    
    return hashedId;
  });
  
  // State for toggling debug information display
  const [showDebug, setShowDebug] = useState(false);
  
  // Reference to the bottom of the messages container for auto-scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Ref for the input container to measure its position
  const inputContainerRef = useRef<HTMLDivElement>(null);

  // Function to scroll the message container to the bottom
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  // Scroll to bottom on initial mount or when a new conversation starts
  useEffect(() => {
    // Use a timeout to ensure layout is complete
    setTimeout(scrollToBottom, 100);
  }, [conversationId, scrollToBottom]);

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
    // Use pushState here to create a new history entry for the *new* conversation
    window.history.pushState({ conversationId: hashedId }, '', newUrl.toString());

    // Clear history for the *new* conversation
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

  // Reset isSubmitting and clear limbo timeout when status changes
  useEffect(() => {
    if (status === "ready" || status === "error" || status === "streaming") {
      setIsSubmitting(false);
      setIsLimbo(false);
      
      // Clear timeout if it exists
      if (limboTimeoutRef.current) {
        clearTimeout(limboTimeoutRef.current);
        limboTimeoutRef.current = null;
      }

      // Log messages structure for debugging when not streaming
      if (status === "ready" || status === "error") {
        console.log('Debug - Messages structure:', agentMessages);
      }
    }
  }, [status, agentMessages]);

  // Wrapper for handleAgentSubmit to set local submission state and start timeout
  const handleSubmit = (e: React.FormEvent) => {
    // Prevent submission if input is blank
    if (!agentInput.trim()) {
      return;
    }

    // Check if this is the first message in the conversation
    const isFirstMessage = agentMessages.length === 0;
    
    // If this is the first message, mark it so we don't add padding on the first AI response
    isFirstConversationRef.current = isFirstMessage;

    // Set initial padding to full height ONLY if this is not the first message
    // Calculate dynamic padding based on input container position
    if (!isFirstMessage) {
      const calculateInitialPadding = () => {
        // Get viewport dimensions
        const viewportHeight = window.innerHeight;
        
        // Get the actual position of the input container
        if (!inputContainerRef.current) return 0;
        
        const inputRect = inputContainerRef.current.getBoundingClientRect();
        const inputTop = inputRect.top;
        
        // Calculate padding in vh units (convert from pixels to vh)
        // Leave 120px for the user message to be visible
        const visibleMessageHeight = 220;
        const paddingPx = inputTop - visibleMessageHeight;
        const paddingVh = (paddingPx / viewportHeight) * 100;
        
        return Math.max(0, paddingVh);
      };
      
      setPaddingHeight(calculateInitialPadding());
    } else {
      setPaddingHeight(0); // No padding for first message
    }
    
    setIsSubmitting(true);
    
    // Start timeout to detect limbo state
    limboTimeoutRef.current = setTimeout(() => {
      // If we're still submitting after timeout, we're in limbo
      if (isSubmitting) {
        setIsLimbo(true);
      }
    }, RESPONSE_TIMEOUT);
    
    handleAgentSubmit(e, {
      data: {
        annotations: {
          hello: "world",
        },
      },
    });

    // Scroll down after submission, but position the new user message at the top
    setTimeout(() => {
      const messages = document.querySelectorAll('[id^="message-"]');
      // Find the latest user message (it should be the last one with items-end class)
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].classList.contains('items-end')) {
          messages[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
          break;
        }
      }
    }, 150); // Slightly longer delay to ensure the message is rendered
  };

  // Effect to dynamically adjust padding as AI response grows
  useEffect(() => {
    // Skip the effect if not streaming or if this is the first conversation
    if (status !== 'streaming') {
      // Clear any existing interval when not streaming
      if (heightCheckIntervalRef.current) {
        clearInterval(heightCheckIntervalRef.current);
        heightCheckIntervalRef.current = null;
      }
      return;
    }
    
    if (isFirstConversationRef.current) {
      setPaddingHeight(0); // Ensure no padding for first conversation
      return;
    }

    // Function to find the latest AI message element
    const findLatestAIMessage = () => {
      const messages = document.querySelectorAll('[id^="message-"]');
      // Look for the most recent assistant message (not from the user)
      for (let i = messages.length - 1; i >= 0; i--) {
        if (!messages[i].classList.contains('items-end')) { // Not a user message
          return { 
            element: messages[i] as HTMLElement,
            id: messages[i].id
          };
        }
      }
      return null;
    };

    // Function to calculate padding based on message height
    const calculatePadding = (messageElement: HTMLElement) => {
      const rect = messageElement.getBoundingClientRect();
      const messageHeight = rect.height;
      const viewportHeight = window.innerHeight;
      
      // Measure the actual position of the input container
      if (!inputContainerRef.current) return;
      
      const inputRect = inputContainerRef.current.getBoundingClientRect();
      const inputTop = inputRect.top;
      
      // Calculate the available space from the message to the input
      const availableSpace = inputTop;
      
      // Calculate padding needed to position message at the input top 
      // while showing at least a minimum amount of the message
      const minVisibleMessage = 120; // show at least 120px of message
      const targetPadding = Math.max(0, availableSpace - messageHeight + minVisibleMessage);
      
      // Convert to vh units
      const newPaddingVh = (targetPadding / viewportHeight) * 100;
      
      // Only update if padding changed significantly (avoids minor flicker)
      if (Math.abs(newPaddingVh - paddingHeight) > 0.5) {
        setPaddingHeight(newPaddingVh);
      }
    };

    // Get a reference to the latest AI message (after a short delay to ensure DOM is updated)
    const setupObserver = () => {
      const result = findLatestAIMessage();
      if (!result) return;
      
      const { element: aiMessage, id: messageId } = result;
      
      // If this is the same message we're already observing, don't recreate the observer
      if (observedMessageIdRef.current === messageId) return;
      
      // Remember which message we're observing
      observedMessageIdRef.current = messageId;
      
      // Clear any existing interval
      if (heightCheckIntervalRef.current) {
        clearInterval(heightCheckIntervalRef.current);
      }
      
      // Set up ResizeObserver to monitor the AI message size
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === aiMessage) {
            calculatePadding(aiMessage);
          }
        }
      });
      
      // Start observing the AI message
      resizeObserver.observe(aiMessage);
      
      // Do an initial measurement immediately
      calculatePadding(aiMessage);
      
      // Also set up a fallback interval to check height regularly
      // This ensures updates even if the ResizeObserver misses some changes
      heightCheckIntervalRef.current = setInterval(() => {
        if (aiMessage && document.body.contains(aiMessage)) {
          calculatePadding(aiMessage);
        } else {
          // If the element is no longer in the DOM, clear the interval
          if (heightCheckIntervalRef.current) {
            clearInterval(heightCheckIntervalRef.current);
            heightCheckIntervalRef.current = null;
          }
        }
      }, 200); // Check every 200ms
      
      // Clean up observer when component unmounts
      return () => {
        resizeObserver.disconnect();
        if (heightCheckIntervalRef.current) {
          clearInterval(heightCheckIntervalRef.current);
          heightCheckIntervalRef.current = null;
        }
      };
    };
    
    // Initial setup
    const timeoutId = setTimeout(setupObserver, 50);
    
    // Re-run the setup whenever there are new messages
    const messageObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          setupObserver();
        }
      }
    });
    
    if (scrollContainerRef.current) {
      messageObserver.observe(scrollContainerRef.current, { 
        childList: true, 
        subtree: true 
      });
    }

    return () => {
      clearTimeout(timeoutId);
      messageObserver.disconnect();
      if (heightCheckIntervalRef.current) {
        clearInterval(heightCheckIntervalRef.current);
        heightCheckIntervalRef.current = null;
      }
      // Reset observed message when effect cleanup runs
      observedMessageIdRef.current = null;
    };
  }, [status, paddingHeight]);

  // If conversation changes or is cleared, reset the first conversation flag
  useEffect(() => {
    if (agentMessages.length === 0) {
      isFirstConversationRef.current = true;
      observedMessageIdRef.current = null;
      if (heightCheckIntervalRef.current) {
        clearInterval(heightCheckIntervalRef.current);
        heightCheckIntervalRef.current = null;
      }
    }
  }, [agentMessages.length, conversationId]);

  // Function to reload the page
  const handleReload = () => {
    window.location.reload();
  };

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
    const handlePopState = (event: PopStateEvent) => {
      const urlParams = new URLSearchParams(window.location.search);
      const idFromUrl = urlParams.get('id');
      const stateConversationId = event.state?.conversationId; // Get ID from history state if available

      console.log("Popstate event:", { idFromUrl, stateConversationId, currentState: conversationId });

      // Prefer the ID from the history state object if it exists and differs from current
      const targetId = stateConversationId || idFromUrl;

      if (targetId && targetId !== conversationId) {
        try {
          // Validate the ID format (optional but good practice)
          decodeHashedComponents(targetId);
          console.log(`Restoring conversation ID from history: ${targetId}`);
          setConversationId(targetId);
          // !! DO NOT clearHistory() here - we want to load the existing messages !!
          // The useAgentChat hook should reload messages automatically when 'agent' changes due to 'conversationId' update.
        } catch (e) {
          console.error('Invalid conversation ID during popstate:', e, targetId);
          // If ID is invalid, create a new one (might happen on corrupted history)
          createNewConversation();
        }
      } else if (!targetId) {
         // If no ID is found in URL or state (e.g., navigated back to root before initial load was replaced)
         console.log("No valid ID found on popstate, creating new conversation.");
         // This case should be less common now with replaceState on initial load
         createNewConversation();
      }
      // If targetId === conversationId, do nothing (already on the correct state)
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [conversationId, clearHistory]); // Add conversationId to dependencies

  // Warn user before leaving if they have messages
  /* useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Only show confirmation if there are messages and the chat isn't in an error state
      if (agentMessages.length > 0 && status !== "error") {
        event.preventDefault(); // Standard practice
        event.returnValue = 'You have an ongoing conversation. Are you sure you want to leave?'; // For older browsers
        return 'You have an ongoing conversation. Are you sure you want to leave?'; // For modern browsers
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [agentMessages, status]); // Re-run if messages or status change */

  // Format timestamp for message display
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Global document registry for consistent citation numbering across conversations
  const documentRegistry = useMemo(() => {
    return {
      documents: new Map<string, { id: number, title: string }>(),
      counter: 0,
      registerDocument(r2Key: string, title?: string): number {
        // Check if document already registered
        if (this.documents.has(r2Key)) {
          return this.documents.get(r2Key)!.id;
        }
        
        // Register new document
        const docId = ++this.counter;
        this.documents.set(r2Key, { 
          id: docId, 
          title: title || `Document ${docId}` 
        });
        return docId;
      },
      getDocumentId(r2Key: string): number | null {
        return this.documents.has(r2Key) ? this.documents.get(r2Key)!.id : null;
      },
      getDocumentUrl(r2Key: string): string {
        return `https://doc-viewer.ramus.network/${r2Key}`;
      },
      getDocumentTitle(r2Key: string): string {
        return this.documents.has(r2Key) ? this.documents.get(r2Key)!.title : `Document`;
      }
    };
  }, []);
  
  // Process all messages to extract and register documents from tool responses
  useEffect(() => {
    // Skip if no messages
    if (!agentMessages || agentMessages.length === 0) return;
    
    // Process all messages to find queryCollection results
    agentMessages.forEach(message => {
      if (message.role !== 'assistant' || !message.parts) return;
      
      message.parts.forEach(part => {
        if (part.type !== 'tool-invocation') return;
        
        const toolInvocation = (part as any).toolInvocation;
        if (toolInvocation?.toolName !== 'queryCollection' || toolInvocation?.state !== 'result') return;
        
        // Process queryCollection result
        const result = toolInvocation.result;
        if (!result || !result.documents || !Array.isArray(result.documents)) return;
        
        // Register all documents from the search results
        result.documents.forEach((doc: any) => {
          if (doc.file_info?.r2Key) {
            const title = doc.file_info?.metadata?.title || doc.document_id || `Document`;
            documentRegistry.registerDocument(doc.file_info.r2Key, title);
          }
        });
      });
    });
  }, [agentMessages, documentRegistry]);

  // Add global click handler for citations
  useEffect(() => {
    const handleGlobalCitationClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('citation')) {
        const r2Key = target.getAttribute('data-r2key');
        if (r2Key) {
          window.open(documentRegistry.getDocumentUrl(r2Key), '_blank');
        }
      }
    };
    
    // Add event listener to the document
    document.addEventListener('click', handleGlobalCitationClick);
    
    // Clean up
    return () => {
      document.removeEventListener('click', handleGlobalCitationClick);
    };
  }, [documentRegistry]);

  // Add citation styles to document head, update on status change
  useEffect(() => {
    // Base styles for the citation buttons
    let citationStyles = `
      .citation {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background-color: #6CA0D6;
        color: white;
        width: 1.25rem;
        height: 1.25rem;
        border-radius: 50%;
        font-size: 0.7rem;
        font-weight: 500;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        cursor: pointer;
        margin: 0 0.125rem;
        vertical-align: text-bottom;
        position: relative;
        top: -0.05rem;
        transition: background-color 0.15s, transform 0.15s;
        line-height: 1;
        user-select: none;
      }
      .citation:active {
        transform: scale(0.95);
        background-color: #4a80b0;
      }
    `;
    
    // Add hover effect conditionally
    const hoverStyles = status !== 'streaming' ? `
      .citation:hover {
        background-color: #5a90c0;
        transform: scale(1.1);
      }
    ` : '';
    citationStyles += hoverStyles;
    
    // Create or update style element
    let styleElement = document.getElementById('citation-styles');
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = 'citation-styles';
      document.head.appendChild(styleElement);
    }
    styleElement.textContent = citationStyles;
    
    // Clean up function remains the same
    return () => {
      // Optional cleanup, maybe remove the style element if component unmounts entirely
      // const styleToRemove = document.getElementById('citation-styles');
      // if (styleToRemove) {
      //   document.head.removeChild(styleToRemove);
      // }
    };
  }, [status]); // Dependency array remains [status]

  // Render message content with styling and markdown support
  const renderMessageContent = (text: string, messageId: string) => {
    // Process special citation codes: {{cite:r2Key}}
    // Convert to custom span that will be parsed as HTML with rehypeRaw
    const processedText = text.replace(
      /{{cite:([^}]+)}}/g, 
      (match, r2Key) => {
        // Register document if not already registered
        const docId = documentRegistry.registerDocument(r2Key);
        return `<span class="citation" data-number="${docId}" data-r2key="${r2Key}" title="View source document ${docId}: ${documentRegistry.getDocumentTitle(r2Key)}">${docId}</span>`;
      }
    );

    return (
      <div className="whitespace-pre-wrap break-words text-gray-800 markdown-condensed">
        <ReactMarkdown
          rehypePlugins={[rehypeRaw]}
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({node, ...props}) => <h1 className="text-gray-900 font-bold text-xl mb-1 mt-2" {...props} />,
            h2: ({node, ...props}) => <h2 className="text-gray-900 font-bold text-lg mb-1 mt-2" {...props} />,
            h3: ({node, ...props}) => <h3 className="text-gray-900 font-bold text-base mb-1 mt-1" {...props} />,
            h4: ({node, ...props}) => <h4 className="text-gray-900 font-bold text-sm mb-1 mt-1" {...props} />,
            p: ({node, ...props}) => <p className="text-gray-800 mb-0" {...props} />,
            a: ({node, ...props}) => <a className="text-[#6CA0D6] hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
            strong: ({node, ...props}) => <strong className="text-gray-900 font-semibold" {...props} />,
            em: ({node, ...props}) => <em className="text-gray-800 italic" {...props} />,
            ul: ({node, ...props}) => <ul className="text-gray-800 list-disc ml-5 my-0 py-0" {...props} />,
            ol: ({node, ...props}) => <ol className="text-gray-800 list-decimal ml-5 my-0 py-0" {...props} />,
            li: ({node, ...props}) => <li className="text-gray-800 mb-0" {...props} />,
            blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-[#6CA0D6] bg-gray-100/50 p-3 my-1 rounded-r-md text-gray-700 italic" {...props} />,
            code: ({node, inline, className, ...props}: any) =>
              inline
                ? <code className="bg-gray-200/70 rounded-md px-1 py-0.5 font-mono text-sm text-gray-800" {...props} />
                : <pre className="bg-gray-100 border border-gray-200 rounded-md p-4 my-1 overflow-x-auto font-mono text-sm leading-relaxed text-gray-800 block"><code className="bg-transparent p-0 border-none" {...props}/></pre>,
            pre: ({node, ...props}) => <pre className="bg-gray-100 border border-gray-200 rounded-md p-4 my-1 overflow-x-auto font-mono text-sm leading-relaxed text-gray-800" {...props} />,
            table: ({node, ...props}) => <table className="table-auto w-full my-1 border-collapse border border-gray-300 rounded-md overflow-hidden text-gray-800" {...props} />,
            th: ({node, ...props}) => <th className="border border-gray-300 p-2 text-left bg-gray-100 font-semibold" {...props} />,
            td: ({node, ...props}) => <td className="border border-gray-300 p-2" {...props} />,
            hr: ({node, ...props}) => <hr className="border-gray-300/80 my-1" {...props} />,
          }}
        >
          {processedText}
        </ReactMarkdown>
      </div>
    );
  };

  // Render reasoning content with styling and markdown support
  const renderReasoningContent = (text: string, messageId: string) => {
    return (
      <div className="whitespace-pre-wrap break-words text-gray-500 text-xs opacity-90 markdown-condensed border-l-2 border-gray-300 pl-2 my-2">
        <ReactMarkdown
          rehypePlugins={[rehypeRaw]}
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({node, ...props}) => <h1 className="text-gray-600 font-semibold" {...props} />,
            h2: ({node, ...props}) => <h2 className="text-gray-600 font-semibold" {...props} />,
            h3: ({node, ...props}) => <h3 className="text-gray-600 font-semibold" {...props} />,
            h4: ({node, ...props}) => <h4 className="text-gray-600 font-semibold" {...props} />,
            p: ({node, ...props}) => <p className="text-gray-500" {...props} />,
            a: ({node, ...props}) => <a className="text-gray-500 underline" {...props} />,
            strong: ({node, ...props}) => <strong className="text-gray-600 font-semibold" {...props} />,
            em: ({node, ...props}) => <em className="text-gray-500 italic" {...props} />,
            ul: ({node, ...props}) => <ul className="text-gray-500 list-disc ml-4" {...props} />,
            ol: ({node, ...props}) => <ol className="text-gray-500 list-decimal ml-4" {...props} />,
            li: ({node, ...props}) => <li className="text-gray-500" {...props} />,
            blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-gray-400 bg-gray-50 p-2 my-2 rounded-r-md text-gray-500" {...props} />,
            code: ({node, inline, className, ...props}: any) =>
              inline
                ? <code className="bg-gray-200/70 rounded-md px-1 py-0.5 font-mono text-xs text-gray-600" {...props} />
                : <pre className="bg-gray-100 border border-gray-200 rounded-md p-3 my-2 overflow-x-auto font-mono text-xs leading-relaxed text-gray-600 block"><code className="bg-transparent p-0 border-none" {...props}/></pre>,
            pre: ({node, ...props}) => <pre className="bg-gray-100 border border-gray-200 rounded-md p-3 my-2 overflow-x-auto font-mono text-xs leading-relaxed text-gray-600" {...props} />,
            table: ({node, ...props}) => <table className="table-auto w-full my-2 border-collapse rounded-md overflow-hidden text-gray-500 text-xs" {...props} />,
            th: ({node, ...props}) => <th className="border border-gray-200 p-1 text-left bg-gray-50 font-semibold" {...props} />,
            td: ({node, ...props}) => <td className="border border-gray-200 p-1" {...props} />,
            hr: ({node, ...props}) => <hr className="border-gray-200/80 my-2" {...props} />,
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    );
  };

  // Render tool invocation with appropriate UI
  const renderToolInvocation = (toolInvocation: any, messageId: string, index: number) => {
    const toolCallId = toolInvocation.toolCallId;
    const toolName = toolInvocation.toolName;
    
    // Internal component to handle query results state and rendering
    // Pass down the chat status to conditionally apply hover styles
    const QueryCollectionResults = ({ resultData, chatStatus }: { resultData: any, chatStatus: string }) => {
      // Removed showAllResults state and RESULTS_TO_SHOW_INITIALLY constant
      const [copiedDocId, setCopiedDocId] = useState<string | null>(null);
      
      let documents: any[] = [];
      let totalChunks = 0;
      let localStatus = 'unknown'; // Renamed to avoid conflict with prop
      let isError = false;
      let errorMessage = 'An error occurred retrieving search results.';

      if (resultData.status === 'error') {
        isError = true;
        errorMessage = resultData.message || resultData.error || errorMessage;
      }
      else if ('documents' in resultData) {
        documents = resultData.documents || [];
        totalChunks = resultData.total_chunks || 0;
        localStatus = resultData.status || 'success';
      } 
      else { /* No documents or unknown format */ }

      const copyDocumentCitation = (doc: any) => {
        const r2Key = doc.file_info?.r2Key || '';
        
        if (r2Key) {
          const citation = `{{cite:${r2Key}}}`;
          navigator.clipboard.writeText(citation);
          setCopiedDocId(doc.document_id);
          setTimeout(() => setCopiedDocId(null), 2000);
        }
      };

      if (isError) {
        return (
            <div className="bg-red-50 p-3 border border-red-300 rounded-md text-red-700 flex items-center gap-2 shadow-sm">
            <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
            <span className="text-xs font-medium">Search Error: {errorMessage}</span>
          </div>
        );
      }
      
      if (documents.length === 0) {
          return (
            <div className="bg-gray-50 p-3 border border-gray-200 rounded-md text-gray-600 flex items-center gap-2 shadow-sm">
            <FileText size={14} className="text-gray-400 flex-shrink-0" />
            <span className="text-xs font-medium italic">No documents found matching your query.</span>
          </div>
        );
      }

      return (
        <div className="bg-blue-50/70 p-3 border border-blue-200 rounded-md text-gray-800 shadow-sm">
          <div className="text-xs font-medium mb-2 text-blue-800">
            Found {documents.length} documents 
            {localStatus === 'partial_success' && <span className="text-amber-600 font-normal ml-1">(partial results)</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Map over all documents directly */}
            {documents.map((doc: any, i: number) => {
              const baseClasses = "inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-medium transition-colors shadow-sm";
              const linkClasses = doc.file_info?.r2Key 
                ? `bg-white border border-blue-300 text-blue-800 cursor-pointer ${chatStatus !== 'streaming' ? 'hover:bg-blue-100 hover:border-blue-400' : ''}` 
                : 'bg-gray-100 border border-gray-300 text-gray-500 cursor-default';
              
              return (
                <div key={doc.document_id || i} className="relative group">
                  <a
                    href={doc.file_info?.r2Key ? `https://doc-viewer.ramus.network/${doc.file_info.r2Key}` : '#'}
                    target={doc.file_info?.r2Key ? "_blank" : "_self"}
                    rel="noopener noreferrer"
                    className={`${baseClasses} ${linkClasses}`}
                    title={doc.file_info?.metadata?.title || doc.document_id || 'Unknown Document'}
                    onClick={(e) => { if (!doc.file_info?.r2Key) e.preventDefault(); }}
                  >
                    <FileText size={12} className={doc.file_info?.r2Key ? "text-blue-500" : "text-gray-400"} />
                    <span className="truncate max-w-[200px]">
                      {doc.file_info?.metadata?.title || doc.document_id || 'Unknown Document'}
                    </span>
                  </a>
                  {/* Copy citation button removed */}
                </div>
              );
            })}
          </div>
          {/* Show more button removed */}
        </div>
      );
    };

    // --- Render Logic for Tool Invocation --- 
    
    // Helper function to format date range string
    const formatDateRange = (args: any): string => {
      // Check if args is defined before destructuring
      if (!args) return "";
      
      // Define variables with explicit types and default values
      const authored_start_year_month = args.authored_start_year_month as string | undefined;
      const authored_end_year_month = args.authored_end_year_month as string | undefined;
      const authored_start_year_month_day = args.authored_start_year_month_day as string | undefined;
      const authored_end_year_month_day = args.authored_end_year_month_day as string | undefined;

      // Assign to new variables for clarity
      const start_day = authored_start_year_month_day;
      const end_day = authored_end_year_month_day;
      const start_month = authored_start_year_month;
      const end_month = authored_end_year_month;

      if (start_day || end_day) {
        if (start_day && end_day && start_day === end_day) return `(${start_day})`;
        if (start_day && end_day) return `(${start_day} to ${end_day})`;
        if (start_day) return `(from ${start_day})`;
        if (end_day) return `(until ${end_day})`;
      } else if (start_month || end_month) {
        if (start_month && end_month && start_month === end_month) return `(${start_month})`;
        if (start_month && end_month) return `(${start_month} to ${end_month})`;
        if (start_month) return `(from ${start_month})`;
        if (end_month) return `(until ${end_month})`;
      }
      return ""; // No date range provided
    };

    // 1. Render Query Collection Tool
    if (toolName === 'queryCollection') {
      if (toolInvocation.state !== 'result') {
        const queryText = toolInvocation.args?.query || '...';
        const dateRangeStr = formatDateRange(toolInvocation.args);
        const displayText = `"${queryText.length > 60 ? queryText.substring(0, 60) + '...' : queryText}" ${dateRangeStr}`.trim();

        return (
          <div 
            key={`${messageId}-tool-searching-${index}`} 
            className="bg-blue-50 p-3 my-3 border border-blue-200 rounded-md text-blue-700 flex items-center gap-2 shadow-sm"
          >
            <RefreshCw size={14} className="animate-spin text-blue-500" />
            <span className="text-xs font-medium">
              Searching archive for: <span className="italic">{displayText}</span>
            </span>
          </div>
        );
      }
      else if (toolInvocation.result && typeof toolInvocation.result === 'object') {
        return (
          <div key={`${messageId}-tool-results-${index}`} className="my-3">
            {/* Pass the main chat status down */}
            <QueryCollectionResults resultData={toolInvocation.result} chatStatus={status} />
          </div>
        );
      }
      else {
        return (
          <div 
            key={`${messageId}-tool-unknown-${index}`} 
            className="bg-gray-50 p-3 my-3 border border-gray-200 rounded-md text-gray-500 flex items-center gap-2 shadow-sm"
          >
            <AlertTriangle size={14} className="text-gray-400 flex-shrink-0" />
            <span className="text-xs font-medium italic">Received unexpected search result format.</span>
          </div>
        );
      }
    }
    
    // 2. Render Get Document Text Tool
    if (toolName === 'getDocumentText') {
      const r2Key = toolInvocation.args?.r2Key || 'unknown document';
      const r2KeySnippet = r2Key.length > 40 ? `...${r2Key.substring(r2Key.length - 40)}` : r2Key;
      
      if (toolInvocation.state !== 'result') {
        return (
          <div 
            key={`${messageId}-tool-fetching-${index}`} 
            className="bg-blue-50 p-3 my-3 border border-blue-200 rounded-md text-blue-700 flex items-center gap-2 shadow-sm"
          >
            <RefreshCw size={14} className="animate-spin text-blue-500" />
            <span className="text-xs font-medium">
              Fetching text for document: <span className="font-mono text-[10px] bg-blue-100 px-1 rounded">{r2KeySnippet}</span>...
            </span>
          </div>
        );
      }
      
      const result = toolInvocation.result;
      const isError = typeof result === 'object' && result !== null && result.error;
      const errorMessage = isError ? result.error : 'Unknown error';

      if (isError) {
        return (
          <div 
            key={`${messageId}-tool-error-${index}`} 
            className="bg-red-50 p-3 my-3 border border-red-300 rounded-md text-red-700 flex items-center gap-2 shadow-sm"
          >
            <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
            <span className="text-xs font-medium">
              Error fetching <span className="font-mono text-[10px] bg-red-100 px-1 rounded">{r2KeySnippet}</span>: {errorMessage}
            </span>
          </div>
        );
      }
      else {
         return (
          <div 
            key={`${messageId}-tool-success-${index}`} 
            className="bg-blue-50 p-3 my-3 border border-blue-200 rounded-md text-blue-700 flex items-center gap-2 shadow-sm"
          >
            <Check size={14} className="text-blue-500 flex-shrink-0" />
            <span className="text-xs font-medium">
              Document text retrieved.
            </span>
          </div>
        );
      }
    }

    // 3. Render Confirmation UI (for submitFeedback and potentially others)
    if (
      toolsRequiringConfirmation.includes(toolName as keyof typeof tools) &&
      toolInvocation.state === "call"
    ) {
      const description = toolInvocation.args?.description;
      return (
        <div 
          key={`${messageId}-tool-confirm-${index}`} 
          className="bg-amber-50 p-4 my-3 border border-amber-400/60 rounded-md text-amber-900 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-3">
             <div className="bg-amber-100 p-1.5 rounded-full border border-amber-300">
              <AlertTriangle size={16} className="text-amber-600" />
            </div>
            <h4 className="font-semibold text-sm text-amber-800">
              Action Required: <span className="font-mono">{toolName}</span>
            </h4>
          </div>
          <div className="mb-4">
            <h5 className="text-xs font-semibold mb-1 text-amber-700/90">Details:</h5>
            {toolName === 'submitFeedback' && description ? (
              <div className="bg-amber-100/70 border border-amber-200 p-2 rounded-md text-xs text-amber-800/90 whitespace-pre-wrap break-words">
                {description}
              </div>
            ) : (
              <pre className="bg-amber-100/70 border border-amber-200 p-2 rounded-md text-xs overflow-auto font-mono text-amber-800/90">
                {JSON.stringify(toolInvocation.args, null, 2)}
              </pre>
            )}
          </div>
          <p className="text-xs text-amber-700 mb-3">Do you want to approve this action?</p>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => addToolResult({ toolCallId, result: APPROVAL.NO })}
              className="inline-flex h-7 items-center justify-center border border-amber-400 bg-white text-amber-800 text-xs font-medium transition-colors hover:bg-amber-100 hover:border-amber-500 px-3 gap-1 rounded-md cursor-pointer"
            >
              Reject
            </button>
            <button
              onClick={() => addToolResult({ toolCallId, result: APPROVAL.YES })}
              className="inline-flex h-7 items-center justify-center border border-[#6CA0D6] bg-[#6CA0D6] text-white text-xs font-medium transition-colors hover:bg-[#5a90c0] hover:border-[#5a90c0] px-3 gap-1 rounded-md cursor-pointer shadow-sm"
            >
              Approve
            </button>
          </div>
        </div>
      );
    }

    // 4. Render Standard Tool Results (for non-queryCollection, non-getDocumentText tools)
    if (toolInvocation.state === 'result' && !['queryCollection', 'getDocumentText'].includes(toolName)) {
      if (toolName === 'submitFeedback') {
        const result = toolInvocation.result;
        const isError = typeof result === 'object' && result !== null && !result.success;
        const isRejected = typeof result === 'string' && result === APPROVAL.NO; 
        const rejectedByUser = typeof result === 'object' && result !== null && result.status === 'rejected_by_user';
        
        if (isRejected || rejectedByUser) {
          return (
            <div 
              key={`${messageId}-tool-rejected-${index}`} 
              className="bg-orange-50 p-3 my-3 border border-orange-300 rounded-md text-orange-700 flex items-center gap-2 shadow-sm"
            >
              <AlertTriangle size={14} className="text-orange-600 flex-shrink-0" />
              <span className="text-xs font-medium">Feedback Submission Rejected by User.</span>
            </div>
          );
        }
        else if (isError) {
          const errorMessage = result.error || "Failed to submit feedback.";
          return (
             <div 
              key={`${messageId}-tool-error-${index}`} 
              className="bg-red-50 p-3 my-3 border border-red-300 rounded-md text-red-700 flex items-center gap-2 shadow-sm"
            >
              <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
              <span className="text-xs font-medium">{errorMessage}</span>
            </div>
          );
        }
        else {
          return (
            <div 
              key={`${messageId}-tool-success-${index}`} 
              className="bg-blue-50 p-3 my-3 border border-blue-200 rounded-md text-blue-700 flex items-center gap-2 shadow-sm"
            >
              <Check size={14} className="text-blue-500 flex-shrink-0" />
              <span className="text-xs font-medium">Feedback submitted successfully.</span>
            </div>
          );
        }
      }
      else {
        return (
          <div 
            key={`${messageId}-tool-generic-result-${index}`} 
            className="bg-gray-100 p-3 my-3 border border-gray-300 rounded-md text-gray-700 text-xs shadow-sm"
          >
            <span className="font-semibold">Tool Result ({toolName}):</span>
            <pre className="mt-1 text-[10px] overflow-auto">{JSON.stringify(toolInvocation.result, null, 2)}</pre>
          </div>
        );
      }
    }

    // Default: Render nothing if none of the above conditions are met
    return null; 
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
          className="inline-flex h-7 items-center justify-center border border-gray-300 bg-white text-gray-600 text-xs font-medium transition-colors hover:bg-gray-100 hover:text-gray-800 px-2 gap-1 rounded-md cursor-pointer"
          aria-label="Copy message content"
        >
          {copiedMessageId === message.id ? (
            <>
              <Check className="h-3 w-3 text-[#6CA0D6]" />
              <span className="text-[10px] text-[#6CA0D6]">COPIED</span>
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

  // Add window resize listener to recalculate padding when viewport changes
  useEffect(() => {
    const handleResize = () => {
      // Skip if not in the right state for padding
      if (status !== 'streaming' || isFirstConversationRef.current) return;
      
      // Find the latest AI message and recalculate
      const findLatestAIMessage = () => {
        const messages = document.querySelectorAll('[id^="message-"]');
        // Look for the most recent assistant message (not from the user)
        for (let i = messages.length - 1; i >= 0; i--) {
          if (!messages[i].classList.contains('items-end')) { // Not a user message
            return { 
              element: messages[i] as HTMLElement,
              id: messages[i].id
            };
          }
        }
        return null;
      };
      
      const calculatePadding = (messageElement: HTMLElement) => {
        const rect = messageElement.getBoundingClientRect();
        const messageHeight = rect.height;
        const viewportHeight = window.innerHeight;
        
        // Measure the actual position of the input container
        if (!inputContainerRef.current) return;
        
        const inputRect = inputContainerRef.current.getBoundingClientRect();
        const inputTop = inputRect.top;
        
        // Calculate the available space from the message to the input
        const availableSpace = inputTop;
        
        // Calculate padding needed to position message at the input top 
        // while showing at least a minimum amount of the message
        const minVisibleMessage = 120; // show at least 120px of message
        const targetPadding = Math.max(0, availableSpace - messageHeight + minVisibleMessage);
        
        // Convert to vh units
        const newPaddingVh = (targetPadding / viewportHeight) * 100;
        
        // Only update if padding changed significantly (avoids minor flicker)
        if (Math.abs(newPaddingVh - paddingHeight) > 0.5) {
          setPaddingHeight(newPaddingVh);
        }
      };
      
      const result = findLatestAIMessage();
      if (result && result.element) {
        calculatePadding(result.element);
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [status, paddingHeight]);

  // Render the chat interface
  return (
    <div className="flex min-h-screen w-full flex-col bg-white text-gray-800 font-sans antialiased transition-all pb-0 selection:bg-[#6CA0D6] selection:text-white">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="container flex h-14 items-center px-4 md:px-6">
          <div className="flex flex-1 items-center space-x-2 md:justify-between justify-end">
            <div className="w-full flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <a
                  href="https://lab.history.columbia.edu/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-serif text-xl text-[#6CA0D6] tracking-wide hover:opacity-90 transition-opacity cursor-pointer font-semibold"
                >
                  HISTORY LAB
                </a>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                    {status === "streaming" && (
                    <div className="px-2 py-1 text-xs font-mono bg-blue-100 text-[#6CA0D6] rounded-md border border-blue-200">
                      Processing...
                    </div>
                  )}
                  {status === "ready" && agentMessages.length > 0 && (
                     <div className="px-2 py-1 text-xs font-mono bg-blue-100 text-blue-700 rounded-md border border-blue-200">
                      Ready
                    </div>
                  )}
                  {status === "error" && (
                    <div className="px-2 py-1 text-xs font-mono bg-red-100 text-red-700 rounded-md border border-red-200">
                      Error
                    </div>
                  )}
                  
                  <button
                    onClick={shareConversationUrl}
                    className="inline-flex h-8 items-center justify-center rounded-md border border-gray-300 bg-white text-xs font-medium ring-offset-white transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6CA0D6]/50 focus-visible:ring-offset-1 px-2 text-gray-700 cursor-pointer"
                  >
                    <LinkIcon className="h-3.5 w-3.5 icon-visible mr-1 text-gray-500" />
                    <span>{urlCopied ? "COPIED!" : "COPY URL"}</span>
                  </button>
                  <button
                    onClick={() => window.open(window.location.pathname, '_blank', 'noopener,noreferrer')}
                    className="inline-flex h-8 items-center justify-center rounded-md border border-gray-300 bg-white text-xs font-medium ring-offset-white transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6CA0D6]/50 focus-visible:ring-offset-1 px-2 text-gray-700 cursor-pointer"
                  >
                    <ExternalLink className="h-3.5 w-3.5 icon-visible mr-1 text-gray-500" />
                    <span>NEW CONV</span>
                  </button>
                  <button
                    onClick={clearHistory}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-sm font-medium ring-offset-white transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6CA0D6]/50 focus-visible:ring-offset-1 cursor-pointer"
                  >
                    <Trash className="h-4 w-4 icon-visible text-gray-500" />
                    <span className="sr-only">Clear history</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-hidden pb-20 bg-white">
        <div className="mx-auto max-w-6xl mt-4 mb-0 flex-1 overflow-hidden px-4 lg:px-8 py-0">
          <div className="flex flex-col">
            <div className="flex-1 overflow-y-auto mt-2 pr-2 custom-scrollbar bg-white" ref={scrollContainerRef}>
              <div className="pb-[80px] bg-white">
                {agentMessages.length === 0 ? (
                  <div className="bg-white p-4 m-4 mt-8 rounded-lg border border-gray-200">
                    {/* <div className="rounded-md border border-gray-200 p-6 bg-white"> */}
                      {/* <h4 className="font-serif text-gray-800 mb-3 text-left text-lg">HISTORY LAB RESEARCH ASSISTANT</h4> */}
                      <div className="markdown-condensed text-[#6CA0D6] text-sm text-left mb-4 font-sans">
                        {renderMessageContent(`
# Welcome to HistoryLab AI

An AI assistant for exploring declassified government documents, diplomatic cables, intelligence reports, and historical archives. Ask me anything about the provided historical archives.
`, 'welcome')}
                      {/* </div> */}
                      <div className="mt-6">
                        <h5 className="font-mono text-gray-500 mb-3 text-left text-xs tracking-wider">TRY AN EXAMPLE QUERY:</h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <button
                            onClick={() => {
                              handleAgentInputChange({ target: { value: "What did the CIA know about the Iranian Revolution before it happened?" } } as React.ChangeEvent<HTMLTextAreaElement>);
                              setTimeout(() => {
                                if (!isSubmitting && status !== "streaming" && status !== "error") {
                                  const form = document.querySelector('form');
                                  if (form) {
                                    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                                  }
                                }
                              }, 100);
                            }}
                            className="text-left border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-all duration-200 hover:shadow-sm cursor-pointer flex items-center gap-2 rounded-md"
                          >
                            <span className="text-gray-700 text-sm font-sans flex items-center gap-2">
                              <span className="text-xl">🇮🇷 🕵️  🗃️</span> CIA and the Iranian Revolution
                            </span>
                          </button>
                          <button
                             onClick={() => {
                              handleAgentInputChange({ target: { value: "What were the key debates and policy considerations around China's admission to the WTO, and how did the U.S. justify supporting its entry?" } } as React.ChangeEvent<HTMLTextAreaElement>);
                              setTimeout(() => {
                                if (!isSubmitting && status !== "streaming" && status !== "error") {
                                  const form = document.querySelector('form');
                                  if (form) {
                                    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                                  }
                                }
                              }, 100);
                            }}
                            className="text-left border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-all duration-200 hover:shadow-sm cursor-pointer flex items-center gap-2 rounded-md"
                          >
                            <span className="text-gray-700 text-sm font-sans flex items-center gap-2">
                              <span className="text-xl">🌐 💼 🇨🇳</span> China WTO Entry
                            </span>
                          </button>
                          <button
                             onClick={() => {
                              handleAgentInputChange({ target: { value: "I want to know what Clinton emails pertain to Benghazi and what they were talking about as it was unfolding. Make sure to tell me who each email was from and who it was to if that information is available." } } as React.ChangeEvent<HTMLTextAreaElement>);
                              setTimeout(() => {
                                if (!isSubmitting && status !== "streaming" && status !== "error") {
                                  const form = document.querySelector('form');
                                  if (form) {
                                    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                                  }
                                }
                              }, 100);
                            }}
                            className="text-left border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-all duration-200 hover:shadow-sm cursor-pointer flex items-center gap-2 rounded-md"
                          >
                            <span className="text-gray-700 text-sm font-sans flex items-center gap-2">
                              <span className="text-xl">🇱🇾 📧 🧨</span> Clinton Benghazi Emails
                            </span>
                          </button>
                          <button
                             onClick={() => {
                              handleAgentInputChange({ target: { value: "How did early Vietnam debates inside Eisenhower's cabinet shape America's path to war?" } } as React.ChangeEvent<HTMLTextAreaElement>);
                              setTimeout(() => {
                                if (!isSubmitting && status !== "streaming" && status !== "error") {
                                  const form = document.querySelector('form');
                                  if (form) {
                                    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                                  }
                                }
                              }, 100);
                            }}
                            className="text-left border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-all duration-200 hover:shadow-sm cursor-pointer flex items-center gap-2 rounded-md"
                          >
                            <span className="text-gray-700 text-sm font-sans flex items-center gap-2">
                              <span className="text-xl">🇻🇳 🕴️ 📜</span> Eisenhower Vietnam Policy
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {agentMessages.map((m: Message, index) => {
                      const isUser = m.role === "user";
                      const showAvatar = index === 0 || agentMessages[index - 1]?.role !== m.role;
                      const showRole = showAvatar && !isUser;
                      const isLastMessage = index === agentMessages.length - 1;
                      const shouldShowCopyButton = !isUser && (!isLastMessage || (isLastMessage && status === "ready"));

                      return (
                        <div
                          id={`message-${m.id}`}
                          className={`mb-5 flex flex-col p-1 ${isUser ? "items-end" : "items-start"}`}
                          key={m.id}
                        >
                          <div
                            className={`flex w-full max-w-4xl ${
                              isUser ? "justify-end" : "justify-start"
                            }`}
                          >
                            <div
                              className={`h-8 w-8 overflow-hidden border border-gray-300 bg-white flex-none rounded-full flex items-center justify-center shadow-sm ${
                                isUser ? "order-last ml-2" : "order-first mr-2"
                              }`}
                            >
                              {isUser ? (
                                <User className="h-4 w-4 text-gray-500" />
                              ) : (
                                <Bot className="h-4 w-4 text-[#6CA0D6]" />
                              )}
                            </div>
                            <div
                              className={`rounded-lg flex flex-col border overflow-hidden shadow-sm ${
                                isUser
                                  ? "bg-gray-100 border-gray-200"
                                  : "bg-white border-gray-200"
                              } w-fit max-w-[calc(100%-3rem)]`}
                            >
                              <div
                                className={`px-3 py-1.5 font-mono text-xs border-b flex items-center justify-between ${
                                  isUser ? "bg-gray-100 border-gray-200" : "bg-white border-gray-200"
                                }`}
                              >
                                <div className="flex items-center">
                                  <span className={`font-semibold text-xs tracking-wide ${isUser ? 'text-gray-600' : 'text-[#6CA0D6]'}`}>
                                    {isUser ? "RESEARCHER" : "ASSISTANT"}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <time
                                    dateTime={m.createdAt?.toString() ?? new Date().toString()}
                                    className="text-[10px] text-gray-400 font-mono"
                                  >
                                    {formatTime(new Date(m.createdAt ?? new Date()))}
                                  </time>
                                  {!isUser && (
                                    <div className="font-mono bg-gray-100 text-[9px] px-1 text-gray-500 border border-gray-200 rounded-sm">
                                      HISTORYLAB
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="px-4 py-3 text-sm text-gray-800 font-sans">
                                {!m.parts || m.parts.length === 0 ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-gray-500 text-xs italic">Processing query...</span>
                                  </div>
                                ) : (
                                  <>
                                    {m.parts.map((part, i) => {
                                      if (part.type === "text") {
                                        return (
                                          <div key={i} className="relative">
                                            {renderMessageContent(part.text, m.id)}
                                          </div>
                                        );
                                      }
                                      
                                      if (part.type === "reasoning") {
                                        return (
                                          <div key={i} className="relative">
                                            {renderReasoningContent((part as any).reasoning, m.id)}
                                          </div>
                                        );
                                      }
                                      
                                      if (part.type === "tool-invocation") {
                                        return renderToolInvocation(part.toolInvocation, m.id, i);
                                      }                                    
                                      
                                      return null;
                                    })}
                                    
                                    {shouldShowCopyButton && renderCopyButton(m)}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    
                    {isLimbo && (
                      <div className="mb-4 flex flex-col items-start p-1">
                        <div className="flex w-full max-w-4xl justify-start">
                          <div className="h-8 w-8 overflow-hidden border border-amber-400 bg-white flex-none order-first mr-2 rounded-full flex items-center justify-center shadow-sm">
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          </div>
                          <div className="rounded-lg flex flex-col bg-amber-50 border border-amber-300 overflow-hidden w-fit max-w-[calc(100%-3rem)] shadow-sm">
                            <div className="px-3 py-1.5 font-mono text-xs border-b border-amber-300 flex items-center justify-between bg-amber-50">
                              <div className="flex items-center">
                                <AlertTriangle className="h-3.5 w-3.5 mr-1.5 text-amber-600" />
                                <span className="font-semibold text-xs tracking-wide text-amber-700">
                                  WARNING
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <time
                                  dateTime={new Date().toString()}
                                  className="text-[10px] text-amber-500 font-mono"
                                >
                                  {formatTime(new Date())}
                                </time>
                                <div className="font-mono bg-amber-100 text-[9px] px-1 text-amber-600 border border-amber-200 rounded-sm">
                                  SYSTEM
                                </div>
                              </div>
                            </div>
                            <div className="px-4 py-3 text-sm text-amber-800 font-sans">
                              <div className="whitespace-pre-wrap break-words">
                                <p className="mb-2">
                                  Something went wrong. Please reload the page.
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    onClick={handleReload}
                                    className="inline-flex h-8 items-center justify-center border border-amber-400 bg-amber-100 text-sm font-medium transition-colors hover:bg-amber-200 focus-visible:outline-none px-3 text-amber-800 text-xs rounded-md"
                                  >
                                    <RefreshCw className="h-3.5 w-3.5 icon-visible mr-1" />
                                    <span>RELOAD PAGE</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {status === "error" && (
                      <div className="mb-4 flex flex-col items-start p-1">
                        <div className="flex w-full max-w-4xl justify-start">
                           <div className="h-8 w-8 overflow-hidden border border-red-400 bg-white flex-none order-first mr-2 rounded-full flex items-center justify-center shadow-sm">
                             <Bot className="h-4 w-4 text-red-500" />
                          </div>
                          <div className="rounded-lg flex flex-col bg-red-50 border border-red-300 overflow-hidden w-fit max-w-[calc(100%-3rem)] shadow-sm">
                            <div className="px-3 py-1.5 font-mono text-xs border-b border-red-300 flex items-center justify-between bg-red-50">
                              <div className="flex items-center">
                                <Bot className="h-3.5 w-3.5 mr-1.5 text-red-600" />
                                <span className="font-semibold text-xs tracking-wide text-red-700">
                                  ERROR
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <time
                                  dateTime={new Date().toString()}
                                  className="text-[10px] text-red-500 font-mono"
                                >
                                  {formatTime(new Date())}
                                </time>
                                <div className="font-mono bg-red-100 text-[9px] px-1 text-red-600 border border-red-200 rounded-sm">
                                  SYSTEM
                                </div>
                              </div>
                            </div>
                            <div className="px-4 py-3 text-sm text-red-800 font-sans">
                              <div className="whitespace-pre-wrap break-words">
                                <p className="mb-2">
                                  There was an error processing your request. This conversation may have encountered a technical issue.
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    onClick={() => window.open(window.location.pathname, '_blank', 'noopener,noreferrer')}
                                    className="inline-flex h-8 items-center justify-center border border-red-400 bg-red-100 text-sm font-medium transition-colors hover:bg-red-200 focus-visible:outline-none px-3 text-red-800 text-xs rounded-md"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5 icon-visible mr-1" />
                                    <span>START NEW CONVERSATION</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div ref={messagesEndRef} style={{ height: '1px', width: '100%' }} />
                {/* Dynamic padding that shrinks as AI response grows */}
                {paddingHeight > 0 && (
                  <div style={{ height: `${paddingHeight}vh` }}></div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
            
      {/* Fixed input container - white background at the bottom portion */}
      <div 
        ref={inputContainerRef}
        className="fixed bottom-0 left-0 right-0 z-20" 
        style={{ 
          background: 'linear-gradient(to bottom, transparent, white 15%, white)' 
        }}
      >
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          {/* Input form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!isSubmitting && status !== "streaming" && status !== "error") {
                handleSubmit(e);
              }
            }}
            className="mb-2"
          >
            <div className="relative flex-1 rounded-lg bg-white transition-all duration-200 ease-in-out focus-within:ring-2 focus-within:ring-[#6CA0D6]/30 shadow-sm overflow-hidden border border-gray-200">
              <textarea
                ref={textareaRef}
                placeholder="Enter your research query..."
                className="w-full bg-white py-2.5 px-4 text-gray-800 border-none font-sans text-sm placeholder:text-gray-400 focus:outline-none resize-none pr-12 pb-12 custom-scrollbar"
                value={agentInput}
                onChange={handleAgentInputChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    // Check if input is blank before submitting
                    if (!isSubmitting && status !== "streaming" && status !== "error" && agentInput.trim()) {
                      handleSubmit(e as unknown as React.FormEvent);
                    }
                  }
                }}
                rows={1}
                maxLength={60000}
                style={{
                  height: "44px",
                  minHeight: "44px",
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
              <button
                type="submit"
                className="border border-[#6CA0D6] bg-[#6CA0D6] text-white hover:bg-[#5a90c0] rounded-md p-2 absolute bottom-2.5 right-2.5 flex items-center justify-center transition-all duration-200 shadow-sm cursor-pointer disabled:opacity-50 disabled:bg-gray-300 disabled:border-gray-300 disabled:cursor-not-allowed"
                disabled={isSubmitting || status === "streaming" || status === "error" || !agentInput.trim()}
              >
                <div className="relative w-5 h-5 flex items-center justify-center">
                  <Send className={`h-5 w-5 absolute transition-all duration-300 ${(isSubmitting || status === "streaming" || status === "error") ? "opacity-0 scale-0" : "opacity-100 scale-100"}`} />
                  <Square className={`h-4 w-4 absolute transition-all duration-300 ${(isSubmitting || status === "streaming" || status === "error") ? "opacity-100 scale-100" : "opacity-0 scale-0"} text-white`} />
                </div>
                <span className="sr-only">{(isSubmitting || status === "streaming" || status === "error") ? "Processing" : "Send"}</span>
              </button>
            </div>
          </form>
          
          {/* Ramus footer now inside the fixed container */}
          <div className="flex justify-center text-gray-500 text-xs font-mono mb-2">            
            <a 
              href="https://landing.ramus.network" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="inline-flex items-center gap-1.5 text-[#6CA0D6] font-medium hover:underline cursor-pointer transition-colors"
            >              
              <span className="font-sans">Built on the Ramus Network</span>
              <img 
                src="/logo.png" 
                alt="Ramus Logo" 
                className="h-3.5 w-auto object-contain" 
              />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

const style = document.createElement('style');
style.textContent = `
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 3px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #ccc;
    border-radius: 3px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #aaa;
  }
  /* For Firefox */
  .custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: #ccc #f1f1f1;
  }
`;
document.head.appendChild(style);