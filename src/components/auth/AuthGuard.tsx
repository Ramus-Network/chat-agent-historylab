import React, { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Loader2 } from 'lucide-react';

interface AuthGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
}

const AuthGuard: React.FC<AuthGuardProps> = ({ children, fallback }) => {
  const { isAuthenticated, isLoading, checkAuth, login } = useAuth();
  const [verificationComplete, setVerificationComplete] = useState(false);
  
  // Effect to handle verification on initial mount
  useEffect(() => {
    console.log('AuthGuard mounted, current auth state:', { isAuthenticated, isLoading });
    
    // Function to perform auth check
    const verifyAuth = async () => {
      try {
        await checkAuth();
      } catch (err) {
        console.error('Error in auth verification:', err);
      } finally {
        console.log('Auth verification finished');
        setVerificationComplete(true);
      }
    };

    // Only run verification if we're still loading
    if (!verificationComplete && isLoading) {
      console.log('Running auth verification...');
      verifyAuth();
    }
  }, [checkAuth, isLoading, isAuthenticated, verificationComplete]);

  // Debugging output
  console.log('AuthGuard render state:', { 
    isAuthenticated, 
    isLoading, 
    verificationComplete,
    showLoader: isLoading && !verificationComplete,
    showContent: verificationComplete && isAuthenticated,
    showFallback: verificationComplete && !isAuthenticated
  });

  // Show loader only during initial verification
  if (isLoading && !verificationComplete) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 text-[#6CA0D6] animate-spin" />
          <p className="text-gray-600 text-center">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  // If verification is complete but we're not authenticated, show fallback
  if (verificationComplete && !isAuthenticated) {
    console.log('User not authenticated, showing login screen');
    if (fallback) {
      return <>{fallback}</>;
    }
    
    // If no fallback is provided, redirect to login
    login();
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 text-[#6CA0D6] animate-spin" />
          <p className="text-gray-600 text-center">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // User is authenticated and verification is complete, render children
  console.log('User is authenticated, rendering protected content');
  return <>{children}</>;
};

export default AuthGuard; 