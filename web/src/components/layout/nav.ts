// Sidebar navigation model, following `copy.nav.sections` (labels and grouping).
import {
  Bot,
  Link2,
  ListChecks,
  MessageSquareText,
  MessagesSquare,
  MousePointerClick,
  Newspaper,
  Plug,
  Radar,
  ScanSearch,
  Settings,
  Settings2,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { copy } from '@/content/copy';

export type NavKey = keyof typeof copy.nav.items;

interface NavTarget {
  icon: LucideIcon;
  /** Path relative to the project (`overview`) or absolute (`/app/settings`). */
  path: string;
  /** Global filters (`?days&engine`) carry over when following this link. */
  keepFilters: boolean;
}

const TARGETS: Record<NavKey, NavTarget> = {
  overview: { icon: Radar, path: 'overview', keepFilters: true },
  prompts: { icon: MessageSquareText, path: 'prompts', keepFilters: true },
  competitors: { icon: Users, path: 'competitors', keepFilters: true },
  sources: { icon: Link2, path: 'sources', keepFilters: true },
  responses: { icon: MessagesSquare, path: 'responses', keepFilters: true },
  diagnose: { icon: ScanSearch, path: 'diagnose', keepFilters: true },
  actions: { icon: ListChecks, path: 'actions', keepFilters: false },
  reports: { icon: Newspaper, path: 'reports', keepFilters: false },
  crawlers: { icon: Bot, path: 'crawlers', keepFilters: true },
  traffic: { icon: MousePointerClick, path: 'traffic', keepFilters: true },
  readiness: { icon: ShieldCheck, path: 'readiness', keepFilters: false },
  integrations: { icon: Plug, path: 'integrations', keepFilters: false },
  projectSettings: { icon: Settings2, path: 'settings', keepFilters: false },
  workspaceSettings: { icon: Settings, path: '/app/settings', keepFilters: false },
};

export interface NavItem extends NavTarget {
  key: NavKey;
  label: string;
}
export interface NavSection {
  group: string;
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = copy.nav.sections.map((s) => ({
  group: s.group,
  label: copy.nav.groups[s.group as keyof typeof copy.nav.groups],
  items: s.items.map((key) => ({ key: key as NavKey, label: copy.nav.items[key as NavKey], ...TARGETS[key as NavKey] })),
}));

/** Resolve a nav item to a URL for the given project. */
export function navHref(item: NavItem, projectId: string, filterSearch: string): string {
  const base = item.path.startsWith('/') ? item.path : `/app/p/${projectId}/${item.path}`;
  return item.keepFilters ? `${base}${filterSearch}` : base;
}
