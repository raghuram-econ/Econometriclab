import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Keyboard, ArrowRight, Play, Compass, Database, BookOpen, BarChart2 } from 'lucide-react';

interface ShortcutsHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsHelpModal({ isOpen, onClose }: ShortcutsHelpModalProps) {
  const isMac = typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
  const modifier = isMac ? '⌘' : 'Ctrl';

  const shortcuts = [
    {
      category: 'Core Actions',
      items: [
        { keys: [modifier, 'Enter'], desc: 'Run Model / Execute Active Protocol', icon: Play, highlight: true },
        { keys: [isMac ? '⌥' : 'Alt', 'K'], desc: 'Toggle Shortcuts Help Reference', icon: Keyboard },
        { keys: ['Esc'], desc: 'Close open dialogs, menus, or modals' }
      ]
    },
    {
      category: 'Module Quick-Navigation',
      items: [
        { keys: [isMac ? '⌥' : 'Alt', '1'], desc: 'Scholar Dashboard', icon: Compass },
        { keys: [isMac ? '⌥' : 'Alt', '2'], desc: 'Professor Desk (Economics Tutor)', icon: BookOpen },
        { keys: [isMac ? '⌥' : 'Alt', '3'], desc: 'Essay Coach (Teacher Mode)' },
        { keys: [isMac ? '⌥' : 'Alt', '4'], desc: 'Data Upload Lab' },
        { keys: [isMac ? '⌥' : 'Alt', '5'], desc: 'Data & Exploratory Analysis', icon: Database },
        { keys: [isMac ? '⌥' : 'Alt', '6'], desc: 'Linear Models (OLS)', icon: BarChart2 },
        { keys: [isMac ? '⌥' : 'Alt', '7'], desc: 'Regularization (LASSO/Ridge)' },
        { keys: [isMac ? '⌥' : 'Alt', '8'], desc: 'Panel Data (FE/RE)' },
        { keys: [isMac ? '⌥' : 'Alt', '9'], desc: 'Empirical Quiz Corner' }
      ]
    }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm"
            id="shortcuts-modal-backdrop"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', duration: 0.4 }}
            className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden relative z-10 flex flex-col max-h-[85vh]"
            id="shortcuts-modal-box"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
                  <Keyboard className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
                    Academic Keyboard Shortcuts
                  </h3>
                  <p className="text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold mt-0.5">
                    Boost your research & study throughput
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                id="close-shortcuts-modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Shortcut List */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
              {shortcuts.map((cat, idx) => (
                <div key={idx} className="space-y-3">
                  <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-500 font-mono">
                    {cat.category}
                  </h4>
                  <div className="space-y-2.5">
                    {cat.items.map((item, keyIdx) => (
                      <div
                        key={keyIdx}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                          item.highlight
                            ? 'bg-indigo-50/40 border-indigo-100 hover:bg-indigo-50'
                            : 'bg-slate-50/50 border-slate-100 hover:bg-slate-50 hover:border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {item.icon && (
                            <item.icon
                              className={`w-4 h-4 shrink-0 ${
                                item.highlight ? 'text-indigo-600 font-bold' : 'text-slate-400'
                              }`}
                            />
                          )}
                          <span
                            className={`text-xs ${
                              item.highlight ? 'font-semibold text-slate-900' : 'text-slate-600'
                            }`}
                          >
                            {item.desc}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 font-mono">
                          {item.keys.map((k, kIdx) => (
                            <React.Fragment key={kIdx}>
                              <kbd className="px-2 py-1 bg-white border border-slate-300 rounded-md text-[10px] font-bold text-slate-700 shadow-xs uppercase tracking-tight">
                                {k}
                              </kbd>
                              {kIdx < item.keys.length - 1 && (
                                <span className="text-slate-300 text-[10px] font-sans font-semibold">+</span>
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span>Economics Learning Lab Beta</span>
              <span className="flex items-center gap-1">
                Hit <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded">Esc</kbd> to exit
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
