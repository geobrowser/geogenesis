import { HttpResponse, http } from 'msw';

const SUCCESS_SPACE_ID = 'a19c345ab9866679b001d7d2138d88a1';
const FAILURE_SPACE_ID = '2316bbe1c76f463583f23e03b4f1fe46';

const ADDRESS = '0x1111111111111111111111111111111111111111';

function getSpacePayload(id: string) {
  return {
    id,
    type: 'PERSONAL',
    address: ADDRESS,
    membersList: [],
    editorsList: [],
    page: null,
  };
}

export const mockSpaceIds = {
  success: SUCCESS_SPACE_ID,
  failure: FAILURE_SPACE_ID,
} as const;

export const handlers = [
  http.get('/health', () => HttpResponse.json({ ok: true })),

  http.post('/graphql', async ({ request }) => {
    const body = (await request.json()) as {
      query?: string;
      variables?: {
        id?: string;
      };
    };

    const query = body.query ?? '';

    if (!query.includes('query Space(')) {
      return HttpResponse.json({ data: {} });
    }

    const id = body.variables?.id ?? SUCCESS_SPACE_ID;

    if (id === FAILURE_SPACE_ID) {
      return HttpResponse.json({ errors: [{ message: 'Mocked space bootstrap failure' }] }, { status: 500 });
    }

    return HttpResponse.json({
      data: {
        space: getSpacePayload(id),
      },
    });
  }),
];
