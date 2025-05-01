import React from 'react';
import { ExternalLink, Download, LinkIcon, RefreshCw } from 'lucide-react';

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
                {status === "ready" && hasMessages && (
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
                  onClick={exportConversation}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-gray-300 bg-white text-xs font-medium ring-offset-white transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6CA0D6]/50 focus-visible:ring-offset-1 px-2 text-gray-700 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5 icon-visible mr-1 text-gray-500" />
                  <span>EXPORT</span>
                </button>

                <button
                  onClick={openNewConversation}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-gray-300 bg-white text-xs font-medium ring-offset-white transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6CA0D6]/50 focus-visible:ring-offset-1 px-2 text-gray-700 cursor-pointer"
                >
                  <ExternalLink className="h-3.5 w-3.5 icon-visible mr-1 text-gray-500" />
                  <span>NEW CONV</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default ChatHeader; 