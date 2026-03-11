import React from 'react';
import { Sparkles } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';

interface GeminiInsightsProps {
  /** The AI-generated insight text to display */
  insight?: string;
  /** Whether the AI is currently generating a response */
  isGenerating?: boolean;
  /** Optional additional CSS classes */
  className?: string;
}

const GeminiInsights: React.FC<GeminiInsightsProps> = ({
  insight,
  isGenerating = false,
  className = '',
}) => {
  return (
    <div
      className={`
        relative rounded-2xl p-5 shadow-lg
        bg-white/20 backdrop-blur-md
        border border-moneta-sage/30
        ${isGenerating ? 'animate-pulse-sage' : ''}
        ${className}
      `.trim()}
    >
      {/* Subtle sage glow overlay when generating */}
      {isGenerating && (
        <div className="absolute inset-0 rounded-2xl bg-moneta-sage/5 pointer-events-none" />
      )}

      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Sparkles
          className={`w-4 h-4 flex-shrink-0 ${
            isGenerating ? 'text-moneta-sage animate-pulse' : 'text-moneta-sage'
          }`}
        />
        <h3 className="text-[11px] font-black uppercase tracking-widest text-moneta-obsidian/70">
          Gemini KI-Einblicke
        </h3>
        {isGenerating && (
          <span className="ml-auto flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1 h-1 rounded-full bg-moneta-sage animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="text-brand-body text-moneta-obsidian/80 leading-relaxed">
        {isGenerating ? (
          <div className="space-y-2">
            <Skeleton className="h-3 w-full bg-moneta-sage/20" />
            <Skeleton className="h-3 w-5/6 bg-moneta-sage/20" />
            <Skeleton className="h-3 w-4/6 bg-moneta-sage/20" />
          </div>
        ) : insight ? (
          <p>{insight}</p>
        ) : (
          <p className="text-moneta-obsidian/40 italic">
            Noch keine Einblicke generiert. Starte eine Analyse, um KI-Erkenntnisse zu erhalten.
          </p>
        )}
      </div>

      {/* Footer */}
      <p className="mt-4 text-[10px] text-moneta-sage/70 font-medium tracking-wide">
        Generiert mit Google Gemini
      </p>
    </div>
  );
};

export default GeminiInsights;
