export type AdminErrorKey =
  | 'slugTaken'
  | 'slugLocked'
  | 'levelPublishedDelete'
  | 'levelHasLessons'
  | 'lessonPublishedDelete'
  | 'conflict'
  | 'unknownImage'
  | 'imageTooLarge'
  | 'imageType'
  | 'imageUnprocessable'
  | 'invalidOrder'
  | 'notStudent'
  | 'levelNotGrantable'
  | 'notFound'
  | 'forbidden'
  | 'rateLimited'
  | 'retry';

/**
 * Maps an API failure onto localized copy. 409 messages are matched by the
 * stable phrases the catalog service uses; anything unknown still gets a
 * localized generic conflict message, never raw English from the server.
 */
export function adminErrorKey(status: number, message = ''): AdminErrorKey {
  const text = message.toLowerCase();
  switch (status) {
    case 400:
      if (text.includes('cannot be enrolled')) return 'notStudent';
      return text.includes('unknown image') ? 'unknownImage' : 'invalidOrder';
    case 403:
      return 'forbidden';
    case 404:
      return 'notFound';
    case 409:
      if (text.includes('cannot be granted')) return 'levelNotGrantable';
      if (text.includes('slug already exists')) return 'slugTaken';
      if (text.includes('slug cannot change')) return 'slugLocked';
      if (text.includes('published level cannot be deleted')) {
        return 'levelPublishedDelete';
      }
      if (text.includes('level with lessons')) return 'levelHasLessons';
      if (text.includes('published lesson cannot be deleted')) {
        return 'lessonPublishedDelete';
      }
      return 'conflict';
    case 413:
      return 'imageTooLarge';
    case 415:
      return 'imageType';
    case 422:
      return 'imageUnprocessable';
    case 429:
      return 'rateLimited';
    default:
      return 'retry';
  }
}

/** Reads the `message` of a Nest error body without trusting its shape. */
export async function readApiMessage(
  response: Response | undefined,
): Promise<string> {
  if (!response) return '';
  try {
    const body: unknown = await response.clone().json();
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const { message } = body as { message: unknown };
      return typeof message === 'string' ? message : '';
    }
  } catch {
    // not JSON
  }
  return '';
}
