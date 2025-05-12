import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
// import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/solid'; // Example using heroicons

// Define FAQ item type
interface FAQItem {
  question: string;
  answer: React.ReactNode; // Allow JSX in answers
}

const LoginScreen: React.FC = () => {
  const { login } = useAuth();
  const [openFAQ, setOpenFAQ] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setOpenFAQ(openFAQ === index ? null : index);
  };

  const faqs: FAQItem[] = [
    {
      question: "What is HistoryLab AI?",
      answer: (
        <>
          HistoryLab AI is an experimental interface built upon the{' '}
          <a href="https://lab.history.columbia.edu/" target="_blank" rel="noopener noreferrer" className="text-[#6CA0D6] hover:underline">
            Columbia University History Lab
          </a>. It allows researchers, students, and the public to explore vast archives of historical documents, primarily declassified government records, using natural language queries. Our goal is to make primary sources more accessible and analyzable.
        </>
      ),
    },
    {
      question: "How does the AI work?",
      answer: "We use advanced AI techniques like Retrieval-Augmented Generation (RAG) and vector search. This allows the system to understand your natural language questions, find the most relevant document excerpts from the archive, and generate summaries or answers based only on those documents.",
    },
    {
      question: "Is this service free?",
      answer: "Yes, HistoryLab AI is currently provided as a free academic service. It is a non-profit project focused on research and education, built using public domain information.",
    },
    {
      question: "What kind of documents can I find?",
      answer: (
        <>
          The Freedom of Information Archive (FOIArchive) contains nearly 5 million declassified documents across multiple collections, including:
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Presidential Daily Briefings (1946-1977)</li>
            <li>UK Cabinet Papers (1907-1990)</li>
            <li>State Department Central Foreign Policy Files (1973-1979)</li>
            <li>CIA CREST Collection (1941-2005)</li>
            <li>Clinton Email Collection (2009-2013)</li>
            <li>Foreign Relations of the United States (FRUS)</li>
            <li>Kissinger Telephone Conversations (1973-1976)</li>
            <li>NATO Archives (1949-2013)</li>
            <li>UN Archives (1997-2016)</li>
            <li>World Bank Archives (1942-2020)</li>
          </ul>
          <p className="mt-2">
            Most documents are in English, with some French content in the UN, NATO and World Bank collections. The archive includes memos, reports, cables, briefings, and other government records obtained through FOIA requests and public sources.
          </p>
        </>
      ),
    },
    {
      question: "Who built this?",
      answer: (
        <>
         HistoryLab AI is developed by the team at{' '}
          <a href="https://lab.history.columbia.edu/directory" target="_blank" rel="noopener noreferrer" className="text-[#6CA0D6] hover:underline">
           Columbia's History Lab
          </a>, leveraging the underlying infrastructure of the{' '}
          <a href="https://landing.ramus.network" target="_blank" rel="noopener noreferrer" className="text-[#6CA0D6] hover:underline">
            Ramus network
          </a>{' '}
          for AI capabilities.
        </>
      ),
    },
    {
      question: "Is HistoryLab legally allowed to provide access to these documents?",
      answer: (
        <>
          Yes. All documents in our archive were originally under CC0 (public-domain) licenses. This means they are explicitly released into the public domain with no copyright restrictions, making our derivative work and distribution legally legitimate. We take data ethics seriously—our mission as historians is to improve access to historically important public-domain materials while respecting both legal requirements and scholarly standards.
         </>
      ),
    },
  ];


  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Decorative pattern background */}
      <div className="absolute inset-0 z-0 overflow-hidden opacity-10 pointer-events-none">
        <div className="absolute inset-0" style={{ 
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cg fill='%236ca0d6' fill-opacity='0.2'%3E%3Cpath d='M0 0h40v40H0V0zm40 40h40v40H40V40zm0-40h2l-2 2V0zm0 4l4-4h2l-6 6V4zm0 4l8-8h2L40 10V8zm0 4L52 0h2L40 14v-2zm0 4L56 0h2L40 18v-2zm0 4L60 0h2L40 22v-2zm0 4L64 0h2L40 26v-2zm0 4L68 0h2L40 30v-2zm0 4L72 0h2L40 34v-2zm0 4L76 0h2L40 38v-2zm0 4L80 0v2L42 40h-2zm4 0L80 4v2L46 40h-2zm4 0L80 8v2L50 40h-2zm4 0l28-28v2L54 40h-2zm4 0l24-24v2L58 40h-2zm4 0l20-20v2L62 40h-2zm4 0l16-16v2L66 40h-2zm4 0l12-12v2L70 40h-2zm4 0l8-8v2l-6 6h-2zm4 0l4-4v2l-2 2h-2z'/%3E%3C/g%3E%3C/svg%3E")`,
          backgroundSize: '60px 60px'
        }}></div>
      </div>

      <div className="flex-grow container mx-auto px-4 py-8 md:py-12 relative z-10">
        {/* Main Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 items-center max-w-7xl mx-auto">
          
          {/* Left Column: Login */}
          <div className="bg-white p-8 md:p-10 rounded-2xl shadow-lg border border-gray-100 transform transition duration-500 hover:shadow-xl">
            <div className="text-center mb-8">
              <div className="mb-6 flex justify-center">
                <img 
                  src="/logo.png" 
                  alt="HistoryLab Logo" 
                  className="h-16 w-auto" 
                />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">Sign in to HistoryLab AI</h1>
              <p className="text-gray-600">
                Access the archive and AI assistants.
              </p>
            </div>
            
            <div className="space-y-6">
              <button
                onClick={login}
                className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-base font-medium text-white bg-[#6CA0D6] hover:bg-[#5a90c0] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#6CA0D6] transition-all duration-300 transform hover:-translate-y-1"
              >
                <svg className="w-5 h-5 mr-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                  <path d="M12 5.38c1.63 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Sign in with Google
              </button>
              
              <div className="text-xs text-center text-gray-500 pt-2">
                By signing in, you agree to our{' '}
                <a href="https://auth.ramus.network/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-[#6CA0D6] hover:underline">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="https://auth.ramus.network/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-[#6CA0D6] hover:underline">
                  Privacy Policy
                </a>.
              </div>
            </div>
            
            {/* Subtle Ramus Branding */}
            <div className="mt-8 text-center text-xs text-gray-400">
              <div className="flex justify-center items-center gap-1">
                <span>Powered by</span>
                <img 
                  src="/logo.png" // Assuming this is the Ramus logo based on original code
                  alt="Ramus Network Logo" 
                  className="h-3 w-auto opacity-60" 
                />
                <a href="https://landing.ramus.network" target="_blank" rel="noopener noreferrer" className="opacity-60 hover:text-[#6CA0D6]">Ramus Network</a>
              </div>
            </div>
          </div>

          {/* Right Column: Information */}
          <div className="order-1 md:order-2 space-y-6 text-gray-700">            
            
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 leading-tight">
              AI-Powered <span className="text-[#6CA0D6]">FOIA Archive</span> Search
            </h2>
            
            <p className="text-lg">
              Welcome to HistoryLab AI, a free research tool from{' '}
              <a href="https://lab.history.columbia.edu/" target="_blank" rel="noopener noreferrer" className="text-[#6CA0D6] hover:underline font-medium">
                Columbia University's History Lab
              </a>.
            </p>
            
            <div className="bg-gray-50 border-l-4 border-[#6CA0D6] p-4 rounded-r-lg">
              <p className="italic text-gray-700">
                Search 5M+ declassified CIA files, FRUS volumes, and State Department cables with natural language. Ask "show me NSC memos on the Berlin blockade" to get instant primary source excerpts.
              </p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
              <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100 flex items-start">
                <div className="bg-blue-100 p-2 rounded-md text-[#6CA0D6] mr-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium">CIA & Diplomatic Cables</h3>
                  <p className="text-sm text-gray-600">Search assessments and cables</p>
                </div>
              </div>
              
              <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100 flex items-start">
                <div className="bg-blue-100 p-2 rounded-md text-[#6CA0D6] mr-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium">AI Recommendations</h3>
                  <p className="text-sm text-gray-600">Smart document suggestions</p>
                </div>
              </div>
              
              <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100 flex items-start">
                <div className="bg-blue-100 p-2 rounded-md text-[#6CA0D6] mr-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium">FOIA Materials</h3>
                  <p className="text-sm text-gray-600">Declassified document access</p>
                </div>
              </div>
              
              <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100 flex items-start">
                <div className="bg-blue-100 p-2 rounded-md text-[#6CA0D6] mr-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium">Free Academic Service</h3>
                  <p className="text-sm text-gray-600">Research without barriers</p>
                </div>
              </div>
            </div>                      
          </div>
        </div>

        {/* FAQs Section */}
        <div className="mt-20 pt-12 border-t border-gray-200 max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-[#6CA0D6] font-semibold tracking-wider uppercase text-sm">Questions</span>
            <h2 className="text-3xl font-bold text-gray-800 mt-2">Frequently Asked Questions</h2>
            <p className="text-gray-600 mt-4 max-w-2xl mx-auto">Learn more about how HistoryLab AI works and what you can do with this research tool.</p>
          </div>
          
          <div className="max-w-3xl mx-auto space-y-4">
            {faqs.map((faq, index) => (
              <div key={index} className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100 hover:border-[#6CA0D6] transition-colors duration-300">
                <button
                  onClick={() => toggleFAQ(index)}
                  className="flex justify-between items-center w-full p-5 text-left font-medium text-gray-700 hover:text-[#6CA0D6] focus:outline-none transition-colors duration-300"
                >
                  <span>{faq.question}</span>
                  <span className="text-xl transition-transform duration-300" style={{ transform: openFAQ === index ? 'rotate(45deg)' : 'rotate(0deg)' }}>+</span>
                </button>
                {openFAQ === index && (
                  <div className="p-5 border-t border-gray-100 text-sm md:text-base text-gray-600 bg-gray-50">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12 py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center mb-4 md:mb-0">
              <img 
                src="/logo.png" 
                alt="HistoryLab Logo" 
                className="h-8 w-auto mr-3" 
              />
              <span className="font-semibold text-gray-700">HistoryLab AI</span>
            </div>
            
            <div className="flex space-x-6 mb-4 md:mb-0">
              <a href="https://bsky.app/profile/history-lab.bsky.social" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-[#6CA0D6] transition-colors duration-300" title="BlueSky">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="currentColor" viewBox="0 0 512 512"><path d="M464 32H48C21.5 32 0 53.5 0 80v352c0 26.5 21.5 48 48 48h416c26.5 0 48-21.5 48-48V80c0-26.5-21.5-48-48-48zm-94.1 215.8l-132 96.1c-11.3 8.3-26.9 1.5-29.8-12.1l-25.5-123c-1.7-8.2 4.1-16 12.3-17.7l123-25.5c13.6-2.8 26.2 7.6 23.4 21.2l-28 161zm-73.2-44.4c13.6-2.8 26.2 7.6 23.4 21.2l-28 161c-2.8 13.6-18.5 20.4-29.8 12.1l-132-96.1c-11.3-8.3-14-23.9-6.3-35.2l85.5-127.1c7.8-11.5 23.3-13.9 35.2-6.3l47 28.4z"/></svg>
                <span className="sr-only">BlueSky</span>
              </a>
              <a href="https://twitter.com/history_lab_org" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-[#6CA0D6] transition-colors duration-300" title="Twitter">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="currentColor" viewBox="0 0 512 512"><path d="M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z"/></svg>
                <span className="sr-only">Twitter</span>
              </a>
              <a href="https://www.youtube.com/@columbiauniversityhistoryl2716" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-[#6CA0D6] transition-colors duration-300" title="YouTube">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="currentColor" viewBox="0 0 576 512"><path d="M549.7 124.1c-6.3-23.7-24.8-42.3-48.3-48.6C458.8 64 288 64 288 64S117.2 64 74.6 75.5c-23.5 6.3-42 24.9-48.3 48.6-11.4 42.9-11.4 132.3-11.4 132.3s0 89.4 11.4 132.3c6.3 23.7 24.8 41.5 48.3 47.8C117.2 448 288 448 288 448s170.8 0 213.4-11.5c23.5-6.3 42-24.2 48.3-47.8 11.4-42.9 11.4-132.3 11.4-132.3s0-89.4-11.4-132.3zM232 347.7V164.3l145.1 91.7-145.1 91.7z"/></svg>
                <span className="sr-only">YouTube</span>
              </a>
              <a href="https://github.com/history-lab" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-[#6CA0D6] transition-colors duration-300" title="GitHub">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="currentColor" viewBox="0 0 496 512"><path d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3 .3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5 .3-6.2 2.3zm44.2-1.7c-2.9 .7-4.9 2.6-4.6 4.9 .3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.3-6.2-10.1-19.5 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 12.7 48.4 4.9 61.7 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8z"/></svg>
                <span className="sr-only">GitHub</span>
              </a>
            </div>
            
            <div className="text-center md:text-right">
              <div className="flex flex-col md:flex-row items-center md:items-end space-y-2 md:space-y-0 md:space-x-4">
                <a href="mailto:info@history-lab.org" className="text-gray-600 hover:text-[#6CA0D6]">info@history-lab.org</a>
                <div className="flex space-x-4">
                  <a href="https://lab.history.columbia.edu/" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-[#6CA0D6]">History Lab</a>
                  <a href="https://lab.history.columbia.edu/content/terms-use" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-[#6CA0D6]">Terms</a>
                  <a href="https://auth.ramus.network/privacy" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-[#6CA0D6]">Privacy</a>
                </div>
              </div>
              <div className="text-xs text-gray-400 mt-2">
                &copy; {new Date().getFullYear()} Columbia University History Lab. All Rights Reserved.
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LoginScreen; 