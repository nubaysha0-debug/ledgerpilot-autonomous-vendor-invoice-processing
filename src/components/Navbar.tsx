import React, { useState, useEffect, useRef } from 'react';
import { UserRound, Menu, X, Check, ShieldCheck, ChevronRight, Settings, HelpCircle, LogOut, Sparkles, LogIn } from 'lucide-react';
import { User } from 'firebase/auth';
import { auth } from '../lib/firebase';

interface NavbarProps {
  onOpenDashboard: () => void;
  onOpenUpload: () => void;
  currentUser: User | null;
  onOpenAuthModal: () => void;
  onOpenCopilot: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenDashboard,
  onOpenUpload,
  currentUser,
  onOpenAuthModal,
  onOpenCopilot,
}) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [showToast, setShowToast] = useState<string | null>(null);

  const profileRef = useRef<HTMLDivElement>(null);

  // Handle scroll effect (> 20px)
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 20) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Handle click outside and Escape key for profile dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProfileDropdownOpen(false);
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Prevent background scrolling when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const triggerToast = (msg: string) => {
    setShowToast(msg);
    setTimeout(() => setShowToast(null), 3000);
  };

  const navLinks = [
    { label: 'Overview', href: '#overview' },
    { label: 'How It Works', href: '#how-it-works' },
    { label: 'Features', href: '#features' },
    { label: 'Dashboard', href: '#dashboard' },
    { label: 'Copilot', href: '#copilot-suite' },
    { label: 'Pricing', href: '#workspace-access' },
  ];

  return (
    <>
      <header
        id="navbar"
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-200 border-b ${
          isScrolled
            ? 'bg-[#f5f4f0]/90 backdrop-blur-md shadow-sm border-[#e6e2d9]'
            : 'bg-[#f5f4f0]/60 backdrop-blur-sm border-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-6">
          {/* Brand Logo */}
          <a
            href="#"
            className="flex items-center gap-2.5 text-[#422701] group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5d674f] rounded-lg p-1"
          >
            {/* Minimal Circular / Orbital Mark */}
            <div className="relative w-8 h-8 rounded-full bg-[#5d674f] flex items-center justify-center transition-transform group-hover:scale-105 duration-200">
              <div className="absolute inset-[-3px] rounded-full border border-[#d6b588]/60 animate-[spin_12s_linear_infinite]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#f5f4f0]" />
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#d6b588]" />
            </div>
            <span className="font-semibold text-lg tracking-tight text-[#422701]">
              LedgerPilot
            </span>
          </a>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-[14px] font-medium text-[#705e46]">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="hover:text-[#422701] transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-1 focus-visible:ring-[#5d674f] rounded px-1 py-0.5"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Right Action Zone */}
          <div className="flex items-center gap-3">
            {/* Quick Copilot Jump */}
            <button
              onClick={onOpenCopilot}
              className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#5d674f] hover:text-[#422701] bg-[#5d674f]/10 hover:bg-[#5d674f]/15 rounded-lg transition-colors whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#d6b588]" />
              <span>AP Copilot</span>
            </button>

            {/* Primary CTA */}
            <button
              onClick={onOpenDashboard}
              className="px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#5d674f] hover:bg-[#4b543f] active:bg-[#3f4634] rounded-lg transition-all duration-150 shadow-xs whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5d674f] focus-visible:ring-offset-2"
            >
              Open Dashboard
            </button>

            {/* Profile Circular Avatar & Dropdown */}
            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setProfileDropdownOpen((prev) => !prev)}
                aria-expanded={profileDropdownOpen}
                aria-haspopup="true"
                aria-label="User profile menu"
                className="w-9 h-9 rounded-full bg-[#5d674f] text-[#f5f4f0] flex items-center justify-center hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5d674f] focus-visible:ring-offset-2 border border-[#4b543f] overflow-hidden"
              >
                {currentUser?.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || 'User'}
                    className="w-full h-full object-cover"
                  />
                ) : currentUser?.displayName ? (
                  <span className="font-semibold text-xs text-white">
                    {currentUser.displayName.charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <UserRound className="w-4 h-4 text-[#f5f4f0]" />
                )}
              </button>

              {/* Profile Dropdown Panel */}
              {profileDropdownOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-72 rounded-xl bg-white border border-[#e6e2d9] shadow-lg p-2 z-50 text-[#422701] animate-in fade-in zoom-in-95 duration-150"
                >
                  <div className="p-3 border-b border-[#f0ede6] mb-1">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-[#5d674f] flex items-center justify-center text-white text-xs font-semibold overflow-hidden">
                        {currentUser?.photoURL ? (
                          <img src={currentUser.photoURL} alt="User" className="w-full h-full object-cover" />
                        ) : (
                          <span>{currentUser ? currentUser.displayName?.[0] || 'U' : 'DU'}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#422701] truncate">
                          {currentUser ? currentUser.displayName || 'Authorized Controller' : 'Demo User'}
                        </p>
                        <p className="text-xs text-[#705e46] truncate">
                          {currentUser ? currentUser.email : 'finance-ops@ledgerpilot.internal'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] text-[#5d674f] bg-[#5d674f]/10 px-2 py-0.5 rounded">
                      <ShieldCheck className="w-3 h-3" />
                      <span>{currentUser ? 'Verified Controller · Firestore' : 'Role: AP Controller (Demo)'}</span>
                    </div>
                  </div>

                  <div className="py-1 space-y-0.5">
                    <button
                      onClick={() => {
                        setProfileDropdownOpen(false);
                        onOpenAuthModal();
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs text-[#705e46] hover:text-[#422701] hover:bg-[#f5f4f0] rounded-lg transition-colors text-left"
                    >
                      <span className="flex items-center gap-2">
                        <Settings className="w-3.5 h-3.5 text-[#705e46]" />
                        {currentUser ? 'Manage Account & Database' : 'Sign In with Google'}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                    </button>

                    <button
                      onClick={() => {
                        setProfileDropdownOpen(false);
                        triggerToast('Help & Documentation: Review invoice extraction guidelines.');
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs text-[#705e46] hover:text-[#422701] hover:bg-[#f5f4f0] rounded-lg transition-colors text-left"
                    >
                      <span className="flex items-center gap-2">
                        <HelpCircle className="w-3.5 h-3.5 text-[#705e46]" />
                        Help & Support
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                    </button>
                  </div>

                  <div className="border-t border-[#f0ede6] pt-1 mt-1">
                    {currentUser ? (
                      <button
                        onClick={async () => {
                          setProfileDropdownOpen(false);
                          await auth.signOut();
                          triggerToast('Signed out of authorized session.');
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#a45422] hover:bg-[#fcf0e8] rounded-lg transition-colors text-left"
                      >
                        <LogOut className="w-3.5 h-3.5 text-[#a45422]" />
                        <span>Sign Out</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          onOpenAuthModal();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#5d674f] font-medium hover:bg-[#f5f4f0] rounded-lg transition-colors text-left"
                      >
                        <LogIn className="w-3.5 h-3.5 text-[#5d674f]" />
                        <span>Sign In with Google</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              id="mobile-menu-btn"
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open mobile navigation"
              className="md:hidden p-2 rounded-lg text-[#705e46] hover:text-[#422701] hover:bg-[#eae6dc] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5d674f]"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Full-Screen Overlay */}
      <div
        id="mobile-menu"
        aria-modal="true"
        role="dialog"
        className={`fixed inset-0 z-50 bg-[#f5f4f0] transition-opacity duration-200 flex flex-col justify-between p-6 md:hidden ${
          mobileMenuOpen
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between border-b border-[#e6e2d9] pb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#5d674f] flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-[#f5f4f0]" />
            </div>
            <span className="font-semibold text-lg text-[#422701]">LedgerPilot</span>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close mobile navigation"
            className="p-2 rounded-lg text-[#705e46] hover:text-[#422701] hover:bg-[#eae6dc] transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex flex-col gap-4 py-8">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className="text-xl font-medium text-[#422701] hover:text-[#5d674f] transition-colors py-1"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="pt-6 border-t border-[#e6e2d9] flex flex-col gap-3">
          <button
            onClick={() => {
              setMobileMenuOpen(false);
              onOpenDashboard();
            }}
            className="w-full py-3 text-center text-sm font-medium text-white bg-[#5d674f] rounded-lg transition-colors hover:bg-[#4b543f]"
          >
            Explore Dashboard
          </button>
          <button
            onClick={() => {
              setMobileMenuOpen(false);
              onOpenAuthModal();
            }}
            className="w-full py-3 text-center text-sm font-medium text-[#422701] bg-[#e6e2d9]/60 border border-[#d6b588]/50 rounded-lg transition-colors hover:bg-[#e6e2d9]"
          >
            {currentUser ? 'Manage Account' : 'Sign In with Google'}
          </button>
        </div>
      </div>

      {/* Floating Quiet Toast for Micro-feedback */}
      {showToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#422701] text-white px-4 py-2.5 rounded-lg shadow-md text-xs font-medium flex items-center gap-2 animate-in slide-in-from-bottom-2 duration-150">
          <Check className="w-3.5 h-3.5 text-[#d6b588]" />
          <span>{showToast}</span>
        </div>
      )}
    </>
  );
};
