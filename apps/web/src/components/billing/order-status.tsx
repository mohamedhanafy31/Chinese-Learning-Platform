import {
  Ban,
  CircleCheck,
  CircleDashed,
  Clock3,
  RotateCcw,
} from 'lucide-react';

import { OrderStatus, type OrderStatus as OrderStatusValue } from '@app/shared';

const styles: Record<OrderStatusValue, string> = {
  [OrderStatus.PENDING]: 'border-2 border-cobalt text-cobalt',
  [OrderStatus.PAID]: 'bg-deep text-glaze',
  [OrderStatus.EXPIRED]:
    'border-2 border-dashed border-unfired text-unfired-ink',
  [OrderStatus.CANCELED]:
    'border-2 border-dashed border-unfired text-unfired-ink',
  [OrderStatus.REFUNDED]: 'border-2 border-deep text-deep',
};

const icons = {
  [OrderStatus.PENDING]: Clock3,
  [OrderStatus.PAID]: CircleCheck,
  [OrderStatus.EXPIRED]: CircleDashed,
  [OrderStatus.CANCELED]: Ban,
  [OrderStatus.REFUNDED]: RotateCcw,
};

export function OrderStatusBadge({
  label,
  status,
}: {
  label: string;
  status: OrderStatusValue;
}): React.JSX.Element {
  const Icon = icons[status];
  return (
    <span
      data-order-status={status}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${styles[status]}`}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {label}
    </span>
  );
}
