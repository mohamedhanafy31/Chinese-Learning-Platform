'use client';

import { RouteError } from '@/components/ui/route-error';

export default function GroupError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  return <RouteError error={error} reset={reset} />;
}
