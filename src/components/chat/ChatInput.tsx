import React, { useRef, useEffect, useState } from 'react';
import { Send, Square } from 'lucide-react';

interface ChatInputProps {
  input: string;
  isSubmitting: boolean;
  status: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: React.FormEvent) => void;
}

/**
 * Component for chat input and submission
 */
const ChatInput: React.FC<ChatInputProps> = ({
  input,
  isSubmitting,
  status,
  handleInputChange,
  handleSubmit
}) => {
  // Reference to the textarea for auto-resizing
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // State to track if textarea has reached max height
  const [isAtMaxHeight, setIsAtMaxHeight] = useState(false);

  // Auto-resize the textarea whenever input changes
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    // Function to adjust height based on content
    const adjustHeight = () => {
      // Store the current scroll position
      const scrollPos = window.scrollY;
      
      // Reset height to measure the scrollHeight accurately
      textarea.style.height = "40px";
      
      // Only grow if content exceeds the single line
      if (textarea.scrollHeight > 40) {
        // Limit the max height
        const newHeight = Math.min(textarea.scrollHeight, 200);
        textarea.style.height = `${newHeight}px`;
        
        // Check if we've reached max height
        setIsAtMaxHeight(textarea.scrollHeight >= 200);
      } else {
        setIsAtMaxHeight(false);
      }
      
      // Restore scroll position to prevent page jump
      window.scrollTo(0, scrollPos);
    };
    
    adjustHeight();
    
    // Add resize event listener for window resizing
    window.addEventListener("resize", adjustHeight);
    return () => window.removeEventListener("resize", adjustHeight);
  }, [input]);

  // Add scrollbar hiding styles to document
  useEffect(() => {
    // Only add/remove style if needed based on maxHeight state
    if (isAtMaxHeight) return;
    
    // Create style element for webkit browsers
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      textarea::-webkit-scrollbar {
        display: none;
      }
    `;
    document.head.appendChild(styleElement);
    
    // Clean up on unmount
    return () => {
      document.head.removeChild(styleElement);
    };
  }, [isAtMaxHeight]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!isSubmitting && status !== "streaming" && status !== "error" && input.trim()) {
          handleSubmit(e);
        }
      }}
      className="mb-2"
    >
      <div className="relative flex-1 rounded-lg bg-white transition-all duration-200 ease-in-out focus-within:ring-2 focus-within:ring-[#6CA0D6]/30 shadow-sm overflow-hidden border border-gray-200">
        <textarea
          ref={textareaRef}
          placeholder="Enter your research query..."
          className="w-full bg-white py-2.5 px-4 text-gray-800 border-none font-sans text-sm placeholder:text-gray-400 focus:outline-none resize-none pr-12 pb-12 custom-scrollbar"
          value={input}
          onChange={handleInputChange}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              // Check if input is blank before submitting
              if (!isSubmitting && status !== "streaming" && status !== "error" && input.trim()) {
                handleSubmit(e as unknown as React.FormEvent);
              }
            }
          }}
          rows={1}
          maxLength={60000}
          style={{
            height: "44px",
            minHeight: "44px",
            maxHeight: "200px",
            overflowY: "auto",
            ...(isAtMaxHeight
              ? {}
              : {
                  msOverflowStyle: "none",
                  scrollbarWidth: "none",
                  WebkitOverflowScrolling: "touch"
                }),
          }}
        />
        <button
          type="submit"
          className="border border-[#6CA0D6] bg-[#6CA0D6] text-white hover:bg-[#5a90c0] rounded-md p-2 absolute bottom-2.5 right-2.5 flex items-center justify-center transition-all duration-200 shadow-sm cursor-pointer disabled:opacity-50 disabled:bg-gray-300 disabled:border-gray-300 disabled:cursor-not-allowed"
          disabled={isSubmitting || status === "streaming" || status === "error" || !input.trim()}
        >
          <div className="relative w-5 h-5 flex items-center justify-center">
            <Send className={`h-5 w-5 absolute transition-all duration-300 ${(isSubmitting || status === "streaming" || status === "error") ? "opacity-0 scale-0" : "opacity-100 scale-100"}`} />
            <Square className={`h-4 w-4 absolute transition-all duration-300 ${(isSubmitting || status === "streaming" || status === "error") ? "opacity-100 scale-100" : "opacity-0 scale-0"} text-white`} />
          </div>
          <span className="sr-only">{(isSubmitting || status === "streaming" || status === "error") ? "Processing" : "Send"}</span>
        </button>
      </div>
    </form>
  );
};

export default ChatInput; 