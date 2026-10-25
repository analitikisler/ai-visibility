// Add one prompt, paste many, or edit one. Used by the Prompts page (and its drawer).
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Prompt, PromptIntent, PromptInput, PromptTier } from '@shared/types';
import { useProject } from '@/components/layout/ProjectContext';
import { Button, Dialog, Input, SegmentedControl, Select, Textarea, useToast } from '@/components/ui';
import { copy, fmt, plural } from '@/content/copy';
import { errorMessage, useCreatePrompts, usePrompts, useUpdatePrompt } from '@/lib/api';
import { cn } from '@/lib/cn';

const P = copy.pages.prompts;
const F = copy.pages.onboarding.fields;

export const TIERS: PromptTier[] = ['must_win', 'core', 'foundational'];
export const INTENTS: PromptIntent[] = ['discovery', 'comparison', 'alternatives', 'how_to', 'branded'];
export const tierOptions = TIERS.map((t) => ({ value: t, label: copy.labels.tier[t] }));
export const intentOptions = INTENTS.map((i) => ({ value: i, label: copy.labels.intent[i] }));

/** Heat ramp steps 0..7 (raw theme tokens from brand/tokens.css, defined for light and dark). */
export const HEAT_STEPS = [
  'var(--heat-0)',
  'var(--heat-1)',
  'var(--heat-2)',
  'var(--heat-3)',
  'var(--heat-4)',
  'var(--heat-5)',
  'var(--heat-6)',
  'var(--heat-7)',
] as const;

/** Ordered-category marker on the brand-blue ramp, starting at step 4 (BRAND §7.2). */
export const TIER_HEAT: Record<PromptTier, string> = { must_win: HEAT_STEPS[7], core: HEAT_STEPS[5], foundational: HEAT_STEPS[4] };

/** Tier label with its ramp swatch (identity by text, swatch is secondary). */
export function TierLabel({ tier, className }: { tier: PromptTier; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      <span aria-hidden className="size-2 shrink-0 rounded-xs" style={{ background: TIER_HEAT[tier] }} />
      {copy.labels.tier[tier]}
    </span>
  );
}

/** Lines → prompt texts: trimmed, list markers stripped, ≥ 3 chars, de-duplicated (case-insensitive). */
export function parsePromptLines(raw: string, existing: string[] = []): { texts: string[]; duplicates: number } {
  const seen = new Set(existing.map((t) => t.trim().toLowerCase()));
  const texts: string[] = [];
  let duplicates = 0;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.replace(/^\s*(?:[-*•]|\d{1,3}[.)])\s+/, '').trim();
    if (t.length < 3) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) {
      duplicates++;
      continue;
    }
    seen.add(k);
    texts.push(t.slice(0, 500));
  }
  return { texts, duplicates };
}

type Mode = 'single' | 'bulk';

export interface PromptDialogProps {
  open: boolean;
  onClose: () => void;
  /** Edit this prompt; omit to add. */
  prompt?: Prompt | null;
  /** Start in bulk-paste mode (add only). */
  initialMode?: Mode;
}

