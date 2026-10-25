// "Draft with agent": POST a draft request, open the drawer on a skeleton right away, then on the result.
import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { DraftKind, DraftRequest } from '@shared/types';
import { useToast } from '@/components/ui';
import { copy } from '@/content/copy';
import { errorMessage, qk, useCreateDraft } from '@/lib/api';
import type { DraftDrawerProps } from './DraftDrawer';

export interface DraftAgent {
  /** Ask the agent for a draft. `key` identifies the button that asked (for its spinner). */
  draft: (req: DraftRequest, key?: string) => void;
  /** Open an existing draft. */
  open: (draftId: string) => void;
  /** Key of the request in flight, or null. */
  pendingKey: string | null;
  /** Spread onto `<DraftDrawer />`. */
  drawerProps: DraftDrawerProps;
}

export function useDraftAgent(projectId: string): DraftAgent {
  const qc = useQueryClient();
  const toast = useToast();
  const create = useCreateDraft(projectId);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ key: string; kind: DraftKind } | null>(null);
  // Closing the drawer while the agent writes means "don't pop it open when done".
  const wanted = useRef(0);

  const draft = useCallback(
    (req: DraftRequest, key: string = req.kind) => {
      const ticket = ++wanted.current;
      setOpenId(null);
      setPending({ key, kind: req.kind });
      create.mutate(req, {
        onSuccess: (d) => {
          // A draft for a recommendation moves it to "In progress" on the server.
          if (req.params?.recKey) void qc.invalidateQueries({ queryKey: qk.recommendations(projectId) });
          // The drawer opening is the feedback; toast only when the person closed it meanwhile.
          if (wanted.current === ticket) setOpenId(d.id);
          else toast.success(copy.recommendations.generated);
        },
        onError: (e) => toast.error(copy.recommendations.generateFailed, errorMessage(e)),
        onSettled: () => setPending((p) => (wanted.current === ticket ? null : p)),
      });
    },
    [create, projectId, qc, toast],
  );

  const open = useCallback((id: string) => {
    wanted.current++;
    setPending(null);
    setOpenId(id);
  }, []);

  const onClose = useCallback(() => {
    wanted.current++;
    setPending(null);
    setOpenId(null);
  }, []);

  return {
    draft,
    open,
    pendingKey: pending?.key ?? null,
    drawerProps: { projectId, draftId: openId, pendingKind: pending && !openId ? pending.kind : null, onClose },
  };
}
