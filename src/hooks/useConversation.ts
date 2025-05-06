import { useState, useCallback, useEffect } from 'react';
import { COLLECTION_ID, hashComponents, decodeHashedComponents, generateUserId, generateConversationId } from '../utils/hash';
import { useAuth } from './useAuth';
import { AUTH_CONFIG } from '../config';

// Session storage key for conversation ID
const CONVERSATION_ID_KEY = 'historylab_conversation_id';

type ConversationHookReturn = {
  userId: string;
  conversationId: string;
  createNewConversation: () => string;
  urlCopied: boolean;
  shareConversationUrl: () => void;
};

/**
 * Hook to manage user and conversation IDs
 * Handles URL parameters, history API, and sharing functionality
 */
export function useConversation(): ConversationHookReturn {
  const { isAuthenticated, user } = useAuth();

  // Get or create userId from token or generate a new one
  const [userId, setUserId] = useState<string>(() => {
    // Try to get the authenticated user ID from token
    const token = sessionStorage.getItem(AUTH_CONFIG.TOKEN_KEY);
    
    if (token) {
      try {
        // Parse the token data
        const tokenData = JSON.parse(atob(token));
        if (tokenData.uuid) {
          // Use the authenticated user's UUID as userId
          return tokenData.uuid;
        }
      } catch (e) {
        console.error('Error parsing auth token:', e);
      }
    }
    
    // If not authenticated, fall back to the existing user ID system
    const userIdCookie = document.cookie.split(';').map(c => c.trim())
      .find(c => c.startsWith('historylab_user_id='));
    
    if (userIdCookie) {
      return userIdCookie.split('=')[1];
    }
    
    // If no userId found, generate a new one
    const newUserId = generateUserId();
    
    // Set the cookie (expires in 1 year)
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    document.cookie = `historylab_user_id=${newUserId};expires=${expiryDate.toUTCString()};path=/;SameSite=Strict`;
    
    return newUserId;
  });
  
  // Update userId if the authentication state changes
  useEffect(() => {
    // When a user logs in, update the userId to match their authenticated ID
    if (isAuthenticated && user) {
      const token = sessionStorage.getItem(AUTH_CONFIG.TOKEN_KEY);
      if (token) {
        try {
          // Parse the token data
          const tokenData = JSON.parse(atob(token));
          if (tokenData.uuid && tokenData.uuid !== userId) {
            setUserId(tokenData.uuid);
          }
        } catch (e) {
          console.error('Error parsing auth token:', e);
        }
      }
    }
  }, [isAuthenticated, userId, user]);
  
  // State for conversation ID (from URL query parameter, session storage, or newly generated)
  const [conversationId, setConversationId] = useState(() => {
    // Check if there's an ID in the URL query parameter
    const urlParams = new URLSearchParams(window.location.search);
    const idFromUrl = urlParams.get('id');
    
    // If we have an ID in URL and it's a valid hash, use it
    if (idFromUrl && idFromUrl.length > 20) {
      try {
        // Try to decode it to ensure it's valid
        decodeHashedComponents(idFromUrl);
        
        // Save to session storage for this tab
        sessionStorage.setItem(CONVERSATION_ID_KEY, idFromUrl);
        
        return idFromUrl;
      } catch (e) {
        console.error('Invalid conversation ID format from URL:', e);
        // Fall through to check session storage
      }
    }
    
    // If no valid ID in URL, check session storage
    const idFromSession = sessionStorage.getItem(CONVERSATION_ID_KEY);
    if (idFromSession) {
      try {
        // Verify it's valid
        decodeHashedComponents(idFromSession);
        
        // Update the URL with the session ID as a query parameter
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('id', idFromSession);
        window.history.replaceState({ conversationId: idFromSession }, '', newUrl.toString());
        
        return idFromSession;
      } catch (e) {
        console.error('Invalid conversation ID format from session storage:', e);
        // Fall through to create a new ID
      }
    }
    
    // Create a new conversation-specific ID if not found in URL or session
    const newConvoId = generateConversationId();
    
    // Hash the components
    const hashedId = hashComponents(userId, COLLECTION_ID, newConvoId);
    
    // Save to session storage
    sessionStorage.setItem(CONVERSATION_ID_KEY, hashedId);
    
    // Update the URL with the new ID as a query parameter
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('id', hashedId);
    // Use replaceState so the initial load doesn't create an extra history entry
    window.history.replaceState({ conversationId: hashedId }, '', newUrl.toString());
    
    return hashedId;
  });
  
  // State for tracking whether the URL has been copied (for share button feedback)
  const [urlCopied, setUrlCopied] = useState(false);

  // Function to create a new conversation ID
  const createNewConversation = useCallback(() => {
    // Create a new conversation-specific ID
    const newConvoId = generateConversationId();
    
    // Hash the components 
    const hashedId = hashComponents(userId, COLLECTION_ID, newConvoId);
    
    // Update state
    setConversationId(hashedId);
    
    // Save to session storage
    sessionStorage.setItem(CONVERSATION_ID_KEY, hashedId);
    
    // Update URL
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('id', hashedId);
    // Use pushState here to create a new history entry for the *new* conversation
    window.history.pushState({ conversationId: hashedId }, '', newUrl.toString());
    
    return hashedId;
  }, [userId]);

  // Function to share current conversation URL
  const shareConversationUrl = useCallback(() => {
    // Check if we're running in an iframe
    const isInIframe = window !== window.parent;
    
    if (isInIframe) {
      try {
        // Fallback method using a temporary textarea element
        const textArea = document.createElement('textarea');
        textArea.value = window.location.href;
        
        // Make the textarea invisible but part of the document
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        textArea.style.left = '0';
        textArea.style.top = '0';
        textArea.style.width = '1px';
        textArea.style.height = '1px';
        textArea.style.padding = '0';
        
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        // Try to use the older document.execCommand method
        const successful = document.execCommand('copy');
        
        // Clean up
        document.body.removeChild(textArea);
        
        if (successful) {
          setUrlCopied(true);
          setTimeout(() => setUrlCopied(false), 2000);
        } else {
          // Show a manual copy dialog or message if execCommand also fails
          // This could be a fallback alert with instructions
          alert('Clipboard access is restricted. Please copy this URL manually: ' + window.location.href);
        }
      } catch (err) {
        // If all else fails, show the URL to manually copy
        alert('Clipboard access is restricted. Please copy this URL manually: ' + window.location.href);
      }
    } else {
      // Use the Clipboard API in normal (non-iframe) context
      navigator.clipboard.writeText(window.location.href)
        .then(() => {
          setUrlCopied(true);
          setTimeout(() => setUrlCopied(false), 2000);
        })
        .catch(() => {
          // Fallback if Clipboard API fails for some reason
          alert('Could not copy to clipboard. Please copy this URL manually: ' + window.location.href);
        });
    }
  }, []);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const urlParams = new URLSearchParams(window.location.search);
      const idFromUrl = urlParams.get('id');
      const stateConversationId = event.state?.conversationId; // Get ID from history state if available

      // Prefer the ID from the history state object if it exists and differs from current
      const targetId = stateConversationId || idFromUrl;

      if (targetId && targetId !== conversationId) {
        try {
          // Validate the ID format
          decodeHashedComponents(targetId);
          console.log(`Restoring conversation ID from history: ${targetId}`);
          setConversationId(targetId);
          
          // Update session storage
          sessionStorage.setItem(CONVERSATION_ID_KEY, targetId);
        } catch (e) {
          console.error('Invalid conversation ID during popstate:', e, targetId);
          // If ID is invalid, create a new one
          createNewConversation();
        }
      } else if (!targetId) {
         // If no ID is found in URL or state
         console.log("No valid ID found on popstate, creating new conversation.");
         createNewConversation();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [conversationId, createNewConversation]);

  return {
    userId,
    conversationId,
    createNewConversation,
    urlCopied,
    shareConversationUrl
  };
} 