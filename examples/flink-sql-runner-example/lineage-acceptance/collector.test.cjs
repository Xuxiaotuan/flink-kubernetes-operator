// Copyright 2018-2026 contributors to the OpenLineage project
// SPDX-License-Identifier: Apache-2.0
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
test('acknowledges only after persisting valid JSON and rejects malformed input', async () => {
  assert.ok(fs.existsSync(path.join(__dirname, 'collector.cjs')), 'collector implementation missing');
  const {createCollector} = require('./collector.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ol-http-test-'));
  const file = path.join(root, 'events.jsonl');
  const server = createCollector(file);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/v1/lineage`;
    const event = {eventType: 'START', run: {runId: 'test'}};
    assert.equal((await fetch(url, {method:'POST', body:JSON.stringify(event)})).status, 200);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), event);
    assert.equal((await fetch(url, {method:'POST', body:'invalid'})).status, 400);
    assert.equal(fs.readFileSync(file, 'utf8').trim().split('\n').length, 1);
    assert.equal((await fetch(url)).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
