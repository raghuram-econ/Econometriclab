import React, { useState, useEffect } from 'react';
import { 
  X, 
  AlertTriangle, 
  Database, 
  ExternalLink 
} from 'lucide-react';
import { clearSavedChatHistory, useStore } from '../../store/useStore';

// ============================================================================
// COMPONENT 1: DataUploadPrivacyBanner
// ============================================================================
export function DataUploadPrivacyBanner() {
  const [isDismissed, setIsDismissed] = useState(true);

  useEffect(() => {
    const dismissed = localStorage.getItem('privacy_banner_dismissed');
    if (dismissed !== 'true') {
      setIsDismissed(false);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('privacy_banner_dismissed', 'true');
    setIsDismissed(true);
  };

  if (isDismissed) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 shadow-sm relative flex items-start gap-3 transition-all duration-200 animate-in fade-in slide-in-from-top-4">
      <div className="p-1.5 bg-blue-100 rounded-xl text-blue-700 shrink-0">
        <Database className="w-5 h-5" />
      </div>
      <div className="space-y-2 flex-1 pr-6">
        <h4 className="text-sm font-bold text-blue-900 leading-none">
          Data processing depends on the feature
        </h4>
        <p className="text-xs text-blue-900 leading-relaxed font-serif">
          Some calculations run in your browser. Python analyses and SPSS SAV parsing send data to this app's Render services. AI requests are sent through the app server to OpenRouter, and signed-in accounts can save workspace details and model results to Supabase.
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800">
            Browser + server compute
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800">
            Supabase saves
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-stone-200 text-stone-700">
            AI via OpenRouter
          </span>
        </div>
      </div>
      <button 
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-emerald-600 hover:text-emerald-800 p-1 hover:bg-emerald-100/50 rounded-lg transition-colors"
        aria-label="Dismiss privacy banner"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ============================================================================
// COMPONENT 2: AIExplainConsentModal
// ============================================================================
interface AIExplainConsentModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function AIExplainConsentModal({ onConfirm, onCancel }: AIExplainConsentModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const consentGiven = sessionStorage.getItem('ai_consent_given');
    if (consentGiven !== 'true') {
      setIsOpen(true);
    } else {
      // If consent is already given, immediately trigger confirm callback
      onConfirm();
    }
  }, [onConfirm]);

  const handleConfirm = () => {
    sessionStorage.setItem('ai_consent_given', 'true');
    setIsOpen(false);
    onConfirm();
  };

  const handleCancel = () => {
    onCancel();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs transition-all duration-200 animate-in fade-in">
      <div className="bg-white border border-stone-200 rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-6 transform animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-stone-900">What gets sent to AI</h3>
            <p className="text-xs text-stone-500 font-serif italic mt-0.5">Transparent privacy boundaries</p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-3">
          <p className="text-xs text-stone-600 leading-relaxed font-serif">
            This request sends its model summary, question, and any context attached by this feature to the app server, which forwards the AI prompt to OpenRouter. The content can vary by feature, so do not assume every AI request contains only anonymised statistics. Other Python analyses and SPSS SAV parsing send data to the Render backend.
          </p>

          <div className="border border-stone-100 rounded-xl overflow-hidden text-xs">
            {/* Sent Box */}
            <div className="bg-emerald-50/50 p-3 border-b border-stone-100">
              <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest block mb-1">
                Example of model context
              </span>
              <code className="font-mono text-[11px] text-stone-700 block bg-white p-1.5 rounded border border-emerald-100 shadow-xs">
                β = 0.432, SE = 0.091, p = 0.003, R² = 0.71
              </code>
            </div>
            <div className="bg-amber-50/70 p-3">
              <span className="text-[10px] font-bold text-amber-900 uppercase tracking-widest block mb-1">
                Before you continue
              </span>
              <p className="text-[11px] text-amber-950">
                Do not send confidential data unless your institution and data agreement allow it.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-stone-500 hover:text-stone-700 hover:bg-stone-50 rounded-xl transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-5 py-2.5 bg-[#1B2E41] hover:bg-[#243D54] text-white rounded-xl text-xs font-bold uppercase tracking-widest shadow-sm hover:shadow transition-all"
          >
            Send request to AI
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// COMPONENT 3: PrivacySettingsPanel
// ============================================================================
export function PrivacySettingsPanel() {
  const store = useStore();
  const [saveChat, setSaveChat] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('privacy_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.saveChatHistory !== undefined) {
          setSaveChat(parsed.saveChatHistory);
        }
      }
    } catch (e) {
      console.error('Failed to parse privacy_settings:', e);
    }
  }, []);

  const saveSettings = (newAi: boolean, newSaveChat: boolean) => {
    const settings = {
      aiEnabled: newAi,
      saveChatHistory: newSaveChat,
    };
    localStorage.setItem('privacy_settings', JSON.stringify(settings));
  };

  const handleToggleAi = () => {
    const nextVal = !store.aiEnabled;
    store.setAIEnabled(nextVal);
    saveSettings(nextVal, saveChat);
  };

  const handleToggleSaveChat = () => {
    const nextVal = !saveChat;
    setSaveChat(nextVal);
    saveSettings(store.aiEnabled, nextVal);
    if (!nextVal) clearSavedChatHistory();
  };

  return (
    <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-6 space-y-6">
      <div>
        <h3 className="text-sm font-bold text-stone-900 uppercase tracking-wider">Privacy &amp; Security Settings</h3>
        <p className="text-xs text-stone-500 font-serif italic mt-0.5">Configure how your data and results are processed.</p>
      </div>

      <div className="divide-y divide-stone-100">
        
        {/* Row 1: Allow AI Explanations */}
        <div className="flex items-center justify-between py-4 first:pt-0">
          <div className="space-y-1 pr-4">
            <label className="text-xs font-bold text-stone-800 block">Allow AI explanations</label>
            <p className="text-[11px] text-stone-500 font-serif leading-relaxed">
              Enable the AI Professor to analyze OLS coefficients, diagnostic statistics, and panel runs.
            </p>
          </div>
          <button
            onClick={handleToggleAi}
            className={`w-11 h-6 shrink-0 rounded-full transition-all duration-200 relative focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1B2E41] ${
              store.aiEnabled ? 'bg-[#1B2E41]' : 'bg-stone-200'
            }`}
            role="switch"
            aria-checked={store.aiEnabled}
          >
            <span
              className={`block w-4.5 h-4.5 rounded-full bg-white shadow-sm transform transition-transform duration-200 absolute top-[3px] ${
                store.aiEnabled ? 'translate-x-[22px]' : 'translate-x-[4px]'
              }`}
            />
          </button>
        </div>

        {/* Row 2: Save Chat History */}
        <div className="flex items-center justify-between py-4">
          <div className="space-y-1 pr-4">
            <label className="text-xs font-bold text-stone-800 block">Save chat history</label>
            <p className="text-[11px] text-stone-500 font-serif leading-relaxed">
              When enabled, AI chat messages are saved in this browser. Turning this off removes saved chat copies and prevents future local chat autosaves. It does not change data already sent to OpenRouter.
            </p>
          </div>
          <button
            onClick={handleToggleSaveChat}
            className={`w-11 h-6 shrink-0 rounded-full transition-all duration-200 relative focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1B2E41] ${
              saveChat ? 'bg-[#1B2E41]' : 'bg-stone-200'
            }`}
            role="switch"
            aria-checked={saveChat}
          >
            <span
              className={`block w-4.5 h-4.5 rounded-full bg-white shadow-sm transform transition-transform duration-200 absolute top-[3px] ${
                saveChat ? 'translate-x-[22px]' : 'translate-x-[4px]'
              }`}
            />
          </button>
        </div>

      </div>
    </div>
  );
}

