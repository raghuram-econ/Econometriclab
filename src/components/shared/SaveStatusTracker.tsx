import React from 'react';
import { Cloud, CloudOff, CheckCircle2, Loader2, LogOut } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { signOut } from '../../services/authService';

export function SaveStatusTracker() {
  const { saveStatus, user } = useStore();

    const getStatusIcon = () => {
        switch (saveStatus) {
              case 'saving':
                      return <Loader2 className="w-3 h-3 animate-spin text-blue-500" />;
                            case 'saved':
                                    return <CheckCircle2 className="w-3 h-3 text-green-500" />;
                                          case 'error':
                                                  return <CloudOff className="w-3 h-3 text-red-500" />;
                                                        default:
                                                                return <Cloud className="w-3 h-3 text-slate-300" />;
                                                                    }
                                                                      };

                                                                        const getStatusText = () => {
                                                                            switch (saveStatus) {
                                                                                  case 'saving': return 'Saving...';
                                                                                        case 'saved': return 'Saved';
                                                                                              case 'error': return 'Save Failed';
                                                                                                    default: return 'Connected';
                                                                                                        }
                                                                                                          };

                                                                                                            if (!user) return null;

                                                                                                              return (
                                                                                                                  <div className="flex flex-col gap-3 py-4 border-t border-slate-100/10 bg-slate-950/80">
                                                                                                                        <div className="flex flex-col gap-1 px-2 mb-1">
                                                                                                                                <div className="flex items-center gap-2">
                                                                                                                                          {getStatusIcon()}
                                                                                                                                                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                                                                                                                                                                {getStatusText()}
                                                                                                                                                                          </span>
                                                                                                                                                                                  </div>
                                                                                                                                                                                          <p className="text-[10px] text-slate-400 font-mono truncate" title={user.email || 'Cloud Account'}>
                                                                                                                                                                                                    {user.email || 'Cloud Account'}
                                                                                                                                                                                                            </p>
                                                                                                                                                                                                                  </div>

                                                                                                                                                                                                                        <button
                                                                                                                                                                                                                                onClick={() => signOut()}
                                                                                                                                                                                                                                        className="mx-2 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500/60 transition-all text-[10px] font-mono tracking-widest uppercase group"
                                                                                                                                                                                                                                              >
                                                                                                                                                                                                                                                      <LogOut className="w-3 h-3 group-hover:text-red-400 transition-colors" />
                                                                                                                                                                                                                                                              Sign Out
                                                                                                                                                                                                                                                                    </button>
                                                                                                                                                                                                                                                                        </div>
                                                                                                                                                                                                                                                                          );
                                                                                                                                                                                                                                                                          }