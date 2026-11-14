// Cloudflare Worker for Jarvis: AI chat (with web search) + memory sync.
// Setup: Workers > Create > paste this. Settings > Variables:
//   ANTHROPIC_API_KEY (secret), APP_TOKEN (secret, any password you choose)
//   KV namespace binding named KV (Workers > KV > Create, then bind it)
export default {
  async fetch(req, env) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,X-Token', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS' };
    const json = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (env.APP_TOKEN && req.headers.get('X-Token') !== env.APP_TOKEN) return json({ error: 'unauthorized' }, 401);
    const url = new URL(req.url);
    if (url.pathname === '/sync') {
      if (req.method === 'GET') return new Response((await env.KV.get('data')) || '{}', { headers: { ...cors, 'Content-Type': 'application/json' } });
      await env.KV.put('data', await req.text());
      return json({ ok: true });
    }
    const { messages = [], memory = [], system = '' } = await req.json();
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.MODEL || 'claude-haiku-5-5',
        max_tokens: 500,
        system: system + (memory.length ? '\nKnown about the user: ' + memory.join('; ') : '') + '\nToday is ' + new Date().toDateString() + '.',
        messages,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      }),
    });
    const d = await r.json();
    const reply = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ').trim() || 'Sorry, I have no answer for that.';
    return json({ reply });
  },
};
