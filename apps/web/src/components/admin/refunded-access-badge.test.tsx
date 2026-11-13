import { NextIntlClientProvider } from 'next-intl';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import messages from '../../../messages/en.json';
import { RefundedAccessBadge } from './refunded-access-badge';

describe('RefundedAccessBadge', () => {
  afterEach(cleanup);

  it('labels refunded rows whose enrollment is still active', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <RefundedAccessBadge />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('Access still active')).toBeInTheDocument();
  });
});
