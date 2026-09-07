// Copyright 2018-2026 contributors to the OpenLineage project
// SPDX-License-Identifier: Apache-2.0
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const [root, mode, jobId, openLineageRepo] = process.argv.slice(2);
assert.ok(root && mode && jobId && openLineageRepo,
  'Usage: node verify-http.cjs <evidence directory> <case> <Flink job ID> <OpenLineage repository>');
assert.ok(['direct', 'restored', 'application', 'incomplete', 'legacy', 'mixed', 'mixed-restored', 'partial-table', 'cancel', 'fail'].includes(mode), 'Unknown case');
const verify = require(path.resolve(openLineageRepo, 'integration/flink/flink2/src/test/scripts/sql-client-lineage/verify.cjs'));
const all = fs.readFileSync(path.join(root, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const events = all.filter(e => e.run.facets.flink_job.jobId === jobId);
assert.equal(events.filter(e => e.eventType === 'START').length, 1, 'One START for the actual remote job ID');
fs.writeFileSync(path.join(root, mode, 'events.jsonl'), events.map(e => JSON.stringify(e)).join('\n') + '\n');
if (mode === 'cancel' || mode === 'fail') {
  verify.terminal(path.join(root, mode), mode === 'cancel' ? 'ABORT' : 'FAIL');
  console.log('PASS: ' + mode + ' lifecycle and lineage status for remote job ' + jobId);
  process.exit(0);
}
if (mode === 'incomplete' || mode === 'legacy') {
  verify.incomplete(path.join(root, mode), mode === 'legacy');
  console.log('PASS: ' + mode + ' lineage with successful remote job ' + jobId);
  process.exit(0);
}
if (mode === 'mixed' || mode === 'mixed-restored' || mode === 'partial-table') {
  const fields = verify.mixed(path.join(root, mode), mode === 'partial-table');
  const baseline = path.join(root, 'mixed-fields.json');
  if (mode === 'mixed') fs.writeFileSync(baseline, JSON.stringify(fields));
  else if (mode === 'mixed-restored') assert.deepEqual(fields, JSON.parse(fs.readFileSync(baseline)), 'Mixed per-sink lineage matches direct submission');
  console.log('PASS: ' + mode + ' data and per-sink lineage for remote job ' + jobId);
  process.exit(0);
}
const fields = verify(path.join(root, mode));
const baseline = path.join(root, 'direct-fields.json');
if (mode === 'direct') fs.writeFileSync(baseline, JSON.stringify(fields));
else assert.deepEqual(fields, JSON.parse(fs.readFileSync(baseline)), 'Exact field lineage matches direct submission');
console.log('PASS: ' + mode + ' real results and HTTP lineage for remote job ' + jobId);
