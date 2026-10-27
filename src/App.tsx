/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { ProductPhilosophySection } from './components/ProductPhilosophySection';
import { HowItWorksSection } from './components/HowItWorksSection';
import { CoreFeaturesSection } from './components/CoreFeaturesSection';
import { DashboardPreviewSection } from './components/DashboardPreviewSection';
import { WorkflowTimelineSection } from './components/WorkflowTimelineSection';
import { TrustControlSection } from './components/TrustControlSection';
import { WorkspaceAccessSection } from './components/WorkspaceAccessSection';
import { Footer } from './components/Footer';
import { InvoiceDetailModal } from './components/InvoiceDetailModal';
import { UploadInvoiceModal } from './components/UploadInvoiceModal';
import { PilotModal } from './components/PilotModal';
import { AuthModal } from './components/AuthModal';
import { GeminiCopilotChat } from './components/GeminiCopilotChat';
import { AudioTranscribeIntake } from './components/AudioTranscribeIntake';
import { LiveVoiceAgent } from './components/LiveVoiceAgent';
import { INITIAL_INVOICES } from './data/mockInvoices';
import { Invoice, InvoiceStatus } from './types/invoice';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, setDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { MessageSquare, Mic, Radio, Sparkles, Database, ShieldCheck } from 'lucide-react';

