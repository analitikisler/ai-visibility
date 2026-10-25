import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router';
import { copy } from '@/content/copy';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * Asks before unsaved edits are lost: in-app navigation (links, browser Back) shows the "Discard changes?"
 * dialog, and a reload or tab close gets the browser's own prompt. Render it once in a form page:
 * `<UnsavedChangesGuard when={dirty} />`. Query-string-only changes (filters, tabs) never trigger it.
 * Pass a function when a save navigates away right after it succeeds (`when={() => dirty && !saved.current}`):
 * it's read at navigation time, so the redirect isn't blocked by a render that hasn't happened yet.
 */
export function UnsavedChangesGuard({ when }: { when: boolean | (() => boolean) }) {
  const whenRef = useRef(when);
  whenRef.current = when;
  const active = () => (typeof whenRef.current === 'function' ? whenRef.current() : whenRef.current);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => active() && currentLocation.pathname !== nextLocation.pathname);
  const armed = typeof when === 'function' ? when() : when;

  useEffect(() => {
    if (!armed) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [armed]);

  const U = copy.common.unsaved;
  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      onClose={() => blocker.reset?.()}
      onConfirm={() => blocker.proceed?.()}
      title={U.title}
      body={U.body}
      confirmLabel={U.confirm}
      cancelLabel={U.cancel}
    />
  );
}
