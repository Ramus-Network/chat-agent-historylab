import React from 'react';
import { Share, RotateCcw, FileDown, ExternalLink } from 'lucide-react';
import LoginButton from '../auth/LoginButton';

interface ChatHeaderProps {
  status: string;
  hasMessages: boolean;
  urlCopied: boolean;
  shareConversationUrl: () => void;
  exportConversation: () => void;
  openNewConversation: () => void;
}

/**
 * Component for the chat header with action buttons
 */
const ChatHeader: React.FC<ChatHeaderProps> = ({
  status,
  hasMessages,
  urlCopied,
  shareConversationUrl,
  exportConversation,
  openNewConversation
}) => {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 lg:px-8">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Logo" className="h-6 w-auto" />
            <div className="hidden font-semibold md:block text-gray-900">
              HistoryLab AI
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Login Button */}
          <LoginButton />
          
          {/* Export Button - Only enabled when there are messages */}
          <button
            onClick={exportConversation}
            disabled={!hasMessages || status === "streaming" || status === "submitted"}
            className="inline-flex h-8 items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400 text-gray-600 px-3 py-1 rounded-md"
            aria-label="Export conversation"
          >
            <FileDown className="h-4 w-4 md:mr-1" />
            <span className="hidden md:inline-block">Export</span>
          </button>
          
          {/* Share Button - Only enabled when there are messages */}
          <button
            onClick={shareConversationUrl}
            disabled={!hasMessages || status === "streaming" || status === "submitted"}
            className={`inline-flex h-8 items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400 text-gray-600 px-3 py-1 rounded-md
            ${urlCopied ? 'bg-green-100 text-green-800 hover:bg-green-100' : ''}`}
            aria-label="Share conversation link"
          >
            <Share className="h-4 w-4 md:mr-1" />
            <span className="hidden md:inline-block">{urlCopied ? 'Copied!' : 'Share'}</span>
          </button>
          
          {/* New Chat Button */}
          <button
            onClick={openNewConversation}
            className="inline-flex h-8 items-center justify-center text-sm font-medium transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400 text-gray-600 px-3 py-1 rounded-md"
            aria-label="New chat"
          >
            <RotateCcw className="h-4 w-4 md:mr-1" />
            <span className="hidden md:inline-block">New</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default ChatHeader; 