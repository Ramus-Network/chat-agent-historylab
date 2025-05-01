import React from 'react';
import { useAuth } from '../../hooks/useAuth';

const LoginScreen: React.FC = () => {
  const { login } = useAuth();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-md">
        <div className="text-center">
          <img 
            src="/logo.png" 
            alt="HistoryLab Logo" 
            className="h-16 w-auto mx-auto mb-4" 
          />
          <h1 className="text-2xl font-bold text-gray-900">Welcome to HistoryLab AI</h1>
          <p className="mt-2 text-gray-600">
            Please sign in to access the HistoryLab archive and AI assistants.
          </p>
        </div>
        
        <div className="mt-8 space-y-6">
          <button
            onClick={login}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#6CA0D6] hover:bg-[#5a90c0] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#6CA0D6]"
          >
            Sign in with Google
          </button>
          
          <div className="text-sm text-center text-gray-500">
            By signing in, you agree to our terms of service and privacy policy.
          </div>
        </div>
      </div>
      
      <div className="mt-8 text-center text-xs text-gray-500">
        <div className="flex justify-center items-center gap-1.5">
          <span>Built on the Ramus Network</span>
          <img 
            src="/logo.png" 
            alt="Ramus Logo" 
            className="h-3.5 w-auto object-contain" 
          />
        </div>
      </div>
    </div>
  );
};

export default LoginScreen; 