export default function App() {
  const [invoices, setInvoices] = useState<Invoice[]>(INITIAL_INVOICES);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeStatusFilter, setActiveStatusFilter] = useState<string>('All');
  const [activeCopilotTab, setActiveCopilotTab] = useState<'chat' | 'voice' | 'transcribe'>('chat');
  const [pilotModalState, setPilotModalState] = useState<{
    isOpen: boolean;
    type: 'pilot' | 'enterprise';
  }>({
    isOpen: false,
    type: 'pilot',
  });

  // Track Firebase Authentication State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Listen to User Invoices from Firestore when authenticated
  useEffect(() => {
    if (!currentUser) return;

    try {
      const invsRef = collection(db, 'users', currentUser.uid, 'invoices');
      const q = query(invsRef, orderBy('createdAt', 'desc'));

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          if (!snapshot.empty) {
            const userInvs: Invoice[] = snapshot.docs.map((docSnap) => {
              const data = docSnap.data();
              return {
                id: docSnap.id,
                invoiceNumber: data.invoiceNumber || docSnap.id,
                vendor: data.vendor || 'Unknown Vendor',
                vendorCategory: data.vendorCategory || 'General',
                vendorAddress: data.vendorAddress || '',
                recipientName: data.recipientName || 'Acme Operations Corp',
                issueDate: data.issueDate || '2026-10-20',
                dueDate: data.dueDate || '2026-11-20',
                amount: data.amount || 0,
                subtotal: data.subtotal || data.amount || 0,
                tax: data.tax || 0,
                currency: data.currency || 'USD',
                status: (data.status as InvoiceStatus) || 'Pending Review',
                currentStage: data.currentStage || 'review',
                paymentTerms: data.paymentTerms || 'Net 30',
                poNumber: data.poNumber,
                paymentMethod: data.paymentMethod || 'ACH Direct',
                ibanMasked: data.ibanMasked,
                extractionConfidence: data.extractionConfidence || 0.95,
                flags: data.flags || [],
                lineItems: data.lineItems || [],
                timeline: data.timeline || [
                  { title: 'Document received', timestamp: 'Initial', status: 'completed' },
                ],
              };
            });

            // Merge user's saved invoices at top of demo invoices
            setInvoices([...userInvs, ...INITIAL_INVOICES]);
          }
        },
        (error) => {
          console.warn('Firestore invoice sync notice:', error.message);
        }
      );

      return () => unsubscribe();
    } catch (err) {
      console.warn('Could not initialize Firestore invoice sync:', err);
    }
  }, [currentUser]);

  // Action handlers
  const handleOpenDashboard = (filter?: string) => {
    if (filter) {
      setActiveStatusFilter(filter);
    }
    const elem = document.getElementById('dashboard');
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleOpenCopilotSuite = (tab?: 'chat' | 'voice' | 'transcribe') => {
    if (tab) setActiveCopilotTab(tab);
    const elem = document.getElementById('copilot-suite');
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSeeHowItWorks = () => {
    const elem = document.getElementById('how-it-works');
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleInspectInvoiceById = (invoiceId: string) => {
    const found = invoices.find((inv) => inv.id === invoiceId);
    if (found) {
      setSelectedInvoice(found);
    }
  };

  const handleUpdateInvoiceStatus = async (id: string, newStatus: InvoiceStatus) => {
    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv.id === id) {
          const updatedTimeline = [...inv.timeline];
          if (newStatus === 'Approved') {
            updatedTimeline.push({
              title: 'Approved by Controller',
              timestamp: 'Just now',
              status: 'completed',
              note: 'Authorized for payment disbursement',
            });
          } else if (newStatus === 'Needs Attention') {
            updatedTimeline.push({
              title: 'Flagged for Exception Review',
              timestamp: 'Just now',
              status: 'in-progress',
              note: 'Discrepancy review queued',
            });
          } else if (newStatus === 'Processed') {
            updatedTimeline.push({
              title: 'Reconciled to General Ledger',
              timestamp: 'Just now',
              status: 'completed',
              note: 'Disbursed and archived',
            });
          }

          return {
            ...inv,
            status: newStatus,
            timeline: updatedTimeline,
          };
        }
        return inv;
      })
    );

    // Persist to Firestore if user is authenticated
    if (currentUser) {
      try {
        await setDoc(
          doc(db, 'users', currentUser.uid, 'invoices', id),
          {
            status: newStatus,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (e) {
        console.warn('Could not persist status change to Firestore:', e);
      }
    }

    // Keep selected invoice in sync
    setSelectedInvoice((prev) => (prev && prev.id === id ? { ...prev, status: newStatus } : prev));
  };

  const handleInvoiceCreated = async (newInvoice: Invoice) => {
    setInvoices((prev) => [newInvoice, ...prev]);
    setSelectedInvoice(newInvoice);

    // Persist to Firestore if logged in
    if (currentUser) {
      try {
        await setDoc(doc(db, 'users', currentUser.uid, 'invoices', newInvoice.id), {
          ...newInvoice,
          userId: currentUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn('Could not persist new invoice to Firestore:', err);
      }
    }
  };

  const handleResetData = () => {
    setInvoices(INITIAL_INVOICES);
    setActiveStatusFilter('All');
  };

  return (
    <div className="min-h-screen bg-[#f5f4f0] text-[#422701] flex flex-col font-sans selection:bg-[#5d674f] selection:text-white">
      {/* Navigation */}
      <Navbar
        onOpenDashboard={() => handleOpenDashboard()}
        onOpenUpload={() => setIsUploadModalOpen(true)}
        currentUser={currentUser}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onOpenCopilot={() => handleOpenCopilotSuite()}
      />

      {/* Main Content Sections */}
      <main className="flex-1">
        {/* 1. Hero Section */}
        <HeroSection
          onExploreDashboard={() => handleOpenDashboard()}
          onSeeHowItWorks={handleSeeHowItWorks}
          onInspectSampleInvoice={handleInspectInvoiceById}
        />

        {/* 2. Product Philosophy Section */}
        <ProductPhilosophySection />

        {/* 3. How It Works Section */}
        <HowItWorksSection
          onOpenUpload={() => setIsUploadModalOpen(true)}
          onOpenDashboard={() => handleOpenDashboard()}
        />

        {/* 4. Core Features Section */}
        <CoreFeaturesSection
          onOpenUpload={() => setIsUploadModalOpen(true)}
          onOpenDashboard={(filter) => handleOpenDashboard(filter)}
        />

        {/* 5. Central Hub: Dashboard Preview Section */}
        <DashboardPreviewSection
          invoices={invoices}
          onSelectInvoice={(inv) => setSelectedInvoice(inv)}
          onOpenUpload={() => setIsUploadModalOpen(true)}
          onResetData={handleResetData}
          activeStatusFilter={activeStatusFilter}
          onStatusFilterChange={setActiveStatusFilter}
        />

        {/* 6. ADVANCED CAPABILITIES SUITE: Gemini Chatbot, Live API Voice, Audio Transcribe */}
        <section id="copilot-suite" className="py-20 md:py-28 border-t border-[#e6e2d9] bg-[#f5f4f0] relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
              <div className="space-y-3 max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold tracking-wider text-[#5d674f] uppercase">
                    AUTONOMOUS AP INTELLIGENCE
                  </span>
                  {currentUser ? (
                    <span className="text-[11px] text-[#5d674f] bg-[#5d674f]/10 border border-[#5d674f]/20 px-2 py-0.5 rounded flex items-center gap-1 font-mono">
                      <Database className="w-3 h-3" />
                      Firestore Synced
                    </span>
                  ) : (
                    <button
                      onClick={() => setIsAuthModalOpen(true)}
                      className="text-[11px] text-[#705e46] bg-[#ede8dc] hover:bg-[#e2ddd1] border border-[#ded8cb] px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
                    >
                      <ShieldCheck className="w-3 h-3 text-[#5d674f]" />
                      <span>Sign in to persist sessions</span>
                    </button>
                  )}
                </div>

                <h2 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-[#422701] text-balance">
                  Gemini AP Copilot & Multimodal Suite.
                </h2>
                <p className="text-base text-[#705e46]">
                  Multi-turn conversational auditing, real-time voice dialogue, and voice memo
                  transcription designed specifically for accounts payable operations.
                </p>
              </div>

              {/* Segmented Mode Switcher */}
              <div className="flex items-center gap-1 p-1 bg-white border border-[#e6e2d9] rounded-xl self-start md:self-auto shadow-xs">
                <button
                  onClick={() => setActiveCopilotTab('chat')}
                  className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                    activeCopilotTab === 'chat'
                      ? 'bg-[#5d674f] text-white shadow-xs'
                      : 'text-[#705e46] hover:text-[#422701]'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Chatbot</span>
                </button>

                <button
                  onClick={() => setActiveCopilotTab('voice')}
                  className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                    activeCopilotTab === 'voice'
                      ? 'bg-[#5d674f] text-white shadow-xs'
                      : 'text-[#705e46] hover:text-[#422701]'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>Live Voice</span>
                </button>

                <button
                  onClick={() => setActiveCopilotTab('transcribe')}
                  className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                    activeCopilotTab === 'transcribe'
                      ? 'bg-[#5d674f] text-white shadow-xs'
                      : 'text-[#705e46] hover:text-[#422701]'
                  }`}
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Audio Intake</span>
                </button>
              </div>
            </div>

            {/* Selected Multimodal Feature View */}
            <div className="transition-all duration-200">
              {activeCopilotTab === 'chat' && (
                <GeminiCopilotChat
                  selectedInvoice={selectedInvoice}
                  onInspectInvoice={handleInspectInvoiceById}
                />
              )}

              {activeCopilotTab === 'voice' && (
                <LiveVoiceAgent selectedInvoice={selectedInvoice} />
              )}

              {activeCopilotTab === 'transcribe' && (
                <AudioTranscribeIntake onAddTranscribedInvoice={handleInvoiceCreated} />
              )}
            </div>
          </div>
        </section>

        {/* 7. Invoice Processing Workflow Timeline */}
        <WorkflowTimelineSection
          invoices={invoices}
          onOpenInvoiceModal={(inv) => setSelectedInvoice(inv)}
        />

        {/* 8. Trust and Control Section */}
        <TrustControlSection />

        {/* 9. Workspace Access Section (Pricing Alternative) */}
        <WorkspaceAccessSection
          onLaunchDemo={() => handleOpenDashboard()}
          onRequestPilot={() => setPilotModalState({ isOpen: true, type: 'pilot' })}
          onInquireEnterprise={() => setPilotModalState({ isOpen: true, type: 'enterprise' })}
        />
      </main>

      {/* Footer */}
      <Footer />

      {/* Interactive Detail Modal */}
      {selectedInvoice && (
        <InvoiceDetailModal
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onUpdateStatus={handleUpdateInvoiceStatus}
        />
      )}

      {/* Interactive Upload Modal */}
      <UploadInvoiceModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onInvoiceCreated={handleInvoiceCreated}
      />

      {/* Split-panel Google Sign-In & Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
        onUserChange={setCurrentUser}
      />

      {/* Team Pilot / Enterprise Inquiry Modal */}
      <PilotModal
        isOpen={pilotModalState.isOpen}
        type={pilotModalState.type}
        onClose={() => setPilotModalState({ isOpen: false, type: 'pilot' })}
      />
    </div>
  );
}
