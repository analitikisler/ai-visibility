// Review panel for one agent draft: edit, approve, copy/download, mark published, dismiss, delete.
// Human in the loop: copy and download unlock only after a person approves the draft.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, CheckCircle2, Copy, Download, FileCheck2, Info, ShieldCheck, Trash2, Undo2 } from 'lucide-react';
import type { Draft, DraftKind } from '@shared/types';
import { Button, Dialog, Drawer, IconButton, Skeleton, Textarea, Tooltip, useCopy, useToast } from '@/components/ui';
import { copy, fmt } from '@/content/copy';
import { errorMessage, useDeleteDraft, useDrafts, useRecommendations, useUpdateDraft, useUpdateRecommendation } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { DraftKindIcon, DraftModeBadge, DraftStatusBadge } from './DraftBadges';
import { downloadText, draftFile } from './draftFiles';

const D = copy.recommendations.drafts;
const E = D.editor;
const W = copy.pages.actions.drawer;

/** "Comparison page" → "comparison page" mid-sentence; acronyms ("FAQ page") and file names stay as they are. */
const inSentence = (label: string) => (/^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label);

export interface DraftDrawerProps {
  projectId: string;
  /** Draft to show (read from the drafts cache so edits elsewhere stay in sync). */
  draftId: string | null;
  /** While the agent is writing: the kind being drafted (shows a skeleton). */
  pendingKind?: DraftKind | null;
  onClose: () => void;
}

/** Wide right drawer around the draft editor. Open it via `useDraftAgent`. */
export function DraftDrawer({ projectId, draftId, pendingKind, onClose }: DraftDrawerProps) {
  const drafts = useDrafts(projectId, { enabled: !!draftId });
  const draft = draftId ? drafts.data?.find((d) => d.id === draftId) : undefined;
  const open = !!draftId || !!pendingKind;
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  useEffect(() => setDirty(false), [draftId]);

  const requestClose = () => (dirty ? setConfirmClose(true) : onClose());
  const kind = draft?.kind ?? pendingKind ?? null;

  return (
    <>
      <Drawer
        open={open}
        onClose={requestClose}
        widthClass="max-w-3xl"
        title={
          kind && (
            <span className="flex min-w-0 items-center gap-2.5">
              <DraftKindIcon kind={kind} />
              <span className="min-w-0 truncate">{draft?.title ?? fmt(W.drafting, { kind: inSentence(D.kind[kind]) })}</span>
            </span>
          )
        }
        description={kind ? `${D.kind[kind]} · ${D.kindDescription[kind]}` : undefined}
      >
        {draft ? (
          <DraftEditor key={draft.id} draft={draft} projectId={projectId} onDirtyChange={setDirty} onDeleted={onClose} />
        ) : (
          <DraftPending isError={!!draftId && drafts.isSuccess && !draft} />
        )}
      </Drawer>
      <Dialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        size="sm"
        title={copy.common.unsaved.title}
        description={copy.common.unsaved.body}
        footer={
          <>
            <Button onClick={() => setConfirmClose(false)}>{copy.common.unsaved.cancel}</Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmClose(false);
                setDirty(false);
                onClose();
              }}
            >
              {copy.common.unsaved.confirm}
            </Button>
          </>
        }
      />
    </>
  );
}

/**
 * After "Mark as published": close the loop on the recommendation the draft came from (one click).
 * Shown only while that recommendation still exists and isn't done yet, plus a confirmation once it is.
 */
function RecommendationDone({ projectId, recKey }: { projectId: string; recKey: string }) {
  const recs = useRecommendations(projectId);
  const update = useUpdateRecommendation(projectId);
  const toast = useToast();
  const [justDone, setJustDone] = useState(false);
  const rec = recs.data?.find((r) => r.key === recKey);
  if (!rec || (rec.status === 'done' && !justDone)) return null;
  if (rec.status === 'done')
    return (
      <p role="status" className="flex items-start gap-2 rounded-md bg-success-soft px-3 py-2 text-[13px] text-success">
        <CheckCircle2 size={14} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
        <span>{fmt(W.recDone, { title: rec.title })}</span>
      </p>
    );
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="min-w-0 text-[13px] text-text-muted">{fmt(W.recDonePrompt, { title: rec.title })}</p>
      <Button
        size="sm"
        icon={Check}
        loading={update.isPending}
        className="self-start sm:self-auto"
        onClick={() =>
          update.mutate(
            { key: rec.key, status: 'done' },
            { onSuccess: () => setJustDone(true), onError: (e) => toast.error(copy.pages.actions.updateFailed, errorMessage(e)) },
          )
        }
      >
        {W.recDoneCta}
      </Button>
    </div>
  );
}

