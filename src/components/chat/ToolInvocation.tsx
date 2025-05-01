import React from 'react';
import { RefreshCw, Check, AlertTriangle } from 'lucide-react';
import { APPROVAL } from '../../shared';
import DocumentResults from '../documents/DocumentResults';
import { formatDateRange } from '../../utils/formatting';

// List of tools that require human confirmation before execution
// This is used to determine which tool invocations should display confirmation UI
// These tools must have corresponding executions in the server-side executions object
const toolsRequiringConfirmation: string[] = [
  "submitFeedback",
];

interface ToolInvocationProps {
  toolInvocation: any;
  messageId: string;
  index: number;
  conversationId: string;
  status: string;
  addToolResult: (result: { toolCallId: string; result: any }) => void;
}

/**
 * Component for rendering tool invocations in chat messages
 */
const ToolInvocation: React.FC<ToolInvocationProps> = ({
  toolInvocation,
  messageId,
  index,
  conversationId,
  status,
  addToolResult
}) => {
  const toolCallId = toolInvocation.toolCallId;
  const toolName = toolInvocation.toolName;
  
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
          <DocumentResults 
            resultData={toolInvocation.result} 
            chatStatus={status}
            conversationId={conversationId}
          />
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
    toolsRequiringConfirmation.includes(toolName) &&
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

export default ToolInvocation; 