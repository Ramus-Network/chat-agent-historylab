import React, { useState } from 'react';
import { FileText, AlertTriangle } from 'lucide-react';
import { trackDocumentClick } from './DocumentRegistry';

interface Document {
  document_id: string;
  file_info?: {
    r2Key?: string;
    metadata?: {
      title?: string;
      [key: string]: any;
    };
  };
  [key: string]: any;
}

interface DocumentResultsProps {
  resultData: any;
  chatStatus: string;
  conversationId: string;
}

/**
 * Component for displaying document search results
 */
const DocumentResults: React.FC<DocumentResultsProps> = ({ 
  resultData, 
  chatStatus,
  conversationId
}) => {
  const [copiedDocId, setCopiedDocId] = useState<string | null>(null);
  
  let documents: Document[] = [];
  let totalChunks = 0;
  let localStatus = 'unknown';
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

  // Error result component
  if (isError) {
    return (
      <div className="bg-red-50 p-3 border border-red-300 rounded-md text-red-700 flex items-center gap-2 shadow-sm">
        <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
        <span className="text-xs font-medium">Search Error: {errorMessage}</span>
      </div>
    );
  }
  
  // No results component
  if (documents.length === 0) {
    return (
      <div className="bg-gray-50 p-3 border border-gray-200 rounded-md text-gray-600 flex items-center gap-2 shadow-sm">
        <FileText size={14} className="text-gray-400 flex-shrink-0" />
        <span className="text-xs font-medium italic">No documents found matching your query.</span>
      </div>
    );
  }

  // Results component
  return (
    <div className="bg-blue-50/70 p-3 border border-blue-200 rounded-md text-gray-800 shadow-sm">
      <div className="text-xs font-medium mb-2 text-blue-800">
        Found {documents.length} documents             
        {/* {localStatus === 'partial_success' && <span className="text-amber-600 font-normal ml-1">(partial results)</span>} */}
      </div>
      <div className="flex flex-wrap gap-2">
        {documents.map((doc: Document, i: number) => {
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
                onClick={(e) => { 
                  if (!doc.file_info?.r2Key) {
                    e.preventDefault();
                    return;
                  }
                  
                  // Track document click before opening
                  trackDocumentClick(doc.file_info.r2Key, conversationId);
                }}
              >
                <FileText size={12} className={doc.file_info?.r2Key ? "text-blue-500" : "text-gray-400"} />
                <span className="truncate max-w-[200px]">
                  {doc.file_info?.metadata?.title || doc.document_id || 'Unknown Document'}
                </span>
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DocumentResults; 