// app.tsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ChatContainer from './components/chat/ChatContainer';
import { AuthProvider } from './hooks/useAuth';
import AuthGuard from './components/auth/AuthGuard';
import LoginScreen from './components/auth/LoginScreen';

// Add custom scrollbar styles
const style = document.createElement('style');
style.textContent = `
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 3px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #ccc;
    border-radius: 3px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #aaa;
  }
  /* For Firefox */
  .custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: #ccc #f1f1f1;
  }
`;
document.head.appendChild(style);

export default function Chat() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route 
            path="/" 
            element={
              <AuthGuard fallback={<LoginScreen />}>
                <ChatContainer />
              </AuthGuard>
            } 
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
}