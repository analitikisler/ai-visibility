import { useState } from 'react';
import { Link } from 'react-router';
import { FlaskConical, X } from 'lucide-react';
import { copy, fmt } from '@/content/copy';
import { useFilters } from '@/lib/filters';
import { useProjectContext } from './ProjectContext';

const KEY = 'ai-visibility-sim-banner-hidden';

function readHidden() {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Slim neutral notice when any selected engine runs in simulated mode (hidden per session). */
export function SimulatedBanner() {
  const ctx = useProjectContext();
  const { engine } = useFilters();
  const [hidden, setHidden] = useState(readHidden);
  if (!ctx?.project || hidden) return null;
  const selected = engine ? ctx.engines.filter((e) => e.id === engine) : ctx.engines;
  const simulated = selected.filter((e) => e.mode === 'simulated');
  if (simulated.length === 0) return null;
  const b = copy.app.simulatedBanner;
  const all = simulated.length === selected.length;
  const body = all ? b.allBody : fmt(b.partialBody, { simulated: simulated.length, total: selected.length });
  const dismiss = () => {
    setHidden(true);
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
  };
  return (
    <div role="note" data-print="hide" className="flex items-center gap-3 border-b border-border bg-surface-2 px-4 py-1.5 text-xs text-text-muted lg:px-6">
      <FlaskConical size={14} strokeWidth={1.75} aria-hidden className="shrink-0" />
      <p className="min-w-0 flex-1 truncate">
        <span className="hidden sm:inline">
          <span className="font-semibold text-text">{all ? b.allTitle : b.partialTitle}.</span> {body}
        </span>
        <span className="sm:hidden">{b.short}</span>
      </p>
      <Link to="/app/settings" className="shrink-0 font-medium text-accent hover:underline">
        {b.cta}
      </Link>
      <button type="button" onClick={dismiss} aria-label={b.dismiss} title={b.dismiss} className="shrink-0 rounded-sm p-0.5 text-text-subtle hover:text-text">
        <X size={14} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}
