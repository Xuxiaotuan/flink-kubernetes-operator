// Copyright 2018-2026 contributors to the OpenLineage project
// SPDX-License-Identifier: Apache-2.0
const fs = require('node:fs');
const path = require('node:path');
const base = fs.readFileSync(path.join(__dirname, 'direct.sql'), 'utf8');
const job = fs.readFileSync(path.join(__dirname, 'submit.yaml'), 'utf8');
const openlineageRepo = process.argv[2];
const application = fs.readFileSync(path.join(__dirname, 'cluster.yaml'), 'utf8').split('---\n').at(-1)
  .replace('name: lineage-session', 'name: lineage-application')
  .replace('  serviceAccount: flink', "  serviceAccount: flink\n  job:\n    jarURI: local:///evidence/sql-runner.jar\n    entryClass: org.apache.flink.examples.SqlRunner\n    args: [/evidence/application.sql]\n    parallelism: 1\n    upgradeMode: stateless\n    state: running");
fs.writeFileSync(path.join(__dirname, 'application.yaml'), application.replace('sql-runner.jar', 'sql-runner-batch.jar'));
fs.mkdirSync(path.join(__dirname, 'transport-failure'), {recursive:true});
for (const name of ['orders.csv', 'customers.csv']) fs.copyFileSync(path.join(__dirname, 'direct', name), path.join(__dirname, 'transport-failure', name));
fs.writeFileSync(path.join(__dirname, 'transport-failure.sql'), base.replaceAll('/evidence/direct/', '/evidence/transport-failure/').replace('http://lineage-collector:8080', 'http://lineage-collector:65534'));
fs.writeFileSync(path.join(__dirname, 'transport-failure.yaml'), job.replaceAll('lineage-direct', 'lineage-transport-failure').replace('/evidence/direct.sql', '/evidence/transport-failure.sql'));
for (const mode of ['restored', 'incomplete', 'legacy', 'application']) {
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
    incomplete: sql.split('CREATE DATABASE')[0] + "EXECUTE PLAN '/evidence/incomplete/bad-plan.json';\n"
  };
  if (mode === 'legacy') scripts = {
    'compile-legacy': sql.split('EXECUTE STATEMENT SET')[0] + "COMPILE PLAN '/evidence/legacy/plan.json' FOR INSERT INTO Detail SELECT order_id, 'fixed', amount + fee FROM Orders;\n",
    legacy: sql.split('CREATE DATABASE')[0] + "EXECUTE PLAN '/evidence/legacy/bad-plan.json';\n"
  };
  if (mode === 'application') scripts = {application:sql.split('\n').filter(line => !/SET '(execution.target|rest.address|rest.port)'/.test(line)).join('\n')};
  for (const [name, text] of Object.entries(scripts)) {
    fs.writeFileSync(path.join(__dirname, name + '.sql'), text);
    if (name !== 'application') fs.writeFileSync(path.join(__dirname, name + '.yaml'), job.replaceAll('lineage-direct', 'lineage-' + name).replace('/evidence/direct.sql', '/evidence/' + name + '.sql'));
  }
}
if (openlineageRepo) {
  const template = fs.readFileSync(path.join(openlineageRepo,
    'integration/flink/flink2/src/test/scripts/sql-client-lineage/mixed.sql'), 'utf8');
  for (const mode of ['mixed', 'mixed-restored', 'partial-table']) {
    const dir = path.join(__dirname, mode);
    fs.mkdirSync(dir, {recursive:true});
    fs.writeFileSync(path.join(dir,'numbers.csv'), '1\n2\n3\n');
    fs.writeFileSync(path.join(dir,'other-numbers.csv'), '2\n3\n4\n');
    let sql = base.split('CREATE DATABASE')[0]
      + template.slice(template.indexOf('CREATE DATABASE')).replaceAll('__ROOT__', '/evidence/'+mode);
    if (mode === 'partial-table') sql = sql.replace(
      'INSERT INTO Unsupported SELECT `value` FROM Numbers INTERSECT SELECT `value` FROM OtherNumbers;',
      'INSERT INTO Unsupported SELECT `value` + 1 FROM OtherNumbers;');
    const scripts = mode === 'partial-table' ? {
      'compile-partial-table': sql.replace('EXECUTE STATEMENT SET', "COMPILE PLAN '/evidence/partial-table/plan.json' FOR STATEMENT SET"),
      'partial-table': sql.split('CREATE DATABASE')[0] + "EXECUTE PLAN '/evidence/partial-table/bad-plan.json';\n"
    } : mode === 'mixed' ? {mixed: sql} : {
      'compile-mixed': sql.replace('EXECUTE STATEMENT SET', "COMPILE PLAN '/evidence/mixed-restored/plan.json' FOR STATEMENT SET"),
      'mixed-restored': sql.split('CREATE DATABASE')[0] + "EXECUTE PLAN '/evidence/mixed-restored/plan.json';\n"
    };
    for (const [name,text] of Object.entries(scripts)) {
      fs.writeFileSync(path.join(__dirname,name+'.sql'),text);
      fs.writeFileSync(path.join(__dirname,name+'.yaml'),job.replaceAll('lineage-direct','lineage-'+name).replace('/evidence/direct.sql','/evidence/'+name+'.sql'));
    }
  }
}
for (const mode of ['cancel','fail']) {
  fs.mkdirSync(path.join(__dirname,mode),{recursive:true});
  let sql = base.split('CREATE DATABASE')[0];
  if (mode === 'cancel') {
    sql = sql.replace("'execution.runtime-mode' = 'batch'", "'execution.runtime-mode' = 'streaming'")
      .replace("'table.dml-sync' = 'true'", "'table.dml-sync' = 'false'") + "SET 'execution.attached' = 'false';\n";
    sql += "CREATE DATABASE lineage_acceptance;\nUSE lineage_acceptance;\n"
      + "CREATE TABLE Numbers (`value` BIGINT) WITH ('connector'='datagen', 'rows-per-second'='1');\n"
      + "CREATE TABLE `Result` (`value` BIGINT) WITH ('connector'='blackhole');\n"
      + "INSERT INTO `Result` SELECT `value` + 1 FROM Numbers;\n";
  } else {
    fs.writeFileSync(path.join(__dirname,mode,'raw.csv'),'not-a-number\n');
    sql += "SET 'restart-strategy.type' = 'none';\nCREATE DATABASE lineage_acceptance;\nUSE lineage_acceptance;\n"
      + "CREATE TABLE `Raw` (`value` STRING) WITH ('connector'='filesystem', 'path'='file:///evidence/fail/raw.csv', 'format'='csv');\n"
      + "CREATE TABLE `Result` (`value` BIGINT) WITH ('connector'='filesystem', 'path'='file:///evidence/fail/result', 'format'='csv');\n"
      + "INSERT INTO `Result` SELECT CAST(`value` AS BIGINT) FROM `Raw`;\n";
  }
  fs.writeFileSync(path.join(__dirname,mode+'.sql'),sql);
  fs.writeFileSync(path.join(__dirname,mode+'.yaml'),job.replaceAll('lineage-direct','lineage-'+mode).replace('/evidence/direct.sql','/evidence/'+mode+'.sql'));
}
