import { useEffect } from 'react';
import { Compass } from 'lucide-react';
import { ButtonLink, EmptyState } from '@/components/ui';
import { copy, fmt } from '@/content/copy';

/** 404 for unknown routes (inside and outside the app shell). */
export default function NotFoundPage() {
  const nf = copy.app.errors.notFound;
  useEffect(() => {
    document.title = fmt(copy.app.pageTitleShort, { page: nf.title });
  }, [nf.title]);
  return (
    <div className="flex min-h-[60dvh] items-center justify-center">
      <EmptyState
        size="lg"
        icon={Compass}
        title={nf.title}
        body={nf.body}
        action={
          <ButtonLink to="/app" variant="primary">
            {nf.cta}
          </ButtonLink>
        }
      />
    </div>
  );
}
