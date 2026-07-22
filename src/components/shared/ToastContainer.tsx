import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, X, Info } from 'lucide-react';
import { useStore, ToastItem } from '../../store/useStore';

export default function ToastContainer() {
  const { toasts, removeToast } = useStore();

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast: ToastItem) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95, transition: { duration: 0.15 } }}
            className="pointer-events-auto w-full"
          >
            <div className={`
              flex items-start gap-3 p-4 rounded-xl border shadow-lg backdrop-blur-md transition-all
              ${toast.type === 'success' 
                ? 'bg-white/95 border-emerald-100 text-slate-800 shadow-emerald-950/5' 
                : toast.type === 'error'
                ? 'bg-white/95 border-rose-100 text-slate-800 shadow-rose-950/5'
                : 'bg-white/95 border-slate-200 text-slate-800 shadow-slate-950/5'
              }
            `}>
              {/* Left Indicator bar */}
              <div className={`absolute top-0 bottom-0 left-0 w-1.5 rounded-l-xl
                ${toast.type === 'success' ? 'bg-emerald-500' : toast.type === 'error' ? 'bg-rose-500' : 'bg-blue-500'}
              `} />

              {/* Icon */}
              <div className="flex-shrink-0 mt-0.5">
                {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-500" />}
                {toast.type === 'info' && <Info className="w-5 h-5 text-blue-500" />}
              </div>

              {/* Message & Description */}
              <div className="flex-1 min-w-0 pr-2">
                <p className="text-[12px] font-bold text-slate-900 leading-tight">
                  {toast.message}
                </p>
                {toast.description && (
                  <p className="text-[11px] text-slate-500 font-serif leading-relaxed mt-1 whitespace-pre-line">
                    {toast.description}
                  </p>
                )}
              </div>

              {/* Close Button */}
              <button
                onClick={() => removeToast(toast.id)}
                className="flex-shrink-0 text-slate-400 hover:text-slate-600 transition-colors p-1 -m-1 rounded-md hover:bg-slate-100"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
