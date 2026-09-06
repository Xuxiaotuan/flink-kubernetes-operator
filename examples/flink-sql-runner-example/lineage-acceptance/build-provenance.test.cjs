/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync, spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const test = require('node:test');

test('records build-time revisions, dirty state and actual supplied artifact hashes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lineage-provenance-'));
  const git = args => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8'}).trim();
  git(['init', '-q']);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture']);
  const head = git(['rev-parse', 'HEAD']);
  fs.writeFileSync(path.join(root, 'uncommitted'), 'dirty source');
  fs.writeFileSync(path.join(root, 'flink.jar'), 'supplied flink artifact');
  fs.writeFileSync(path.join(root, 'adapter.jar'), 'supplied adapter artifact');
  const result = spawnSync('node', [path.join(__dirname, 'build-provenance.cjs'), root, root,
    path.join(root, 'flink.jar'), path.join(root, 'adapter.jar')], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  const actual = JSON.parse(result.stdout);
  assert.equal(actual.flink.gitSha, head);
  assert.equal(actual.flink.dirty, true);
  assert.equal(actual.openlineage.gitSha, head);
  assert.equal(actual.openlineage.dirty, true);
  assert.equal(actual.flink.jarSha256, createHash('sha256').update('supplied flink artifact').digest('hex'));
  assert.equal(actual.openlineage.jarSha256, createHash('sha256').update('supplied adapter artifact').digest('hex'));
  assert.ok(!Number.isNaN(Date.parse(actual.capturedAt)));
  git(['add', '.']);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'clean fixture']);
  const clean = JSON.parse(execFileSync('node', [path.join(__dirname, 'build-provenance.cjs'), root, root,
    path.join(root, 'flink.jar'), path.join(root, 'adapter.jar')], {encoding:'utf8'}));
  assert.equal(clean.flink.dirty, false);
  assert.equal(clean.flink.gitSha, git(['rev-parse', 'HEAD']));
  assert.notEqual(clean.flink.gitSha, actual.flink.gitSha);
  assert.equal(actual.flink.gitSha, head, 'Later commits do not rewrite captured provenance');
});
