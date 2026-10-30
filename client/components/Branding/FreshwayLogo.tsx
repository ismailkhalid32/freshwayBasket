import React from 'react';

interface FreshwayLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  customLogoUrl?: string;
}

export const FreshwayLogo: React.FC<FreshwayLogoProps> = ({
  size = 'md',
  showText = false,
  className = '',
  customLogoUrl,
}) => {
  const dimensions = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  const textSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-2xl',
  };

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {customLogoUrl ? (
        <img
          src={customLogoUrl}
          alt="Freshway Water"
          className={`${dimensions[size]} rounded-xl object-contain bg-white shadow-xs`}
        />
      ) : (
        <div
          className={`${dimensions[size]} rounded-2xl bg-gradient-to-br from-blue-600 via-cyan-500 to-teal-400 flex items-center justify-center shadow-md shadow-blue-500/20 flex-shrink-0`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="w-3/5 h-3/5 text-white"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"
              fill="currentColor"
              fillOpacity="0.95"
            />
            <path
              d="M9.5 14.5c.8 1.2 2.2 1.8 3.8 1.5"
              stroke="#0284c7"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}

      {showText && (
        <div className="flex flex-col text-left leading-tight">
          <span
            className={`font-extrabold tracking-tight text-slate-900 dark:text-white ${textSizes[size]}`}
          >
            Freshway <span className="text-blue-600 dark:text-cyan-400">Water</span>
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            POS & Ledger
          </span>
        </div>
      )}
    </div>
  );
};
