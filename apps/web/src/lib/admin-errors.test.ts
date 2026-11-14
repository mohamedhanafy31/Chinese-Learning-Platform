import { describe, expect, it } from 'vitest';

import { adminErrorKey, readApiMessage } from './admin-errors';

describe('adminErrorKey', () => {
  it('maps the catalog 409 messages', () => {
    expect(adminErrorKey(409, 'A level with this slug already exists')).toBe(
      'slugTaken',
    );
    expect(
      adminErrorKey(
        409,
        'The slug cannot change once the level has been published',
      ),
    ).toBe('slugLocked');
    expect(adminErrorKey(409, 'level_not_ready: missing lesson')).toBe(
      'levelNotReady',
    );
    expect(adminErrorKey(409, 'lesson_not_ready: missing content')).toBe(
      'lessonNotReady',
    );
    expect(adminErrorKey(409, 'something new')).toBe('conflict');
  });

  it('maps the enrollment failures', () => {
    expect(
      adminErrorKey(409, 'A level that is not published cannot be granted'),
    ).toBe('levelNotGrantable');
    expect(adminErrorKey(400, 'Administrators cannot be enrolled')).toBe(
      'notStudent',
    );
  });

  it('maps upload and generic failures', () => {
    expect(adminErrorKey(413)).toBe('imageTooLarge');
    expect(adminErrorKey(415)).toBe('imageType');
    expect(adminErrorKey(422)).toBe('imageUnprocessable');
    expect(adminErrorKey(400, 'Unknown image')).toBe('unknownImage');
    expect(adminErrorKey(429)).toBe('rateLimited');
    expect(adminErrorKey(0)).toBe('retry');
    expect(adminErrorKey(500)).toBe('retry');
  });
});

describe('readApiMessage', () => {
  it('reads a string message and ignores anything else', async () => {
    expect(
      await readApiMessage(
        Response.json({ message: 'Hello' }, { status: 409 }),
      ),
    ).toBe('Hello');
    expect(await readApiMessage(Response.json({ message: ['x'] }))).toBe('');
    expect(await readApiMessage(new Response('plain'))).toBe('');
    expect(await readApiMessage(undefined)).toBe('');
  });
});
