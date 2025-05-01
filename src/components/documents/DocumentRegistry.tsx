import { useMemo } from 'react';

/**
 * Document registry for consistent citation numbering
 * Maintains a map of documents referenced in the conversation
 */
export interface DocumentRegistryType {
  documents: Map<string, { id: number, title: string }>;
  counter: number;
  registerDocument: (r2Key: string, title?: string) => number;
  getDocumentId: (r2Key: string) => number | null;
  getDocumentUrl: (r2Key: string) => string;
  getDocumentTitle: (r2Key: string) => string;
}

/**
 * Hook that creates a document registry instance 
 * @returns Document registry object with methods for tracking documents
 */
export function useDocumentRegistry(): DocumentRegistryType {
  return useMemo(() => {
    return {
      documents: new Map<string, { id: number, title: string }>(),
      counter: 0,
      
      /**
       * Register a document in the registry
       * @param r2Key Document key
       * @param title Optional document title
       * @returns Document ID (numbering system for citations)
       */
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
      
      /**
       * Get document ID if registered
       * @param r2Key Document key
       * @returns Document ID or null if not registered
       */
      getDocumentId(r2Key: string): number | null {
        return this.documents.has(r2Key) ? this.documents.get(r2Key)!.id : null;
      },
      
      /**
       * Get document viewer URL
       * @param r2Key Document key
       * @returns Full URL to document viewer
       */
      getDocumentUrl(r2Key: string): string {
        return `https://doc-viewer.ramus.network/${r2Key}`;
      },
      
      /**
       * Get document title
       * @param r2Key Document key
       * @returns Document title or generic fallback
       */
      getDocumentTitle(r2Key: string): string {
        return this.documents.has(r2Key) ? this.documents.get(r2Key)!.title : `Document`;
      }
    };
  }, []);
}

/**
 * Track document click with the server
 * @param r2Key Document key
 * @param conversationId Conversation ID
 */
export async function trackDocumentClick(r2Key: string, conversationId: string): Promise<void> {
  try {
    // Construct the full URL for the document click endpoint
    const clickUrl = `${window.location.origin}/document-click`;

    // Send tracking request to server
    const response = await fetch(clickUrl, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId,
        r2Key
      })
    });

    if (!response.ok) {
      console.error("Failed to track document click:", await response.text());
    }
  } catch (err) {
    // Log error but don't block document opening on failure
    console.error("Error tracking document click:", err);
  }
} 