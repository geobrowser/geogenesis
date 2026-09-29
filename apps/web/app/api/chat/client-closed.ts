export const CLIENT_CLOSED_REQUEST = 499;

export function clientClosedResponse(): Response {
  return new Response(null, { status: CLIENT_CLOSED_REQUEST });
}
