import { Fragment, useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { copy, fmt } from '@/content/copy';
import { cn } from '@/lib/cn';
import { useProjectContext } from '../layout/ProjectContext';

export interface Crumb {
  label: ReactNode;
  to?: string;
}

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned actions (one primary at most). */
  actions?: ReactNode;
  breadcrumbs?: Crumb[];
  /** Inline after the title (Demo badge, Simulated badge). */
  titleAddon?: ReactNode;
  /**
   * `document.title`. Defaults to "{title} · {project} · ai visibility" when `title` is a string;
   * pass a string to override or `false` to leave it alone.
   */
  documentTitle?: string | false;
  className?: string;
}

/** Page H1 (28/34 display face at 570), muted subtitle, actions slot, optional breadcrumbs. */
export function PageHeader({ title, subtitle, actions, breadcrumbs, titleAddon, documentTitle, className }: PageHeaderProps) {
  const projectName = useProjectContext()?.project?.name;
  const docTitle =
    documentTitle === false
      ? null
      : (documentTitle ??
        (typeof title === 'string'
          ? projectName
            ? fmt(copy.app.pageTitle, { page: title, project: projectName })
            : fmt(copy.app.pageTitleShort, { page: title })
          : null));
  useEffect(() => {
    if (docTitle) document.title = docTitle;
  }, [docTitle]);
  return (
    <header className={cn('mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-2">
            <ol className="flex flex-wrap items-center gap-1 text-xs text-text-subtle">
              {breadcrumbs.map((c, i) => (
                <Fragment key={i}>
                  <li>{c.to ? <Link to={c.to} className="hover:text-text">{c.label}</Link> : <span aria-current="page">{c.label}</span>}</li>
                  {i < breadcrumbs.length - 1 && (
                    <li aria-hidden>
                      <ChevronRight size={12} strokeWidth={1.75} />
                    </li>
                  )}
                </Fragment>
              ))}
            </ol>
          </nav>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display font-heading text-2xl leading-8 tracking-[-0.012em] text-text-strong sm:text-[28px] sm:leading-[34px]">{title}</h1>
          {titleAddon}
        </div>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
