import React from 'react';
import { cn } from '../../lib/utils';
import { LucideIcon } from 'lucide-react';

interface ActionCardProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  onClick: () => void;
  backgroundImage?: string;
  className?: string;
  badge?: string;
  color?: string;
}

export const ActionCard: React.FC<ActionCardProps> = ({
  title,
  subtitle,
  icon: Icon,
  onClick,
  backgroundImage,
  className,
  badge,
  color = "text-blue-500"
}) => {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-center justify-center p-8 bg-white border border-slate-100 rounded-2xl overflow-hidden transition-all duration-500 hover:border-blue-400 hover:shadow-premium aspect-[4/3] w-full",
        className
      )}
    >
      {/* Background Layer */}
      {backgroundImage ? (
        <div 
          className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
          style={{ backgroundImage: `url(${backgroundImage})` }}
        />
      ) : (
        <div className="absolute inset-0 bg-slate-50 transition-colors group-hover:bg-slate-100" />
      )}
      
      {/* Overlay */}
      <div className={cn(
        "absolute inset-0 z-10 transition-opacity duration-500",
        backgroundImage ? "bg-slate-950/60 opacity-80 group-hover:opacity-90" : "opacity-0"
      )} />

      {/* Content */}
      <div className="relative z-20 flex flex-col items-center text-center">
        <div className={cn(
          "p-4 rounded-full mb-4 transition-all duration-500 shadow-sm",
          backgroundImage 
            ? "bg-white/10 backdrop-blur-md border border-white/20 text-white group-hover:bg-blue-600 group-hover:scale-110" 
            : "bg-white border border-slate-100 group-hover:scale-110",
          color
        )}>
          <Icon className="w-8 h-8" />
        </div>
        
        {badge && (
          <span className={cn(
            "text-[8px] font-black uppercase tracking-[0.2em] mb-2",
            backgroundImage ? "text-blue-400" : "text-slate-400"
          )}>
            {badge}
          </span>
        )}
        
        <h3 className={cn(
          "text-sm font-bold uppercase tracking-tight",
          backgroundImage ? "text-white" : "text-slate-900"
        )}>
          {title}
        </h3>
        <p className={cn(
          "text-[10px] font-mono mt-1 opacity-60 uppercase tracking-widest",
          backgroundImage ? "text-slate-300" : "text-slate-500"
        )}>
          {subtitle}
        </p>
      </div>
      
      {/* Fallback pattern if no background image */}
      {!backgroundImage && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-slate-200 group-hover:bg-blue-500 transition-colors" />
      )}
    </button>
  );
};
