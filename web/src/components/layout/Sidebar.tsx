import { Link, NavLink, useNavigate } from 'react-router';
import { ChevronsUpDown, FolderKanban, LayoutGrid, Plus, Settings } from 'lucide-react';
import { Logo } from '@/components/art';
import { Badge, Menu, Skeleton } from '@/components/ui';
import { copy } from '@/content/copy';
import { useProjects } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useFilterSearch } from '@/lib/filters';
import { NAV_SECTIONS, navHref } from './nav';
import { useProjectContext } from './ProjectContext';

const itemCls = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex h-8 items-center gap-2.5 rounded-md px-2 text-sm font-medium transition-colors duration-160',
    isActive ? 'bg-primary-soft text-accent-ink' : 'text-text-muted hover:bg-surface-2 hover:text-text',
  );

/** Project switcher: current project name + domain, menu of all projects. */
function ProjectSwitcher() {
  const ctx = useProjectContext();
  const navigate = useNavigate();
  const projects = useProjects();
  const current = ctx?.project;
  const initial = (current?.name ?? 'O').slice(0, 1).toUpperCase();
  return (
    <Menu
      label={copy.nav.project.switch}
      className="w-[216px]"
      items={[
        { heading: copy.pages.projects.title },
        ...(projects.data ?? []).map((p) => ({
          key: p.id,
          label: p.name,
          hint: p.isDemo ? copy.app.badges.demo : undefined,
          selected: p.id === ctx?.projectId,
          onSelect: () => navigate(`/app/p/${p.id}/overview`),
        })),
      ]}
      footer={(close) => (
        <div className="flex flex-col">
          <Link to="/app" onClick={close} className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-text hover:bg-surface-2">
            <LayoutGrid size={16} strokeWidth={1.75} aria-hidden className="text-text-muted" />
            {copy.nav.project.all}
          </Link>
          <Link to="/app/new" onClick={close} className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-text hover:bg-surface-2">
            <Plus size={16} strokeWidth={1.75} aria-hidden className="text-text-muted" />
            {copy.nav.project.new}
          </Link>
        </div>
      )}
      trigger={(props) => (
        <button
          {...props}
          type="button"
          className="flex w-full items-center gap-2.5 rounded-md border border-border bg-surface px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
        >
          {current ? (
            <>
              <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-soft font-display text-sm font-semibold text-accent-ink">
                {initial}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-semibold text-text">{current.name}</span>
                  {current.isDemo && <Badge tone="neutral">{copy.app.badges.demo}</Badge>}
                </span>
                <span className="block truncate text-xs text-text-subtle">{current.domain}</span>
              </span>
            </>
          ) : ctx?.isLoading ? (
            <span className="flex flex-1 items-center gap-2.5">
              <Skeleton className="size-7" />
              <Skeleton className="h-3 w-24" />
            </span>
          ) : (
            <span className="flex min-w-0 flex-1 items-center gap-2.5">
              <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-2 text-text-muted">
                <FolderKanban size={16} strokeWidth={1.75} />
              </span>
              <span className="truncate text-[13px] font-medium text-text-muted">{copy.nav.project.switch}</span>
            </span>
          )}
          <ChevronsUpDown size={14} strokeWidth={1.75} aria-hidden className="shrink-0 text-text-subtle" />
        </button>
      )}
    />
  );
}

/** Left navigation (232px). Rendered inline on desktop and inside a Drawer below 1024px. */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const ctx = useProjectContext();
  const filterSearch = useFilterSearch();
  // Project nav only for a project that exists (or is still loading).
  const projectNav = ctx && (ctx.project || ctx.isLoading) ? ctx : null;
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center px-4">
        <Link to="/app" onClick={onNavigate} className="rounded-sm text-text" aria-label="ai visibility projects">
          <Logo size={22} title={null} />
        </Link>
      </div>
      <div className="px-3 pb-3">
        <ProjectSwitcher />
      </div>
      <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {projectNav ? (
          NAV_SECTIONS.map((section) => (
            <div key={section.group} className="mt-3 first:mt-1">
              <div className="eyebrow px-2 pb-1">{section.label}</div>
              <ul className="flex flex-col gap-px">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.key}>
                      <NavLink to={navHref(item, projectNav.projectId, filterSearch)} end={item.path.startsWith('/')} onClick={onNavigate} className={itemCls}>
                        <Icon size={16} strokeWidth={1.75} aria-hidden />
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        ) : (
          <ul className="mt-1 flex flex-col gap-px">
            <li>
              <NavLink to="/app" end onClick={onNavigate} className={itemCls}>
                <LayoutGrid size={16} strokeWidth={1.75} aria-hidden />
                {copy.pages.projects.title}
              </NavLink>
            </li>
            <li>
              <NavLink to="/app/new" onClick={onNavigate} className={itemCls}>
                <Plus size={16} strokeWidth={1.75} aria-hidden />
                {copy.nav.project.new}
              </NavLink>
            </li>
            <li>
              <NavLink to="/app/settings" onClick={onNavigate} className={itemCls}>
                <Settings size={16} strokeWidth={1.75} aria-hidden />
                {copy.nav.items.workspaceSettings}
              </NavLink>
            </li>
          </ul>
        )}
      </nav>
    </div>
  );
}
