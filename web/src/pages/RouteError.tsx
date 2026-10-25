import { isRouteErrorResponse, useRouteError } from 'react-router';
import { RotateCcw } from 'lucide-react';
import { ErrorState as ErrorArt } from '@/components/art';
import { Button, ButtonLink } from '@/components/ui';
import { copy, fmt } from '@/content/copy';
import { cn } from '@/lib/cn';
import NotFoundPage from './NotFound';

/** Router error boundary: 404s, failed lazy chunks (stale deploy) and render errors. `inShell` keeps the app chrome. */
export default function RouteError({ inShell }: { inShell?: boolean }) {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <div className={inShell ? undefined : 'min-h-dvh bg-bg px-4'}>
        <NotFoundPage />
      </div>
    );
  }
  const detail = error instanceof Error ? error.message : isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : String(error);
  const g = copy.app.errors.generic;
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center gap-4 px-6 text-center', inShell ? 'min-h-[60dvh]' : 'min-h-dvh bg-bg')}>
      <ErrorArt width={160} />
      <div className="max-w-md">
        <h1 className="text-xl text-text-strong">{g.title}</h1>
        <p className="mt-1 text-sm text-text-muted">{g.body}</p>
        <p className="mt-3 break-words font-mono text-xs text-text-subtle">{fmt(copy.app.errors.detail, { detail })}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="primary" icon={RotateCcw} onClick={() => window.location.reload()}>
          {g.cta}
        </Button>
        <ButtonLink to="/app">{copy.app.errors.notFound.cta}</ButtonLink>
      </div>
    </div>
  );
}
