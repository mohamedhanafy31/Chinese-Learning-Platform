import { Check, CircleDashed, RotateCcw, X } from 'lucide-react';

import type { AdminPaymentTransaction } from '@app/shared';

interface FlagLabels {
  no: string;
  pending: string;
  refund: string;
  success: string;
  voided: string;
  yes: string;
}

function Flag({
  active,
  icon: Icon,
  label,
  no,
  yes,
}: {
  active: boolean;
  icon: typeof Check;
  label: string;
  no: string;
  yes: string;
}): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-deep">
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {label}: {active ? yes : no}
    </span>
  );
}

/** Explicit icon + text flags; transaction state is never conveyed by colour. */
export function TransactionFlags({
  labels,
  transaction,
}: {
  labels: FlagLabels;
  transaction: Pick<
    AdminPaymentTransaction,
    'success' | 'pending' | 'isRefund' | 'isVoided'
  >;
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      <Flag
        active={transaction.success}
        icon={transaction.success ? Check : X}
        label={labels.success}
        yes={labels.yes}
        no={labels.no}
      />
      <Flag
        active={transaction.pending}
        icon={CircleDashed}
        label={labels.pending}
        yes={labels.yes}
        no={labels.no}
      />
      <Flag
        active={transaction.isRefund}
        icon={RotateCcw}
        label={labels.refund}
        yes={labels.yes}
        no={labels.no}
      />
      <Flag
        active={transaction.isVoided}
        icon={X}
        label={labels.voided}
        yes={labels.yes}
        no={labels.no}
      />
    </div>
  );
}
