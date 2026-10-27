import React, { useState } from 'react';
import { X, CheckCircle2, Shield, Send } from 'lucide-react';

interface PilotModalProps {
  isOpen: boolean;
  type: 'pilot' | 'enterprise';
  onClose: () => void;
}

export const PilotModal: React.FC<PilotModalProps> = ({ isOpen, type, onClose }) => {
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [erpSystem, setErpSystem] = useState('NetSuite');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      // Keep feedback visible for a moment then allow closing
    }, 1500);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl bg-white border border-[#e6e2d9] shadow-xl p-6 sm:p-7 space-y-6 animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between border-b border-[#f0ede6] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#5d674f]/10 text-[#5d674f] flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-[#422701]">
                {type === 'pilot' ? 'Request Team Pilot' : 'Enterprise Solutions Inquiry'}
              </h3>
              <p className="text-xs text-[#705e46]">
                {type === 'pilot' ? 'Staging environment for AP teams' : 'ERP connectors & dedicated review'}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setSubmitted(false);
              onClose();
            }}
            className="p-1.5 text-[#705e46] hover:text-[#422701] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#edf2e8] text-[#3f5732] mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-base font-semibold text-[#422701]">Request Received</h4>
            <p className="text-xs text-[#705e46] max-w-xs mx-auto">
              Our accounts payable integration team will send staging configuration credentials to{' '}
              <strong className="text-[#422701]">{email || 'your email'}</strong> within one business day.
            </p>
            <button
              onClick={() => {
                setSubmitted(false);
                onClose();
              }}
              className="mt-4 px-4 py-2 text-xs font-medium text-white bg-[#5d674f] rounded-lg"
            >
              Return to Workspace
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="font-medium text-[#422701] block mb-1">Your Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sarah Jenkins"
                className="w-full px-3 py-2 bg-[#faf9f6] border border-[#e6e2d9] rounded-lg text-[#422701] focus:outline-none focus:ring-1 focus:ring-[#5d674f]"
              />
            </div>

            <div>
              <label className="font-medium text-[#422701] block mb-1">Work Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="s.jenkins@company.com"
                className="w-full px-3 py-2 bg-[#faf9f6] border border-[#e6e2d9] rounded-lg text-[#422701] focus:outline-none focus:ring-1 focus:ring-[#5d674f]"
              />
            </div>

            <div>
              <label className="font-medium text-[#422701] block mb-1">Company / Organization</label>
              <input
                type="text"
                required
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Acme Industries Ltd."
                className="w-full px-3 py-2 bg-[#faf9f6] border border-[#e6e2d9] rounded-lg text-[#422701] focus:outline-none focus:ring-1 focus:ring-[#5d674f]"
              />
            </div>

            <div>
              <label className="font-medium text-[#422701] block mb-1">Primary Accounting / ERP System</label>
              <select
                value={erpSystem}
                onChange={(e) => setErpSystem(e.target.value)}
                className="w-full px-3 py-2 bg-[#faf9f6] border border-[#e6e2d9] rounded-lg text-[#422701] focus:outline-none focus:ring-1 focus:ring-[#5d674f]"
              >
                <option value="NetSuite">Oracle NetSuite</option>
                <option value="SAP">SAP S/4HANA / Business One</option>
                <option value="QuickBooks">QuickBooks Online / Desktop</option>
                <option value="Xero">Xero</option>
                <option value="Workday">Workday Financial Management</option>
                <option value="Other">Custom API / Other</option>
              </select>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#f0ede6]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-[#705e46] hover:text-[#422701]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 text-xs font-medium text-white bg-[#5d674f] hover:bg-[#4b543f] rounded-lg transition-colors shadow-xs flex items-center gap-1.5"
              >
                <span>Submit Request</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
