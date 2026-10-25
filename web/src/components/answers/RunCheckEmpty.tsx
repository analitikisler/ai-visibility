import type { ReactNode } from 'react';
import { Play } from 'lucide-react';
import { EmptyNoData } from '@/components/art';
import { useProject } from '@/components/layout/ProjectContext';
import { RunProgress } from '@/components/layout/RunButton';
import { Button, Card, useToast } from '@/components/ui';
import { copy } from '@/content/copy';
import { errorMessage, useActiveRun, useStartRun } from '@/lib/api';

export interface RunCheckEmptyProps {
  title: string;
  body: string;
  cta: string;
  illustration?: ReactNode;
}

/** "No answers yet" empty state whose one action starts a check, then shows its progress in place. */
export function RunCheckEmpty({ title, body, cta, illustration }: RunCheckEmptyProps) {
  const { projectId, project } = useProject();
  const start = useStartRun(projectId);
  const { run } = useActiveRun(projectId);
  const toast = useToast();
  const busy = !!run || start.isPending;
  const rc = copy.app.runCheck;
  const onRun = () => {
    if (project.promptCount === 0) return void toast.toast({ tone: 'info', title: rc.noPrompts });
    if (project.engines.length === 0) return void toast.toast({ tone: 'info', title: rc.noEngines });
    start.mutate({}, { onError: (e) => toast.error(rc.failed, errorMessage(e)) });
  };
  return (
    <Card>
      <div className="flex flex-col items-center px-6 py-14 text-center">
        {illustration ?? <EmptyNoData width={168} />}
        <h2 className="mt-6 text-xl font-semibold text-text">{title}</h2>
        <p className="mt-1 max-w-md text-sm text-text-muted">{body}</p>
        {busy ? (
          <RunProgress run={run} className="mt-6" />
        ) : (
          <Button variant="primary" size="lg" icon={Play} className="mt-6" onClick={onRun}>
            {cta}
          </Button>
        )}
      </div>
    </Card>
  );
}
