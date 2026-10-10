import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { kvSet } from '../src/core/db';
import { cachedTrivia, limits, refreshTrivia } from '../src/data/trivia';

limits.rateLimitMs = 0;

const q = (category: string, question: string) => ({
  type: 'multiple',
  difficulty: 'easy',
  category: encodeURIComponent(category),
  question: encodeURIComponent(question),
  correct_answer: 'A',
  incorrect_answers: ['B', 'C', 'D'],
});

let requests: URL[] = [];
function mockApi(respond: (url: URL) => unknown) {
  requests = [];
  vi.stubGlobal('fetch', async (input: string) => {
    const url = new URL(input);
    requests.push(url);
    const body = url.pathname.endsWith('api_token.php') ? { response_code: 0, token: 'tok' } : respond(url);
    return new Response(JSON.stringify(body), { status: 200 });
  });
}

beforeEach(async () => {
  await kvSet('cache:opentdb', undefined);
});

describe('Open Trivia DB streams', () => {
  it('fetches Science: Computers as its own stream and files it under Computer Science', async () => {
    mockApi((url) =>
      url.searchParams.get('category') === '18'
        ? { response_code: 0, results: [q('Science: Computers', 'What does CPU stand for?')] }
        : { response_code: 0, results: [q('Sports', 'Who?')] },
    );
    const questions = await refreshTrivia(['mixed', 'computers']);
    const api = requests.filter((u) => u.pathname.endsWith('api.php'));
    expect(api.map((u) => u.searchParams.get('category'))).toEqual([null, '18']);
    expect(api.every((u) => u.searchParams.get('token') === 'tok')).toBe(true);
    const cpu = questions.find((x) => x.question.startsWith('What does CPU'))!;
    expect(cpu).toMatchObject({ category: 'computing', topic: 'cs-trivia' });
    expect(questions.find((x) => x.question === 'Who?')).toMatchObject({ category: 'sports' });
    expect(questions.find((x) => x.question === 'Who?')).not.toHaveProperty('topic');
  });

  it('falls back to smaller batches, then marks only that stream exhausted', async () => {
    mockApi((url) =>
      url.searchParams.get('category') === '18' ? { response_code: 1, results: [] } : { response_code: 0, results: [] },
    );
    await refreshTrivia(['computers']);
    const amounts = requests.filter((u) => u.pathname.endsWith('api.php')).map((u) => u.searchParams.get('amount'));
    expect(amounts).toEqual(['50', '20', '10']);
    const cache = await cachedTrivia();
    expect(cache.exhausted).toEqual({ computers: true });

    requests = [];
    await refreshTrivia(['computers', 'mixed']);
    expect(requests.filter((u) => u.pathname.endsWith('api.php')).map((u) => u.searchParams.get('category'))).toEqual([
      null,
    ]);
  });

  it('migrates old caches: boolean exhaustion and re-derived categories', async () => {
    await kvSet('cache:opentdb', {
      token: 't',
      lastFetch: 0,
      exhausted: true,
      questions: [
        {
          id: 'x',
          kind: 'boolean',
          category: 'science',
          sourceCategory: 'Science: Computers',
          difficulty: 'easy',
          question: 'Q',
          correct: 'True',
          incorrect: ['False'],
        },
      ],
    });
    const cache = await cachedTrivia();
    expect(cache.exhausted).toEqual({ mixed: true });
    expect(cache.questions[0]).toMatchObject({ category: 'computing', topic: 'cs-trivia' });
  });
});