export function PromptDialog({ open, onClose, prompt, initialMode = 'single' }: PromptDialogProps) {
  const { projectId } = useProject();
  const toast = useToast();
  const existing = usePrompts(projectId);
  const create = useCreatePrompts(projectId);
  const update = useUpdatePrompt(projectId);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [text, setText] = useState('');
  const [bulk, setBulk] = useState('');
  const [topic, setTopic] = useState('');
  const [tier, setTier] = useState<PromptTier>('core');
  const [intent, setIntent] = useState<PromptIntent>('discovery');
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const bulkRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setMode(prompt ? 'single' : initialMode);
    setText(prompt?.text ?? '');
    setBulk('');
    setTopic(prompt?.topic ?? '');
    setTier(prompt?.tier ?? 'core');
    setIntent(prompt?.intent ?? 'discovery');
    setTouched(false);
    setServerError(null);
    // The native dialog focuses its first button on open; start in the text field instead.
    // A timeout (not rAF) so it also runs in background tabs, after the mode's field has mounted.
    const t = window.setTimeout(() => (prompt || initialMode === 'single' ? textRef : bulkRef).current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, prompt, initialMode]);

  const others = useMemo(() => (existing.data ?? []).filter((p) => p.id !== prompt?.id).map((p) => p.text), [existing.data, prompt]);
  const parsed = useMemo(() => parsePromptLines(bulk, others), [bulk, others]);
  const single = text.trim();
  const singleError =
    single.length < 3 ? copy.pages.onboarding.editor.promptTooShort : others.some((t) => t.toLowerCase() === single.toLowerCase()) ? copy.pages.onboarding.validation.duplicate : null;
  const bulkError = parsed.texts.length === 0 ? copy.pages.onboarding.validation.promptsRequired : null;
  const busy = create.isPending || update.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setServerError(null);
    const shared = { topic: topic.trim() || undefined, tier, intent };
    if (prompt) {
      if (singleError) return;
      update.mutate(
        { id: prompt.id, text: single, topic: topic.trim(), tier, intent },
        {
          onSuccess: () => {
            toast.success(P.toasts.saved);
            onClose();
          },
          onError: (err) => setServerError(errorMessage(err)),
        },
      );
      return;
    }
    const body: PromptInput[] = mode === 'single' ? (singleError ? [] : [{ text: single, ...shared }]) : parsed.texts.map((t) => ({ text: t, ...shared }));
    if (!body.length) return;
    create.mutate(body, {
      onSuccess: (created) => {
        const skipped = body.length - created.length;
        if (created.length === 0) toast.toast({ tone: 'info', title: P.toasts.nothingAdded });
        else toast.success(plural(created.length, P.toasts.added), skipped > 0 ? plural(skipped, P.toasts.skipped) : undefined);
        onClose();
      },
      onError: (err) => setServerError(errorMessage(err)),
    });
  };

  const formId = 'prompt-form';
  const count = parsed.texts.length;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title={prompt ? P.dialog.editTitle : mode === 'bulk' ? P.dialog.bulkTitle : P.dialog.addTitle}
      description={prompt ? undefined : mode === 'bulk' ? P.dialog.bulkHelp : F.promptText.help}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {copy.common.cancel}
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={busy}>
            {prompt || mode === 'single' ? P.dialog.save : count > 0 ? plural(count, copy.pages.onboarding.editor.addPasted) : P.dialog.save}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
        {!prompt && (
          <SegmentedControl<Mode>
            label={P.actions.add}
            size="md"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'single', label: P.dialogModes.single },
              { value: 'bulk', label: P.dialogModes.bulk },
            ]}
          />
        )}
        {mode === 'single' ? (
          <Textarea
            ref={textRef}
            label={F.promptText.label}
            placeholder={F.promptText.placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter saves (prompts are one line); Shift+Enter is ignored rather than adding a newline.
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            maxLength={500}
            error={touched ? singleError : null}
            required
          />
        ) : (
          <div>
            <Textarea
              ref={bulkRef}
              label={F.promptText.label}
              placeholder={copy.pages.onboarding.editor.pastePlaceholder}
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              rows={8}
              error={touched ? bulkError : null}
            />
            <p className="mt-1.5 font-mono text-xs text-text-muted tnum" aria-live="polite">
              {plural(count, P.dialog.bulkCount)}
              {parsed.duplicates > 0 && <span className="text-text-subtle"> · {plural(parsed.duplicates, copy.pages.onboarding.editor.duplicatesSkipped)}</span>}
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Select<PromptTier> label={F.promptTier.label} value={tier} onChange={setTier} options={tierOptions} />
          <Select<PromptIntent> label={F.promptIntent.label} value={intent} onChange={setIntent} options={intentOptions} />
          <Input label={F.promptTopic.label} placeholder={F.promptTopic.placeholder} value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={80} />
        </div>
        <p className="text-xs text-text-subtle">{copy.glossary.tiers[tier].short}</p>
        {serverError && (
          <p role="alert" className="text-sm text-danger">
            {copy.app.errors.saveFailed} <span className="text-text-muted">{fmt(copy.app.errors.detail, { detail: serverError })}</span>
          </p>
        )}
      </form>
    </Dialog>
  );
}
