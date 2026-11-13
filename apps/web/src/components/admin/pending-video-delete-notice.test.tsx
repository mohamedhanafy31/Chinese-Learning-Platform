import { NextIntlClientProvider } from 'next-intl';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import messages from '../../../messages/en.json';
import { PendingVideoDeleteNotice } from './pending-video-delete-notice';

describe('PendingVideoDeleteNotice', () => {
  afterEach(cleanup);

  it('renders the warning only when pending deletes exist', () => {
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PendingVideoDeleteNotice count={0} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PendingVideoDeleteNotice count={2} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      '2 Bunny video deletions are pending.',
    );
  });
});
