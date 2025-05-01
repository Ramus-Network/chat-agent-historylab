// utils/hash-utils.ts
// Utilities for working with hashed conversation components

import { COLLECTION_ID } from "../config";
import { logError } from "../../shared";

/**
 * Decode the hashed components of a conversation ID
 * This must match the frontend implementation
 */
export function decodeHashedComponents(hash: string): { userId: string, collectionId: string, convoId: string } {
  try {
    // Decode the base64 string - use Buffer for Node.js environment
    const decoded = Buffer.from(hash, 'base64').toString('utf-8');
    
    // Split by the delimiter
    const [userId, collectionId, convoId] = decoded.split('|');
    
    return { userId, collectionId, convoId };
  } catch (e) {
    logError("decodeHashedComponents", "Failed to decode hash", e, { hash });
    // Return fallback values if decoding fails
    return { 
      userId: 'unknown', 
      collectionId: COLLECTION_ID, 
      convoId: `fallback-${Date.now()}`
    };
  }
}

/**
 * Encode the components into a hashed conversation ID
 * This must match the frontend implementation
 */
export function encodeHashedComponents(userId: string, collectionId: string, convoId: string): string {
  try {
    // Join components with a delimiter
    const combined = `${userId}|${collectionId}|${convoId}`;
    
    // Encode to base64
    return Buffer.from(combined).toString('base64');
  } catch (e) {
    logError("encodeHashedComponents", "Failed to encode components", e, { userId, collectionId, convoId });
    // Return fallback value
    return Buffer.from(`unknown|${COLLECTION_ID}|fallback-${Date.now()}`).toString('base64');
  }
} 