// ============================================================================
// COMPONENT 4: PrivacyTrustStrip
// ============================================================================
export function PrivacyTrustStrip() {
  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-[10px] text-slate-400 space-y-2.5">
      <div className="flex items-center gap-2 text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest">
        <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
        DATA HANDLING
      </div>
      <div className="grid grid-cols-1 gap-1.5 font-sans">
        <div className="flex items-center gap-2">
          <span className="text-emerald-500/80 text-[11px]">🔒</span>
          <span className="text-slate-300">Some methods run in browser</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-emerald-500/80 text-[11px]">🚫</span>
          <span className="text-slate-300">Python methods use Render</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-emerald-500/80 text-[11px]">👁️</span>
          <span className="text-slate-300">AI requests go to OpenRouter</span>
        </div>
      </div>
      <div className="border-t border-white/5 pt-2 flex justify-between items-center text-[9px]">
        <span className="text-slate-600 font-sans tracking-wide uppercase font-bold">Privacy Shield</span>
        <a 
          href="/privacy" 
          onClick={(e) => {
            e.preventDefault();
            window.history.pushState({}, '', '/privacy');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
          className="text-blue-400 hover:text-blue-300 font-bold uppercase tracking-wider flex items-center gap-0.5 transition-colors"
        >
          Read Policy <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>
    </div>
  );
}
