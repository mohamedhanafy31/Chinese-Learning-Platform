export function GET(): Response {
  return new Response('', {
    status: 200,
    headers: { 'content-type': 'image/x-icon' },
  });
}
