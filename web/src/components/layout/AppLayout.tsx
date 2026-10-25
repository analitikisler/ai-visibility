import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useMatch, useMatches } from 'react-router';
import { FolderX, Menu as MenuIcon, Settings } from 'lucide-react';
import { Drawer, EmptyState, ErrorState, FilterBar, IconButton, Skeleton, ButtonLink } from '@/components/ui';
import { copy, fmt } from '@/content/copy';
import { isNotFound } from '@/lib/api';
import { ProjectProvider, useProjectContext } from './ProjectContext';
import { RunButton } from './RunButton';
import { Sidebar } from './Sidebar';
import { SimulatedBanner } from './SimulatedBanner';
import { ThemeToggle } from './ThemeToggle';

/**
 * Route `handle` read by the shell. Set it on a route to show the global FilterBar:
 * `{ filters: true }` (period + engine) or `{ filters: { engine: false } }` (period only).
 */
export interface RouteHandle {
  filters?: boolean | { range?: boolean; engine?: boolean };
}

function useFilterConfig() {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i--) {
    const h = matches[i]!.handle as RouteHandle | undefined;
    if (h?.filters !== undefined) {
      if (h.filters === false) return null;
      return h.filters === true ? { range: true, engine: true } : { range: h.filters.range ?? true, engine: h.filters.engine ?? true };
    }
  }
  return null;
}

function TopBar({ onOpenNav }: { onOpenNav: () => void }) {
  const ctx = useProjectContext();
  const filters = useFilterConfig();
  const filterBar = filters && ctx?.project && (
    <FilterBar engines={ctx.project.engines} showRange={filters.range} showEngine={filters.engine} />
  );
  return (
    <header data-print="hide" className="sticky top-0 z-30 border-b border-border bg-bg">
      <div className="flex h-14 items-center gap-2 px-4 lg:px-6">
        <IconButton icon={MenuIcon} label={copy.nav.openMenu} onClick={onOpenNav} className="-ml-1.5 lg:hidden" />
        <div className="hidden min-w-0 flex-1 md:block">{filterBar}</div>
        <div className="flex-1 md:hidden" />
        <div className="flex shrink-0 items-center gap-1.5">
          {ctx?.project && <RunButton />}
          <ThemeToggle />
          <Link
            to="/app/settings"
            aria-label={copy.nav.items.workspaceSettings}
            title={copy.nav.items.workspaceSettings}
            className="inline-flex size-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <Settings size={16} strokeWidth={1.75} aria-hidden />
          </Link>
        </div>
      </div>
      {/* Phones/tablets: filters get their own row so both selects stay usable. */}
      {filterBar && <div className="flex gap-2 px-4 pb-2.5 md:hidden [&_[role=group]]:w-full [&_[role=group]>*]:flex-1 [&_select]:w-full">{filterBar}</div>}
    </header>
  );
}

function Shell() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  // Close the mobile drawer whenever the route changes.
  useEffect(() => setNavOpen(false), [location.pathname]);
  return (
    <div className="min-h-dvh bg-bg">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 text-sm font-medium text-text shadow-md focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        {copy.nav.skipToContent}
      </a>
      <Drawer open={navOpen} onClose={() => setNavOpen(false)} side="left" widthClass="max-w-[264px]" bare>
        <Sidebar onNavigate={() => setNavOpen(false)} />
      </Drawer>
      <div className="lg:flex">
        {/* Desktop: the sidebar column stretches with the page, so its ground runs the full height;
            the nav inside sticks to the viewport while the page scrolls. */}
        <aside data-print="hide" className="hidden w-[232px] shrink-0 border-r border-border bg-surface lg:block">
          <div className="sticky top-0 h-dvh">
            <Sidebar />
          </div>
        </aside>
        <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
          <TopBar onOpenNav={() => setNavOpen(true)} />
          <SimulatedBanner />
          <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 outline-none lg:px-6 lg:py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

/** App shell (sidebar + top bar). Provides `ProjectContext` on `/app/p/:projectId/*`. */
export function AppLayout() {
  const match = useMatch('/app/p/:projectId/*');
  const projectId = match?.params.projectId;
  if (!projectId) return <Shell />;
  return (
    <ProjectProvider key={projectId} projectId={projectId}>
      <Shell />
    </ProjectProvider>
  );
}

/** Route element for `/app/p/:projectId`: waits for the project, handles not found / errors. */
export function ProjectGate() {
  const ctx = useProjectContext();
  const missing = !!ctx && !ctx.isLoading && !ctx.project && isNotFound(ctx.error);
  useEffect(() => {
    if (missing) document.title = fmt(copy.app.pageTitleShort, { page: copy.app.errors.projectNotFound.title });
  }, [missing]);
  if (!ctx || ctx.isLoading) {
    return (
      <div className="mx-auto max-w-[1440px] space-y-6" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-lg" />
      </div>
    );
  }
  if (!ctx.project) {
    if (isNotFound(ctx.error)) {
      const nf = copy.app.errors.projectNotFound;
      return (
        <EmptyState
          size="lg"
          icon={FolderX}
          title={nf.title}
          body={nf.body}
          action={
            <ButtonLink to="/app" variant="primary">
              {nf.cta}
            </ButtonLink>
          }
        />
      );
    }
    const g = copy.app.errors.generic;
    return <ErrorState title={g.title} error={ctx.error} onRetry={ctx.refetch} />;
  }
  return <Outlet />;
}
