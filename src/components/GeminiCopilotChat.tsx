import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Sparkles,
  Bot,
  User as UserIcon,
  RefreshCw,
  Cpu,
  ChevronDown,
  CornerDownLeft,
  FileText,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { Invoice } from '../types/invoice';
import { auth, db } from '../lib/firebase';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';

interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  model?: string;
  timestamp?: string;
}

interface GeminiCopilotChatProps {
  selectedInvoice: Invoice | null;
  onInspectInvoice?: (invoiceId: string) => void;
}

export const GeminiCopilotChat: React.FC<GeminiCopilotChatProps> = ({
  selectedInvoice,
  onInspectInvoice,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init-1',
      role: 'model',
      content:
        "Hello. I'm your LedgerPilot AP Copilot. I can audit tax rates, calculate line item variances, check purchase order tolerances, or verify vendor remittance information.",
      model: 'gemini-3.8-flash',
      timestamp: '09:00',
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [selectedModel, setSelectedModel] = useState<'gemini-4-argon' | 'gemini-3.8-flash' | 'gemini-3.1-flash-lite'>(
    'gemini-3.8-flash'
  );
  const [isLoading, setIsLoading] = useState(false);
  const [statusIndicatorText, setStatusIndicatorText] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Load Firestore messages if user is signed in
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const msgsRef = collection(db, 'users', user.uid, 'messages');
      const q = query(msgsRef, orderBy('createdAt', 'asc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const loaded: Message[] = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              role: data.role,
              content: data.content,
              model: data.model,
              timestamp: data.createdAt ? new Date(data.createdAt.toDate?.() || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
            };
          });
          setMessages(loaded);
        }
      }, (error) => {
        console.warn('Firestore messages listener notice:', error.message);
      });

      return () => unsubscribe();
    } catch (e) {
      console.warn('Firestore chat history init notice:', e);
    }
  }, [auth.currentUser]);

  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = customPrompt || inputText;
    if (!textToSend.trim() || isLoading) return;

    const userMsg: Message = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    // Realistic financial microcopy
    setStatusIndicatorText(
      selectedModel === 'gemini-4-argon'
        ? 'Running multi-pass tax variance & purchase order reconciliation...'
        : 'Checking vendor records against master database...'
    );

    // Persist user message to Firestore if signed in
    const currentUser = auth.currentUser;
    if (currentUser) {
      try {
        await addDoc(collection(db, 'users', currentUser.uid, 'messages'), {
          userId: currentUser.uid,
          role: 'user',
          content: userMsg.content,
          model: selectedModel,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn('Could not persist message:', err);
      }
    }

    try {
      const payload = {
        messages: [...messages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        })),
        model: selectedModel,
        invoiceContext: selectedInvoice
          ? {
              vendor: selectedInvoice.vendor,
              invoiceNumber: selectedInvoice.invoiceNumber,
              amount: selectedInvoice.amount,
              subtotal: selectedInvoice.subtotal,
              tax: selectedInvoice.tax,
              dueDate: selectedInvoice.dueDate,
              status: selectedInvoice.status,
              poNumber: selectedInvoice.poNumber,
              lineItems: selectedInvoice.lineItems,
              flags: selectedInvoice.flags,
            }
          : null,
      };

      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Server error communicating with Gemini AP agent.');
      }

      const data = await res.json();
      const modelMsg: Message = {
        id: `bot-${Date.now()}`,
        role: 'model',
        content: data.reply || 'Invoice verification complete.',
        model: data.modelUsed || selectedModel,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, modelMsg]);

      // Persist model message to Firestore if signed in
      if (currentUser) {
        try {
          await addDoc(collection(db, 'users', currentUser.uid, 'messages'), {
            userId: currentUser.uid,
            role: 'model',
            content: modelMsg.content,
            model: modelMsg.model,
            createdAt: serverTimestamp(),
          });
        } catch (err) {
          console.warn('Could not persist model message:', err);
        }
      }
    } catch (err: any) {
      console.error('Chat error:', err);
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        role: 'model',
        content: `Operational exception: ${err.message || 'Unable to complete automated audit pass.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      setStatusIndicatorText('');
    }
  };

  const samplePrompts = [
    'Audit tax line items on the active invoice',
    'Verify purchase order tolerance',
    'Summarize exceptions requiring controller approval',
  ];

  return (
    <div className="rounded-2xl bg-white border border-[#e6e2d9] shadow-xs overflow-hidden flex flex-col h-[560px]">
      {/* Top Header & Model Selector */}
      <div className="p-4 sm:px-6 sm:py-3.5 border-b border-[#f0ede6] bg-[#faf9f6] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#5d674f] text-white flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-[#d6b588]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm text-[#422701]">LedgerPilot AP Copilot</h3>
              <span className="text-[10px] text-[#5d674f] bg-[#5d674f]/10 px-2 py-0.5 rounded font-mono">
                Multi-Turn Gemini
              </span>
            </div>
            <p className="text-[11px] text-[#705e46]">
              {selectedInvoice
                ? `Context: ${selectedInvoice.vendor} (${selectedInvoice.invoiceNumber})`
                : 'General accounts payable ledger inspection'}
            </p>
          </div>
        </div>

        {/* Model Switcher Dropdown (gemini-4-argon, gemini-3.8-flash, gemini-3.1-flash-lite) */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-[#705e46] text-[11px] hidden sm:inline">Engine:</span>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value as any)}
            className="px-2.5 py-1.5 bg-white border border-[#e6e2d9] rounded-lg text-xs font-mono text-[#422701] focus:outline-none focus:ring-1 focus:ring-[#5d674f]"
          >
            <option value="gemini-4-argon">gemini-4-argon (Deep Audit)</option>
            <option value="gemini-3.8-flash">gemini-3.8-flash (Standard AP)</option>
            <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Fast Check)</option>
          </select>
        </div>
      </div>

      {/* Conversation Thread with Asymmetrical Padding & Corner Radii */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-[#faf9f6]/40">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-2xl ${
                isUser ? 'ml-auto' : 'mr-auto'
              }`}
            >
              {/* Message Bubble: Asymmetric padding and varying corner radiuses */}
              <div
                className={`p-4 text-xs sm:text-sm leading-relaxed transition-all ${
                  isUser
                    ? 'bg-[#5d674f] text-white rounded-2xl rounded-tr-xs shadow-xs max-w-[85%]'
                    : 'bg-white border border-[#e6e2d9] text-[#422701] rounded-2xl rounded-tl-xs shadow-xs max-w-[92%]'
                }`}
              >
                {!isUser && (
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#705e46] mb-1.5 border-b border-[#f0ede6] pb-1">
                    <Bot className="w-3 h-3 text-[#5d674f]" />
                    <span>LedgerPilot Agent ({msg.model || selectedModel})</span>
                  </div>
                )}

                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>

              {/* Timestamp & Meta */}
              <span className="text-[10px] text-[#705e46] px-1 mt-1 font-mono">
                {msg.timestamp || ''}
              </span>
            </div>
          );
        })}

        {/* Dynamic Financial Loading State */}
        {isLoading && (
          <div className="flex items-start gap-2 mr-auto max-w-[85%]">
            <div className="p-3 rounded-2xl rounded-tl-xs bg-white border border-[#e6e2d9] text-xs text-[#705e46] flex items-center gap-2 shadow-xs">
              <RefreshCw className="w-3.5 h-3.5 text-[#5d674f] animate-spin" />
              <span>{statusIndicatorText || 'Analyzing invoice records...'}</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Financial Prompts Bar */}
      <div className="px-4 py-2 bg-[#faf9f6] border-t border-[#f0ede6] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <span className="text-[10px] text-[#705e46] uppercase font-semibold shrink-0 mr-1">
          Quick Inquiries:
        </span>
        {samplePrompts.map((promptText, idx) => (
          <button
            key={idx}
            disabled={isLoading}
            onClick={() => handleSendMessage(promptText)}
            className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-white border border-[#e6e2d9] text-[#705e46] hover:text-[#422701] hover:border-[#d6b588] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            {promptText}
          </button>
        ))}
      </div>

      {/* Input Action Bar */}
      <div className="p-3 sm:p-4 border-t border-[#f0ede6] bg-white flex items-center gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          disabled={isLoading}
          placeholder="Ask about tax calculation, PO match, or approval status..."
          className="flex-1 px-4 py-2.5 text-xs sm:text-sm bg-[#faf9f6] border border-[#e6e2d9] rounded-xl text-[#422701] placeholder-[#705e46]/60 focus:outline-none focus:border-[#5d674f] focus:ring-1 focus:ring-[#5d674f] transition-colors"
        />

        <button
          onClick={() => handleSendMessage()}
          disabled={isLoading || !inputText.trim()}
          aria-label="Send message to AP copilot"
          className="p-3 text-white bg-[#5d674f] hover:bg-[#4b543f] active:bg-[#3f4634] rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-xs flex items-center justify-center shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
