import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAgent } from "agents-sdk/react";
import { useAgentChat } from "agents-sdk/ai-react";
import type { Message } from "@ai-sdk/react";
import { RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';

import ChatHeader from './ChatHeader';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import ExampleQueries from './ExampleQueries';
import { useDocumentRegistry } from '../documents/DocumentRegistry';
import { useConversation } from '../../hooks/useConversation';
import { useFeedback } from '../../hooks/useFeedback';
import { exportConversation } from '../../utils/exportConversation';

// Response timeout in milliseconds (5 seconds)
const RESPONSE_TIMEOUT = 5000;

/**
 * Main chat container component 
 */
const ChatContainer: React.FC = () => {
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
  
  // Reference to the bottom of the messages container for auto-scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Ref for the input container to measure its position
  const inputContainerRef = useRef<HTMLDivElement>(null);

  // Get conversation management hooks
  const {
    userId,
    conversationId,
    createNewConversation,
    urlCopied,
    shareConversationUrl
  } = useConversation();

  // Initialize the document registry
  const documentRegistry = useDocumentRegistry();

  // Initialize the agent connection
  const agent = useAgent({
    agent: "chat",
    name: conversationId
  });

  // Hook to manage the chat state and interactions
  const {
    messages: agentMessages,
    input: agentInput,
    handleInputChange: handleAgentInputChange,
    handleSubmit: handleAgentSubmit,
    addToolResult,
    clearHistory,
    status,
  } = useAgentChat({
    agent,
    maxSteps: 5,
  });

  // Initialize the feedback hook
  const { feedbackState, handleFeedback } = useFeedback(conversationId, agentMessages);

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
    }
  }, [status]);

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

  // Function to reload the page
  const handleReload = () => {
    window.location.reload();
  };

  // Function to open a new conversation in a new tab
  const openNewConversation = () => {
    window.open(window.location.pathname, '_blank', 'noopener,noreferrer');
  };

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
    }, 150);
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

  // Keep-alive mechanism to maintain warm Durable Object connection
  useEffect(() => {
    const keepAliveIntervalRef = { current: null as NodeJS.Timeout | null };
    
    // Only set up keep-alive if we have an agent and a conversation ID
    if (agent && conversationId) {
      // Function to send a keep-alive ping
      const sendKeepAlive = async () => {
        try {
          // A minimal interaction with the agent to keep the connection alive
          // This uses the agent's public methods rather than internal properties
          if (agent && typeof agent.send === 'function') {
            // Send an empty ping message as a string
            // agent.send('ping');            
            // const response = await fetch(`${window.location.origin}/ping`);
            // console.log('Staying alive, staying alive, ah ah ah ... STAYING ALIVE');
          }
        } catch (err) {
          console.log('Keep-alive error (non-critical):', err);
          // Don't stop the interval on errors - keep trying
        }
      };
      
      // Initial ping
      sendKeepAlive();
      
      // Set up regular interval (every 45 seconds to stay under CF 60s timeout)
      keepAliveIntervalRef.current = setInterval(sendKeepAlive, 5000);
    }
    
    // Clean up interval on unmount
    return () => {
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current);
        keepAliveIntervalRef.current = null;
        console.log('WebSocket keep-alive disabled');
      }
    };
  }, [agent, conversationId]);

  // Add status monitoring to reload page if undefined for too long
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;

    // If status is undefined, start a timer
    if (status === 'submitted') {
      timeoutId = setTimeout(() => {
        console.log('Status remained submitted for too long - reloading page');
        window.location.reload();
      }, 10000); // 10 second timeout
    }

    // Cleanup function to clear timeout if status changes before timeout
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [status]);

  // Debug logging for status
  useEffect(() => {
    const intervalId = setInterval(() => {
      console.log('Current chat status:', status);
    }, 5000);

    return () => clearInterval(intervalId);
  }, [status]);

  // Track user activity and reload on inactivity
  useEffect(() => {
    let inactivityTimeout: NodeJS.Timeout | null = null;
    let lastActivityTime = Date.now();

    // Function to reset the inactivity timer
    const resetInactivityTimer = () => {
      lastActivityTime = Date.now();
      if (inactivityTimeout) {
        clearTimeout(inactivityTimeout);
      }
      
      inactivityTimeout = setTimeout(() => {
        const timeSinceLastActivity = Date.now() - lastActivityTime;
        if (timeSinceLastActivity >= 60000) { // 1 minute
          console.log('Page inactive for 1 minute - reloading');
          window.location.reload();
        }
      }, 60000); // Check after 1 minute
    };

    // Events to track user activity
    const activityEvents = [
      'mousedown', 'mousemove', 'keydown',
      'scroll', 'touchstart', 'wheel', 'focus'
    ];

    // Add event listeners
    activityEvents.forEach(eventName => {
      window.addEventListener(eventName, resetInactivityTimer);
    });

    // Initial setup
    resetInactivityTimer();

    // Cleanup
    return () => {
      if (inactivityTimeout) {
        clearTimeout(inactivityTimeout);
      }
      activityEvents.forEach(eventName => {
        window.removeEventListener(eventName, resetInactivityTimer);
      });
    };
  }, []); // Empty dependency array since this should only set up once

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
  }, [status]);

  // Add global click handler for citations
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
    
    // Add event listener to the document
    document.addEventListener('click', handleGlobalCitationClick);
    
    // Clean up
    return () => {
      document.removeEventListener('click', handleGlobalCitationClick);
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

  // Helper function to handle export
  const handleExportConversation = () => {
    exportConversation(agentMessages, documentRegistry);
  };

  // Helper function to handle example query selection
  const handleExampleQuerySelect = (query: string) => {
    handleAgentInputChange({ target: { value: query } } as React.ChangeEvent<HTMLTextAreaElement>);
    setTimeout(() => {
      if (!isSubmitting && status !== "streaming" && status !== "error") {
        const form = document.querySelector('form');
        if (form) {
          form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
      }
    }, 100);
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-white text-gray-800 font-sans antialiased transition-all pb-0 selection:bg-[#6CA0D6] selection:text-white">
      <ChatHeader 
        status={status}
        hasMessages={agentMessages.length > 0}
        urlCopied={urlCopied}
        shareConversationUrl={shareConversationUrl}
        exportConversation={handleExportConversation}
        openNewConversation={openNewConversation}
      />
      
      <div className="flex-1 overflow-hidden pb-20 bg-white">
        <div className="mx-auto max-w-6xl mt-4 mb-0 flex-1 overflow-hidden px-4 lg:px-8 py-0">
          <div className="flex flex-col">
            <div className="flex-1 overflow-y-auto mt-2 pr-2 custom-scrollbar bg-white" ref={scrollContainerRef}>
              <div className="pb-[80px] bg-white">
                {agentMessages.length === 0 ? (
                  <div className="bg-white p-4 m-4 mt-8 rounded-lg border border-gray-200">
                    <div className="markdown-condensed text-[#6CA0D6] text-sm text-left mb-4 font-sans">
                      <div className="whitespace-pre-wrap break-words text-gray-800 markdown-condensed">
                        <h1 className="text-gray-900 font-bold text-xl mb-1 mt-2">Welcome to HistoryLab AI</h1>
                        <p className="text-gray-800 mb-0">
                          An AI assistant for exploring declassified government documents, diplomatic cables, intelligence reports, and historical archives. Access nearly 5 million documents (18+ million pages) including Presidential Daily Briefings (1946-1977), State Department Files (1973-1979), CIA CREST Collection (1941-2005), Clinton Emails (2009-2013), UN Archives (1997-2016), World Bank records (1942-2020), and more.
                        </p>
                      </div>
                    </div>
                    <ExampleQueries onSelectQuery={handleExampleQuerySelect} />
                  </div>
                ) : (
                  <>
                    {agentMessages.map((message: Message, index) => {
                      const isLastMessage = index === agentMessages.length - 1;
                      
                      return (
                        <ChatMessage
                          key={message.id}
                          message={message}
                          isLastMessage={isLastMessage}
                          status={status}
                          documentRegistry={documentRegistry}
                          conversationId={conversationId}
                          addToolResult={addToolResult}
                          feedbackState={feedbackState}
                          handleFeedback={handleFeedback}
                        />
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
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                          </div>
                          <div className="rounded-lg flex flex-col bg-red-50 border border-red-300 overflow-hidden w-fit max-w-[calc(100%-3rem)] shadow-sm">
                            <div className="px-3 py-1.5 font-mono text-xs border-b border-red-300 flex items-center justify-between bg-red-50">
                              <div className="flex items-center">
                                <AlertTriangle className="h-3.5 w-3.5 mr-1.5 text-red-600" />
                                <span className="font-semibold text-xs tracking-wide text-red-700">
                                  ERROR
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
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
                                    onClick={openNewConversation}
                                    className="inline-flex h-8 items-center justify-center border border-red-400 bg-red-100 text-sm font-medium transition-colors hover:bg-red-200 focus-visible:outline-none px-3 text-red-800 text-xs rounded-md"
                                  >
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
          {/* Loading indicator when submitting */}
          {status === 'submitted' && (
            <div className="flex justify-center items-center py-2">
              <Loader2 className="h-5 w-5 text-gray-500 animate-spin" />
            </div>
          )}
          <ChatInput
            input={agentInput}
            isSubmitting={isSubmitting}
            status={status}
            handleInputChange={handleAgentInputChange}
            handleSubmit={handleSubmit}
          />
          
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
};

export default ChatContainer;