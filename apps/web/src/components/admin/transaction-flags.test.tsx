import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TransactionFlags } from './transaction-flags';

describe('TransactionFlags', () => {
  afterEach(cleanup);

  it('renders every boolean as icon plus explicit text', () => {
    render(
      <TransactionFlags
        transaction={{
          success: true,
          pending: false,
          isRefund: true,
          isVoided: false,
        }}
        labels={{
          success: 'Success',
          pending: 'Pending',
          refund: 'Refund',
          voided: 'Voided',
          yes: 'Yes',
          no: 'No',
        }}
      />,
    );
    expect(screen.getByText('Success: Yes')).toBeVisible();
    expect(screen.getByText('Pending: No')).toBeVisible();
    expect(screen.getByText('Refund: Yes')).toBeVisible();
    expect(screen.getByText('Voided: No')).toBeVisible();
    expect(document.querySelectorAll('svg')).toHaveLength(4);
  });
});
