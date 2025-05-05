import { useState, useCallback, useEffect } from 'react';
import { COLLECTION_ID, hashComponents, decodeHashedComponents, generateUserId, generateConversationId } from '../utils/hash';
import { useAuth } from './useAuth';
import { AUTH_CONFIG } from '../config';

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
  
  // State for conversation ID (from URL query parameter or newly generated)
  const [conversationId, setConversationId] = useState(() => {
    // Check if there's an ID in the URL query parameter
    const urlParams = new URLSearchParams(window.location.search);
    const idFromUrl = urlParams.get('id');
    
    // If we have an ID and it's a hash we created, use it
    if (idFromUrl && idFromUrl.length > 20) {
      try {
        // Try to decode it to ensure it's valid
        decodeHashedComponents(idFromUrl);
        return idFromUrl;
      } catch (e) {
        console.error('Invalid conversation ID format:', e);
        // Fall through to create a new ID
      }
    }
    
    // Create a new conversation-specific ID
    const newConvoId = generateConversationId();
    
    // Hash the components
    const hashedId = hashComponents(userId, COLLECTION_ID, newConvoId);
    
    // Update the URL with the new ID as a query parameter using replaceState for the initial load
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
    
    // Update state and URL
    setConversationId(hashedId);
    
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('id', hashedId);
    // Use pushState here to create a new history entry for the *new* conversation
    window.history.pushState({ conversationId: hashedId }, '', newUrl.toString());
    
    return hashedId;
  }, [userId]);

  // Function to share current conversation URL
  const shareConversationUrl = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000); // Reset copied state after 2 seconds
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