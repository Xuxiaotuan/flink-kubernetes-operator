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
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const assert = require('node:assert/strict');
const [flinkRepo, openlineageRepo, flinkJar, adapterJar, output] = process.argv.slice(2);
assert.ok(flinkRepo && openlineageRepo && flinkJar && adapterJar,
  'Usage: node build-provenance.cjs <Flink repo> <OpenLineage repo> <dist Jar> <adapter Jar> [output JSON]');
function capture(repo, jar) {
  const git = args => execFileSync('git', ['-C', repo, ...args], {encoding: 'utf8'}).trim();
  return {
    gitSha: git(['rev-parse', 'HEAD']),
    dirty: git(['status', '--porcelain']).length > 0,
    jarSha256: createHash('sha256').update(fs.readFileSync(jar)).digest('hex')
  };
}
const result = JSON.stringify({capturedAt: new Date().toISOString(),
  flink: capture(flinkRepo, flinkJar), openlineage: capture(openlineageRepo, adapterJar)}, null, 2) + '\n';
if (output) fs.writeFileSync(output, result);
process.stdout.write(result);
