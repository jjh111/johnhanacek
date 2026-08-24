// Mock OpenAI-compatible endpoint for Phase 4 tool-use QA.
// "feed"/"food" in the user message → streams a fish_feed tool call;
// anything else → streams a plain content answer.
import http from 'node:http';

const PORT = 9911;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function sse(res, events) {
  res.writeHead(200, { ...CORS, 'Content-Type': 'text/event-stream' });
  for (const e of events) res.write(`data: ${JSON.stringify(e)}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}
const delta = (d) => ({ choices: [{ delta: d }] });

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
  if (req.url.endsWith('/models')) {
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'mock-chat-model' }] }));
    return;
  }
  if (req.url.endsWith('/chat/completions')) {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const parsed = JSON.parse(body);
      const userMsg = parsed.messages.filter(m => m.role === 'user').map(m => m.content).join(' ');
      const hasTools = Array.isArray(parsed.tools) && parsed.tools.length > 0;
      if (hasTools && /feed|food/i.test(userMsg)) {
        sse(res, [
          delta({ tool_calls: [{ index: 0, function: { name: 'fish_feed', arguments: '' } }] }),
          delta({ tool_calls: [{ index: 0, function: { arguments: '{}' } }] }),
        ]);
      } else {
        sse(res, [
          delta({ content: 'John is a design engineer ' }),
          delta({ content: 'in San Diego.' }),
        ]);
      }
    });
    return;
  }
  res.writeHead(404, CORS); res.end();
}).listen(PORT, () => console.log('mock llm on :' + PORT));
