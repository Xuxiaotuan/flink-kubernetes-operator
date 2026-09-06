// Copyright 2018-2026 contributors to the OpenLineage project
// SPDX-License-Identifier: Apache-2.0
const http = require('node:http');
const fs = require('node:fs');
function createCollector(file) {
  return http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') { res.end('ok'); return; }
    if (req.method !== 'POST' || req.url !== '/api/v1/lineage') { res.writeHead(404).end(); return; }
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 8 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      let event;
      try { event = JSON.parse(body); } catch { res.writeHead(400).end(); return; }
      try {
        fs.appendFileSync(file, JSON.stringify(event) + '\n', {flush: true});
        res.writeHead(200).end();
      } catch { res.writeHead(500).end(); }
    });
  });
}
module.exports = {createCollector};
if (require.main === module) createCollector(process.env.EVENT_FILE || '/evidence/events.jsonl').listen(8080, '0.0.0.0');
