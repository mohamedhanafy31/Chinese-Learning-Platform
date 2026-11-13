import { NextIntlClientProvider } from 'next-intl';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import messages from '../../../messages/en.json';
import { RefundedAccessWarning } from './refunded-access-warning';

describe('RefundedAccessWarning', () => {
  afterEach(cleanup);

  it('renders a localized warning and filtered orders link only for positive counts', () => {
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <RefundedAccessWarning locale="en" count={0} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <RefundedAccessWarning locale="en" count={2} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Some refunded orders still have an active enrollment.',
    );
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/en/admin/orders?refundedWithAccess=true',
    );
  });
});
