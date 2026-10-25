// Add / edit / remove a tracked competitor. Shared by the Competitors page and Project settings.
// The server re-reads past answers whenever names change; the mutation hooks invalidate every aggregate.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { Competitor } from '@shared/types';
import { useProject } from '@/components/layout/ProjectContext';
import { Button, ChipsInput, ConfirmDialog, Dialog, Dot, IconButton, Input, useToast } from '@/components/ui';
import { copy, fmt, plural } from '@/content/copy';
import { errorMessage, useCreateCompetitor, useDeleteCompetitor, useUpdateCompetitor } from '@/lib/api';
import { OTHER_COLOR } from '@/lib/colors';

const C = copy.pages.competitors;
const F = copy.pages.onboarding.fields;

/** Same rule as the server: optional, but if present it must look like `acme.com`. */
export function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '');
}
export const isDomain = (raw: string) => /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(normalizeDomain(raw));

export interface CompetitorDialogProps {
  open: boolean;
  onClose: () => void;
  /** Edit this competitor; omit to add a new one. */
  competitor?: Competitor | null;
}

export function CompetitorDialog({ open, onClose, competitor }: CompetitorDialogProps) {
  const { project, projectId } = useProject();
  const toast = useToast();
  const create = useCreateCompetitor(projectId);
  const update = useUpdateCompetitor(projectId);
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [aliases, setAliases] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    // The native dialog focuses its first button on open; move focus to the first field instead.
    nameRef.current?.focus();
    setName(competitor?.name ?? '');
    setDomain(competitor?.domain ?? '');
    setAliases(competitor?.aliases ?? []);
    setTouched(false);
    setServerError(null);
  }, [open, competitor]);

  const trimmed = name.trim();
  const others = project.competitors.filter((c) => c.id !== competitor?.id);
  // Name the existing competitor as stored ("You already track Trello."), not as typed.
  const existing = others.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
  const nameError = !trimmed
    ? C.manage.nameRequired
    : existing
      ? fmt(C.manage.duplicate, { name: existing.name })
      : [project.name, ...project.aliases].some((n) => n.toLowerCase() === trimmed.toLowerCase())
        ? C.manage.isBrand
        : null;
  const domainError = domain.trim() && !isDomain(domain) ? copy.pages.onboarding.validation.domainInvalid : null;
  const busy = create.isPending || update.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (nameError || domainError) return;
    const body = { name: trimmed, domain: domain.trim() ? normalizeDomain(domain) : '', aliases };
    const onError = (err: unknown) => setServerError(errorMessage(err));
    if (competitor) {
      update.mutate(
        { id: competitor.id, ...body },
        {
          onSuccess: (c) => {
            toast.success(fmt(C.manage.saved, { name: c.name }));
            onClose();
          },
          onError,
        },
      );
    } else {
      create.mutate(body, {
        onSuccess: (c) => {
          toast.success(fmt(C.manage.added, { name: c.name }));
          onClose();
        },
        onError,
      });
    }
  };

  const formId = 'competitor-form';
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={competitor ? fmt(C.dialog.editTitle, { name: competitor.name }) : C.dialog.addTitle}
      description={C.manage.reanalyzeNote}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {copy.common.cancel}
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={busy}>
            {C.dialog.save}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
        <Input
          ref={nameRef}
          label={F.competitorName.label}
          placeholder={F.competitorName.placeholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={touched ? nameError : null}
          required
          maxLength={120}
        />
        <Input
          label={F.competitorDomain.label}
          placeholder={F.competitorDomain.placeholder}
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          onBlur={() => domain.trim() && setDomain(normalizeDomain(domain))}
          hint={C.manage.domainHelp}
          error={touched ? domainError : null}
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
        />
        <ChipsInput label={F.aliases.label} placeholder={F.competitorAliases.placeholder} hint={F.aliases.help} values={aliases} onChange={setAliases} />
        {serverError && (
          <p role="alert" className="text-sm text-danger">
            {copy.app.errors.saveFailed} <span className="text-text-muted">{fmt(copy.app.errors.detail, { detail: serverError })}</span>
          </p>
        )}
      </form>
    </Dialog>
  );
}

export function RemoveCompetitorDialog({ competitor, onClose }: { competitor: Competitor | null; onClose: () => void }) {
  const { projectId } = useProject();
  const toast = useToast();
  const remove = useDeleteCompetitor(projectId);
  const name = competitor?.name ?? '';
  return (
    <ConfirmDialog
      open={!!competitor}
      onClose={onClose}
      title={fmt(C.removeDialog.title, { name })}
      body={fmt(C.removeDialog.body, { name })}
      confirmLabel={C.removeDialog.confirm}
      cancelLabel={C.removeDialog.cancel}
      loading={remove.isPending}
      onConfirm={() =>
        competitor &&
        remove.mutate(competitor.id, {
          onSuccess: () => {
            toast.success(fmt(C.manage.removed, { name }));
            onClose();
          },
          onError: (e) => toast.error(fmt(copy.app.errors.deleteFailed, { name }), errorMessage(e)),
        })
      }
    />
  );
}

/** Dialog state for one page: `add()`, `edit(c)`, `remove(c)` plus the dialogs to render once. */
export function useCompetitorDialogs() {
  const [editing, setEditing] = useState<{ open: boolean; competitor: Competitor | null }>({ open: false, competitor: null });
  const [removing, setRemoving] = useState<Competitor | null>(null);
  const dialogs = (
    <>
      <CompetitorDialog open={editing.open} competitor={editing.competitor} onClose={() => setEditing((s) => ({ ...s, open: false }))} />
      <RemoveCompetitorDialog competitor={removing} onClose={() => setRemoving(null)} />
    </>
  );
  return {
    add: () => setEditing({ open: true, competitor: null }),
    edit: (c: Competitor) => setEditing({ open: true, competitor: c }),
    remove: (c: Competitor) => setRemoving(c),
    dialogs,
  };
}

/** Editable competitor list (Project settings): color, name, domain, other names, edit/remove. */
export function CompetitorList() {
  const { project, colors } = useProject();
  const d = useCompetitorDialogs();
  return (
    <div>
      {project.competitors.length === 0 ? (
        <p className="rounded-md border border-dashed border-border-strong px-4 py-6 text-center text-sm text-text-muted">{copy.pages.onboarding.competitors.empty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {project.competitors.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
              <Dot color={colors[c.id] ?? OTHER_COLOR} size={10} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">{c.name}</p>
                <p className="truncate text-xs text-text-subtle">
                  <span className="font-mono">{c.domain || '—'}</span>
                  {c.aliases.length > 0 && <span> · {plural(c.aliases.length, C.manage.aliasesCount)}</span>}
                </p>
              </div>
              <IconButton icon={Pencil} label={`${C.actions.edit}: ${c.name}`} size="sm" onClick={() => d.edit(c)} />
              <IconButton icon={Trash2} label={`${C.actions.remove}: ${c.name}`} size="sm" onClick={() => d.remove(c)} />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-text-subtle">{project.competitors.length > 7 ? C.otherNote : C.colorNote}</p>
        <Button size="sm" icon={Plus} onClick={d.add}>
          {C.actions.add}
        </Button>
      </div>
      {d.dialogs}
    </div>
  );
}
