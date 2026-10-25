// Routes (docs/ARCHITECTURE.md "Web routes"). Every page is lazy-loaded; add new ones with `page()`.
import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from 'react-router';
import { AppLayout, ProjectGate, type RouteHandle } from '@/components/layout';
import { Spinner } from '@/components/ui';
import NotFoundPage from './pages/NotFound';
import RouteError from './pages/RouteError';

/** Lazy route props for a page module with a default export. */
const page = (load: () => Promise<{ default: ComponentType }>) => ({
  lazy: async () => ({ Component: (await load()).default }),
});

/** Shows the global FilterBar (period + engine) in the top bar. */
const withFilters: RouteHandle = { filters: true };
const periodOnly: RouteHandle = { filters: { engine: false } };

const routes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    hydrateFallbackElement: (
      <div className="flex min-h-dvh items-center justify-center bg-bg text-text-subtle">
        <Spinner size={20} label="Loading" />
      </div>
    ),
    children: [
      { path: '/', ...page(() => import('./pages/Landing')) },
      {
        path: '/app',
        element: <AppLayout />,
        children: [
          {
            errorElement: <RouteError inShell />,
            children: [
              { index: true, ...page(() => import('./pages/Projects')) },
              { path: 'new', ...page(() => import('./pages/NewProject')) },
              { path: 'settings', ...page(() => import('./pages/WorkspaceSettings')) },
              {
                path: 'p/:projectId',
                element: <ProjectGate />,
                children: [
                  { index: true, element: <Navigate to="overview" replace /> },
                  { path: 'overview', handle: withFilters, ...page(() => import('./pages/project/Overview')) },
                  { path: 'prompts', handle: withFilters, ...page(() => import('./pages/project/Prompts')) },
                  { path: 'competitors', handle: withFilters, ...page(() => import('./pages/project/Competitors')) },
                  { path: 'sources', handle: withFilters, ...page(() => import('./pages/project/Sources')) },
                  { path: 'responses', handle: withFilters, ...page(() => import('./pages/project/Responses')) },
                  { path: 'diagnose', handle: periodOnly, ...page(() => import('./pages/project/Diagnose')) },
                  { path: 'actions', ...page(() => import('./pages/project/Actions')) },
                  { path: 'crawlers', handle: periodOnly, ...page(() => import('./pages/project/Crawlers')) },
                  { path: 'traffic', handle: periodOnly, ...page(() => import('./pages/project/Traffic')) },
                  { path: 'readiness', ...page(() => import('./pages/project/Readiness')) },
                  { path: 'reports', ...page(() => import('./pages/project/Reports')) },
                  { path: 'integrations', ...page(() => import('./pages/project/Integrations')) },
                  { path: 'settings', ...page(() => import('./pages/project/ProjectSettings')) },
                  { path: '*', Component: NotFoundPage },
                ],
              },
              { path: '*', Component: NotFoundPage },
            ],
          },
        ],
      },
      {
        path: '*',
        element: (
          <div className="min-h-dvh bg-bg px-4">
            <NotFoundPage />
          </div>
        ),
      },
    ],
  },
];

const router = createBrowserRouter(routes);

export function App() {
  return <RouterProvider router={router} />;
}
