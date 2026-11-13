import { NextIntlClientProvider } from 'next-intl';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import messages from '../../../messages/en.json';
import { EmbedTokenDiagnostics } from './embed-token-diagnostics';

describe('EmbedTokenDiagnostics', () => {
  afterEach(cleanup);
  it.each(['enforced', 'unknown', 'no-video', 'not-configured'] as const)(
    'renders the %s status as explanatory text',
    (status) => {
      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <EmbedTokenDiagnostics status={status} />
        </NextIntlClientProvider>,
      );
      expect(screen.getByTestId('diagnostics-embed-status')).toBeVisible();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('shows a warning and Bunny Security guidance when authentication is off', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EmbedTokenDiagnostics status="not-enforced" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enable “Embed View Token Authentication” in the Bunny library Security settings.',
    );
    expect(screen.getByTestId('diagnostics-embed-warning')).toBeVisible();
  });
});
