// Copyright 2018-2026 contributors to the OpenLineage project
// SPDX-License-Identifier: Apache-2.0
const fs = require('node:fs');
const path = require('node:path');
const base = fs.readFileSync(path.join(__dirname, 'direct.sql'), 'utf8');
const job = fs.readFileSync(path.join(__dirname, 'submit.yaml'), 'utf8');
const application = fs.readFileSync(path.join(__dirname, 'cluster.yaml'), 'utf8').split('---\n').at(-1)
  .replace('name: lineage-session', 'name: lineage-application')
  .replace('  serviceAccount: flink', "  serviceAccount: flink\n  job:\n    jarURI: local:///evidence/sql-runner.jar\n    entryClass: org.apache.flink.examples.SqlRunner\n    args: [/evidence/application.sql]\n    parallelism: 1\n    upgradeMode: stateless\n    state: running");
fs.writeFileSync(path.join(__dirname, 'application.yaml'), application.replace('sql-runner.jar', 'sql-runner-batch.jar'));
fs.mkdirSync(path.join(__dirname, 'transport-failure'), {recursive:true});
for (const name of ['orders.csv', 'customers.csv']) fs.copyFileSync(path.join(__dirname, 'direct', name), path.join(__dirname, 'transport-failure', name));
fs.writeFileSync(path.join(__dirname, 'transport-failure.sql'), base.replaceAll('/evidence/direct/', '/evidence/transport-failure/').replace('http://lineage-collector:8080', 'http://lineage-collector:65534'));
fs.writeFileSync(path.join(__dirname, 'transport-failure.yaml'), job.replaceAll('lineage-direct', 'lineage-transport-failure').replace('/evidence/direct.sql', '/evidence/transport-failure.sql'));
for (const mode of ['restored', 'incomplete', 'application']) {
  fs.mkdirSync(path.join(__dirname, mode), {recursive:true});
  for (const name of ['orders.csv', 'customers.csv']) fs.copyFileSync(path.join(__dirname, 'direct', name), path.join(__dirname, mode, name));
  const sql = base.replaceAll('/evidence/direct/', `/evidence/${mode}/`);
  let scripts;
  if (mode === 'restored') scripts = {
    compile: sql.replace('EXECUTE STATEMENT SET', "COMPILE PLAN '/evidence/restored/plan.json' FOR STATEMENT SET") + '\nDROP TEMPORARY VIEW Enriched;\n',
    restore: sql.split('CREATE DATABASE')[0] + "EXECUTE PLAN '/evidence/restored/plan.json';\n"
  };
  if (mode === 'incomplete') scripts = {
    'compile-gate': sql.split('EXECUTE STATEMENT SET')[0] + "COMPILE PLAN '/evidence/incomplete/plan.json' FOR INSERT INTO Detail SELECT order_id, 'fixed', amount + fee FROM Orders;\n",
    reject: sql.split('CREATE DATABASE')[0] + "EXECUTE PLAN '/evidence/incomplete/bad-plan.json';\n"
  };
  if (mode === 'application') scripts = {application:sql.split('\n').filter(line => !/SET '(execution.target|rest.address|rest.port)'/.test(line)).join('\n')};
  for (const [name, text] of Object.entries(scripts)) {
    fs.writeFileSync(path.join(__dirname, name + '.sql'), text);
    if (name !== 'application') fs.writeFileSync(path.join(__dirname, name + '.yaml'), job.replaceAll('lineage-direct', 'lineage-' + name).replace('/evidence/direct.sql', '/evidence/' + name + '.sql'));
  }
}
