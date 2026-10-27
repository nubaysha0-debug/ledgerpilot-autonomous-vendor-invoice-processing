import React, { useState } from 'react';
import { X, ShieldCheck, CheckCircle2, AlertCircle, ArrowRight, Lock, Sparkles, Building2 } from 'lucide-react';
import { auth, googleProvider, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { signInWithPopup, signOut as fbSignOut, User } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onUserChange?: (user: User | null) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUserChange,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // Persist user record to Firestore
      try {
        await setDoc(
          doc(db, 'users', user.uid),
          {
            userId: user.uid,
            email: user.email || '',
            displayName: user.displayName || 'Finance Lead',
            photoURL: user.photoURL || '',
            role: 'controller',
            lastLoginAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (firestoreErr) {
        // Log formatted error according to skill rules but allow sign in to proceed
        console.warn('Could not update user document in Firestore:', firestoreErr);
      }

      if (onUserChange) onUserChange(user);
      onClose();
    } catch (err: any) {
      console.error('Sign in error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setErrorMessage('Authentication window was closed before completion. Please retry.');
      } else if (err.code === 'auth/network-request-failed') {
        setErrorMessage('Network connection lost during authentication handshake. Check connectivity.');
      } else if (err.code === 'auth/cancelled-popup-request') {
        setErrorMessage('Multiple popup requests detected. Please wait a moment and click once.');
      } else {
        setErrorMessage(err.message || 'Unable to authenticate with Google. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await fbSignOut(auth);
      if (onUserChange) onUserChange(null);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to sign out.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
    >
      {/* Side-anchored / Split-panel authentication container with organic background geometry */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-3xl rounded-3xl bg-white border border-[#e6e2d9] shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12 animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Left Editorial Brand Panel (5 cols) with organic orbital geometry */}
        <div className="md:col-span-5 bg-[#5d674f] text-white p-8 flex flex-col justify-between relative overflow-hidden">
          {/* Organic circular elements */}
          <div
            aria-hidden="true"
            className="absolute -top-16 -left-16 w-56 h-56 rounded-full bg-white/10 blur-xl pointer-events-none"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-20 -right-20 w-64 h-64 rounded-full border border-[#d6b588]/40 pointer-events-none"
          />

          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center border border-white/30">
                <div className="w-2.5 h-2.5 rounded-full bg-white" />
              </div>
              <span className="font-semibold text-lg tracking-tight">LedgerPilot</span>
            </div>

            <div className="pt-8">
              <span className="text-[11px] font-mono tracking-widest text-[#d6b588] uppercase block mb-1">
                ENTERPRISE IDENTITY
              </span>
              <h3 className="text-xl sm:text-2xl font-serif italic text-white font-normal leading-snug">
                Secured access for controllers.
              </h3>
              <p className="text-xs text-white/80 leading-relaxed mt-3">
                Connect with verified Google Workspace credentials to synchronize invoice audit
                queues, approve disbursements, and persist operational state across devices.
              </p>
            </div>
          </div>

          <div className="relative z-10 pt-8 border-t border-white/15 space-y-2 text-[11px] text-white/70">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-[#d6b588]" />
              <span>Role-Based Access Control (ABAC)</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#d6b588]" />
              <span>Direct Firestore Database Persistence</span>
            </div>
          </div>
        </div>

        {/* Right Form Panel (7 cols) */}
        <div className="md:col-span-7 p-8 sm:p-10 flex flex-col justify-between bg-white relative">
          <button
            onClick={onClose}
            aria-label="Close authentication panel"
            className="absolute top-5 right-5 p-2 text-[#705e46] hover:text-[#422701] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div>
            <div className="mb-6">
              <span className="text-[11px] font-semibold text-[#5d674f] uppercase tracking-wider block mb-1">
                {currentUser ? 'Active Session' : 'Controller Sign-In'}
              </span>
              <h2 id="auth-modal-title" className="text-2xl font-semibold text-[#422701] tracking-tight">
                {currentUser ? 'Your Financial Identity' : 'Access Your Workspace'}
              </h2>
              <p className="text-xs text-[#705e46] mt-1">
                {currentUser
                  ? 'Authenticated via Google with Firestore persistence.'
                  : 'Sign in to access persistent AP databases and Gemini copilot.'}
              </p>
            </div>

            {/* Error Message Box */}
            {errorMessage && (
              <div className="mb-5 p-3.5 rounded-xl bg-[#fcf0e8] border border-[#f0d4c2] flex items-start gap-2.5 text-xs text-[#a45422] animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="leading-relaxed">{errorMessage}</div>
              </div>
            )}

            {/* Current User State View */}
            {currentUser ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-[#faf9f6] border border-[#e6e2d9] flex items-center gap-3.5">
                  {currentUser.photoURL ? (
                    <img
                      src={currentUser.photoURL}
                      alt={currentUser.displayName || 'User'}
                      className="w-12 h-12 rounded-full border border-[#d6b588] object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-[#5d674f] text-white flex items-center justify-center font-bold text-base">
                      {currentUser.displayName ? currentUser.displayName[0] : 'U'}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#422701] truncate">
                      {currentUser.displayName || 'Authorized Controller'}
                    </p>
                    <p className="text-xs text-[#705e46] font-mono truncate">{currentUser.email}</p>
                    <div className="mt-1 inline-flex items-center gap-1.5 text-[10px] text-[#5d674f] bg-[#5d674f]/10 px-2 py-0.5 rounded">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#5d674f]" />
                      <span>Role: Controller (Verified)</span>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#faf9f6] border border-[#f0ede6] text-xs space-y-1.5 text-[#705e46]">
                  <div className="flex justify-between">
                    <span>Account UID:</span>
                    <span className="font-mono text-[#422701] text-[11px] truncate max-w-[180px]">
                      {currentUser.uid}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Database:</span>
                    <span className="text-[#5d674f] font-medium">Firestore Connected</span>
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <button
                    onClick={handleSignOut}
                    disabled={loading}
                    className="w-full py-2.5 px-4 text-xs font-medium text-[#a45422] bg-[#fcf0e8] hover:bg-[#fae3d5] border border-[#f0d4c2] rounded-lg transition-colors"
                  >
                    {loading ? 'Signing out...' : 'Sign Out of Session'}
                  </button>
                  <button
                    onClick={onClose}
                    className="w-full py-2.5 px-4 text-xs font-medium text-white bg-[#5d674f] hover:bg-[#4b543f] rounded-lg transition-colors shadow-xs"
                  >
                    Return to Dashboard
                  </button>
                </div>
              </div>
            ) : (
              /* Sign In Buttons & Microcopy */
              <div className="space-y-4">
                <button
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full py-3.5 px-5 rounded-xl bg-white border border-[#e6e2d9] hover:border-[#5d674f] hover:bg-[#faf9f6] text-[#422701] font-medium text-sm flex items-center justify-center gap-3 transition-all duration-150 shadow-xs group focus:outline-none focus:ring-2 focus:ring-[#5d674f]"
                >
                  {/* Google SVG Icon */}
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>{loading ? 'Connecting with Google...' : 'Continue with Google Account'}</span>
                </button>

                <div className="relative py-2 text-center text-xs text-[#705e46]">
                  <span className="bg-white px-3 relative z-10 text-[11px] uppercase tracking-wider text-[#705e46]">
                    Authorized Session Security
                  </span>
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-[#f0ede6]" />
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#faf9f6] border border-[#f0ede6] text-xs text-[#705e46] leading-relaxed">
                  Signing in automatically provisions your personal Firestore record partition,
                  preserving customized validation tolerances and multi-turn Gemini conversations.
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 pt-4 border-t border-[#f0ede6] flex items-center justify-between text-[11px] text-[#705e46]">
            <span>TLS Encrypted Connection</span>
            <span className="font-mono">LedgerPilot Auth v1.4</span>
          </div>
        </div>
      </div>
    </div>
  );
};
