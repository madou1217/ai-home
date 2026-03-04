const test = require('node:test');
const assert = require('node:assert/strict');
const { __private } = require('../lib/server/codex-adapter');

test('codex adapter converts openai chat payload to codex responses payload', () => {
  const payload = __private.convertOpenAIChatToCodexPayload({
    model: 'gpt-any-model',
    stream: true,
    messages: [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'hello' }
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'lookup',
          description: 'Lookup info',
          parameters: { type: 'object', properties: { q: { type: 'string' } } }
        }
      }
    ]
  });
  assert.equal(payload.model, 'gpt-any-model');
  assert.equal(payload.stream, true);
  assert.equal(Array.isArray(payload.input), true);
  assert.equal(payload.input[0].role, 'developer');
  assert.equal(payload.input[1].role, 'user');
  assert.equal(payload.tools[0].name, 'lookup');
});

test('codex adapter resolves model from request/cache/config without hardcoded aliases', () => {
  assert.equal(__private.resolveCodexModel('direct-model', {}, {}), 'direct-model');
  assert.equal(__private.resolveCodexModel('', {}, {
    modelsCache: { ids: ['cached-model'] }
  }), 'cached-model');
  assert.equal(__private.resolveCodexModel('', { codexModels: 'cfg-model-a,cfg-model-b' }, {
    modelsCache: { ids: [] }
  }), 'cfg-model-a');
  assert.equal(__private.resolveCodexModel('', {}, { modelsCache: { ids: [] } }), '');
});

test('codex adapter parses models list returned by codex upstream', () => {
  const ids = __private.parseCodexModelsResponse({
    models: [
      { slug: 'gpt-5.3-codex', supported_in_api: true, visibility: 'list' },
      { slug: 'gpt-hidden', supported_in_api: true, visibility: 'private' },
      { slug: 'gpt-disabled', supported_in_api: false, visibility: 'list' }
    ]
  });
  assert.deepEqual(ids, ['gpt-5.3-codex']);
});

test('codex adapter fetches upstream models with client_version query', async () => {
  const seen = { url: '', headers: {} };
  const ids = await __private.fetchCodexModelsForAccount({
    options: {
      codexBaseUrl: 'https://chatgpt.com/backend-api/codex',
      proxyUrl: '',
      noProxy: ''
    },
    account: {
      accessToken: 'token',
      accountId: 'acct_1'
    },
    fetchWithTimeout: async (url, init) => {
      seen.url = url;
      seen.headers = init.headers || {};
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          models: [{ slug: 'gpt-5.3-codex', supported_in_api: true, visibility: 'list' }]
        })
      };
    },
    timeoutMs: 1234
  });
  assert.equal(seen.url.includes('client_version='), true);
  assert.equal(seen.headers.version, __private.CODEX_CLIENT_VERSION);
  assert.equal(seen.headers['chatgpt-account-id'], 'acct_1');
  assert.deepEqual(ids, ['gpt-5.3-codex']);
});

test('codex adapter forces stream=true for upstream protocol', () => {
  const payload = __private.convertOpenAIChatToCodexPayload({
    model: 'stream-model',
    stream: false,
    messages: [{ role: 'user', content: 'hello' }]
  });
  assert.equal(payload.stream, true);
});

test('codex adapter converts codex SSE events to openai chunks', () => {
  const sse = [
    'data: {"type":"response.created","response":{"id":"resp_1","created_at":1700000000,"model":"dynamic-codex-model"}}',
    '',
    'data: {"type":"response.output_text.delta","delta":"he"}',
    '',
    'data: {"type":"response.output_text.delta","delta":"llo"}',
    '',
    'data: {"type":"response.completed","response":{"usage":{"input_tokens":2,"output_tokens":3,"total_tokens":5}}}',
    ''
  ].join('\n');
  const chunks = __private.convertCodexSseToOpenAIChunks(sse, 'dynamic-codex-model');
  assert.equal(chunks.length >= 3, true);
  assert.equal(chunks[0].object, 'chat.completion.chunk');
  assert.equal(chunks[chunks.length - 1].choices[0].finish_reason, 'stop');
});

test('codex adapter converts completed codex response to openai completion', () => {
  const completion = __private.convertCodexResponseToOpenAICompletion({
    type: 'response.completed',
    response: {
      id: 'resp_2',
      created_at: 1700000001,
      model: 'dynamic-codex-model',
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'hello world' }]
        }
      ],
      usage: {
        input_tokens: 1,
        output_tokens: 2,
        total_tokens: 3
      }
    }
  }, 'dynamic-codex-model');
  assert.ok(completion);
  assert.equal(completion.object, 'chat.completion');
  assert.equal(completion.choices[0].message.content, 'hello world');
  assert.equal(completion.usage.total_tokens, 3);
});