function DraftPending({ isError }: { isError: boolean }) {
  if (isError) return <p className="px-5 py-10 text-center text-sm text-text-muted">{copy.recommendations.generateFailed}</p>;
  return (
    <div className="flex flex-col gap-4 px-5 py-5" aria-busy="true">
      <p className="text-sm text-text-muted">{W.draftingBody}</p>
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-[52vh] w-full" />
    </div>
  );
}

interface EditorProps {
  draft: Draft;
  projectId: string;
  onDirtyChange: (dirty: boolean) => void;
  onDeleted: () => void;
}

function DraftEditor({ draft, projectId, onDirtyChange, onDeleted }: EditorProps) {
  const toast = useToast();
  const update = useUpdateDraft(projectId);
  const del = useDeleteDraft(projectId);
  const { copied, copy: copyText } = useCopy();
  const [body, setBody] = useState(draft.body);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Success feedback stays inside the drawer (a toast would sit on top of the footer buttons).
  const [notice, setNotice] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const dirty = body !== draft.body;
  useEffect(() => {
    if (!downloaded) return;
    const t = window.setTimeout(() => setDownloaded(false), 1500);
    return () => window.clearTimeout(t);
  }, [downloaded]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const file = useMemo(() => draftFile({ ...draft, body }), [draft, body]);
  // Copy/download only ever hand out approved text: unsaved edits (even to an approved draft) lock them again.
  const locked = draft.status === 'draft' || draft.status === 'dismissed' || dirty;
  const wasApproved = draft.status === 'approved' || draft.status === 'published';
  const needsApproval = draft.status === 'draft' || (dirty && wasApproved);
  const busy = update.isPending;
  const meta = draft.meta;
  const url = typeof meta.url === 'string' ? meta.url : null;
  const recKey = (meta.params as Record<string, string> | undefined)?.recKey ?? null;
  const placement = typeof meta.placement === 'string' ? meta.placement : null;

  const save = (patch: Partial<Pick<Draft, 'status'>>, done?: string) =>
    update.mutate(
      { id: draft.id, ...(dirty ? { body } : {}), ...patch },
      {
        onSuccess: () => setNotice(done ?? null),
        onError: (e) => toast.error(copy.app.errors.saveFailed, errorMessage(e)),
      },
    );

  const lockTip = (node: ReactNode) =>
    locked ? (
      <Tooltip content={dirty && wasApproved ? E.reapprove : E.approveFirst}>
        <span tabIndex={0} className="inline-flex rounded-md">
          {node}
        </span>
      </Tooltip>
    ) : (
      node
    );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-3 px-5 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <DraftStatusBadge status={draft.status} />
          <DraftModeBadge mode={draft.mode} />
          <span className="text-xs text-text-subtle">{fmt(W.updated, { time: relativeTime(draft.updatedAt) })}</span>
          {dirty && <span className="text-xs font-medium text-warning">· {W.unsaved}</span>}
          <span role="status" aria-live="polite" className="ml-auto inline-flex min-w-0 items-center gap-1 text-xs font-medium text-success">
            {notice && !dirty && (
              <>
                <Check size={12} strokeWidth={2.25} aria-hidden />
                <span className="truncate">{notice}</span>
              </>
            )}
          </span>
        </div>
        <dl className="grid gap-x-4 gap-y-1 text-[13px] sm:grid-cols-[auto_1fr]">
            <dt className="text-text-subtle">{W.file}</dt>
            <dd className="min-w-0 truncate font-mono text-text">{file.filename}</dd>
            {url && (
              <>
                <dt className="text-text-subtle">{W.suggestedUrl}</dt>
                <dd className="min-w-0 truncate font-mono text-text">{url}</dd>
              </>
            )}
            {placement && (
              <>
                <dt className="text-text-subtle">{W.placement}</dt>
                <dd className="text-text-muted">{placement}</dd>
              </>
            )}
        </dl>
        {draft.mode === 'template' && (
          <p className="flex items-start gap-2 rounded-md bg-info-soft px-3 py-2 text-[13px] text-info">
            <Info size={14} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
            {D.mode.templateNote}
          </p>
        )}
        {draft.kind === 'outreach_email' && <p className="text-[13px] text-text-muted">{E.emailNote}</p>}
        {draft.status === 'published' && recKey && <RecommendationDone projectId={projectId} recKey={recKey} />}
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-5 py-3">
        <Textarea
          label={W.bodyLabel}
          hideLabel
          mono
          value={body}
          onChange={(e) => setBody(e.target.value)}
          spellCheck={draft.kind !== 'robots_txt' && draft.kind !== 'schema_jsonld' && draft.kind !== 'llms_txt'}
          wrapperClassName="min-h-0 flex-1"
          className="h-full min-h-[44vh] resize-none bg-well text-[12.5px] leading-5"
        />
        <p className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
          <ShieldCheck size={14} strokeWidth={1.75} aria-hidden className="shrink-0 text-text-subtle" />
          {copy.recommendations.humanInLoop}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
        <div className="flex items-center gap-1">
          <IconButton icon={Trash2} label={E.delete} onClick={() => setConfirmDelete(true)} className="hover:text-danger" />
          {draft.status === 'dismissed' ? (
            <Button variant="ghost" icon={Undo2} onClick={() => save({ status: 'draft' }, W.restored)} disabled={busy}>
              {W.restore}
            </Button>
          ) : (
            draft.status !== 'published' && (
              <Button variant="ghost" onClick={() => save({ status: 'dismissed' }, W.dismissed)} disabled={busy}>
                {E.dismiss}
              </Button>
            )
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {lockTip(
            <Button
            icon={copied ? Check : Copy}
            disabled={locked}
            onClick={() => {
              void copyText(body);
              setNotice(copy.app.toasts.copied);
            }}
          >
              {copied ? E.copied : E.copy}
            </Button>,
          )}
          {lockTip(
            <Button
              icon={downloaded ? Check : Download}
              disabled={locked}
              title={fmt(E.download, { file: file.filename })}
              onClick={() => {
                downloadText(file);
                setDownloaded(true);
                setNotice(fmt(copy.app.toasts.downloaded, { file: file.filename }));
              }}
            >
              {copy.common.download}
            </Button>,
          )}
          {dirty && (
            // Saving edits to an approved draft sends it back to Draft: what ships is always what a person approved.
            <Button onClick={() => save(wasApproved ? { status: 'draft' } : {}, copy.app.toasts.saved)} disabled={busy}>
              {E.save}
            </Button>
          )}
          {needsApproval && (
            <Button variant="primary" icon={Check} onClick={() => save({ status: 'approved' }, E.approved)} loading={busy}>
              {E.approve}
            </Button>
          )}
          {draft.status === 'approved' && !dirty && (
            <Tooltip content={E.markPublishedHelp}>
              <span className="inline-flex">
                <Button variant="primary" icon={FileCheck2} onClick={() => save({ status: 'published' }, W.published)} loading={busy}>
                  {E.markPublished}
                </Button>
              </span>
            </Tooltip>
          )}
        </div>
      </div>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        size="sm"
        title={D.deleteDialog.title}
        description={D.deleteDialog.body}
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>{D.deleteDialog.cancel}</Button>
            <Button
              variant="danger"
              icon={Trash2}
              loading={del.isPending}
              onClick={() =>
                del.mutate(draft.id, {
                  onSuccess: () => {
                    setConfirmDelete(false);
                    onDirtyChange(false);
                    toast.success(fmt(copy.app.toasts.deleted, { name: draft.title }));
                    onDeleted();
                  },
                  onError: (e) => toast.error(fmt(copy.app.errors.deleteFailed, { name: draft.title }), errorMessage(e)),
                })
              }
            >
              {D.deleteDialog.confirm}
            </Button>
          </>
        }
      />
    </div>
  );
}
