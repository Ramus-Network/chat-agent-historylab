// Hashing and ID management utilities

// Collection ID constant (matches the server-side constant)
export const COLLECTION_ID = '80650a98-fe49-429a-afbd-9dde66e2d02b'; // history-lab-1

/**
 * Simple hash function to obfuscate the ID components
 * @param userId User identifier
 * @param collectionId Collection identifier
 * @param conversationId Conversation identifier
 * @returns Hashed string combining all components
 */
export function hashComponents(userId: string, collectionId: string, conversationId: string): string {
  // Create a string with all components separated by a delimiter that won't appear in the IDs
  const combined = `${userId}|${collectionId}|${conversationId}`;
  
  // Use btoa for base64 encoding (simple obfuscation, not secure encryption)
  return btoa(combined);
}

/**
 * Function to decode the hashed components (server-side counterpart)
 * @param hash The hashed string to decode
 * @returns Object containing the original userId, collectionId, and conversationId
 */
export function decodeHashedComponents(hash: string): { 
  userId: string, 
  collectionId: string, 
  conversationId: string 
} {
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

/**
 * Generate a new userId
 * @returns Newly generated user ID
 */
export function generateUserId(): string {
  return `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate a new conversation ID
 * @returns Newly generated conversation ID
 */
export function generateConversationId(): string {
  return `convo_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
} 