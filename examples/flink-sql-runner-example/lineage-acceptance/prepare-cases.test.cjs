/* Licensed under the Apache License, Version 2.0. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {test} = require('node:test');

function prepare(transform = sql => sql) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lineage-prepare-test-'));
  const openlineage = process.env.OPENLINEAGE_REPO || path.resolve(__dirname, '../../../../OpenLineage');
  for (const name of ['prepare-cases.cjs', 'direct.sql', 'submit.yaml', 'cluster.yaml']) {
    fs.copyFileSync(path.join(__dirname, name), path.join(root, name));
  }
  fs.mkdirSync(path.join(root, 'direct'));
  const inputs = path.join(openlineage, 'integration/flink/flink2/src/test/scripts/sql-client-lineage');
  for (const name of ['orders.csv', 'customers.csv']) {
    fs.copyFileSync(path.join(inputs, name), path.join(root, 'direct', name));
  }
  const paired = path.join(root, 'paired');
  const pairedInputs = path.join(paired, 'integration/flink/flink2/src/test/scripts/sql-client-lineage');
  fs.mkdirSync(pairedInputs, {recursive: true});
  fs.writeFileSync(path.join(pairedInputs, 'mixed.sql'), transform(fs.readFileSync(path.join(inputs, 'mixed.sql'), 'utf8')));
  execFileSync(process.execPath, [path.join(root, 'prepare-cases.cjs'), paired], {stdio: 'pipe'});
  return root;
}

test('partial-table plan contains two supported writers after importing the paired fixture', () => {
  const root = prepare();
  const sql = fs.readFileSync(path.join(root, 'compile-partial-table.sql'), 'utf8');
  const inserts = sql.split('\n').filter(line => line.startsWith('INSERT INTO'));
  assert.deepEqual(inserts, [
    'INSERT INTO Good SELECT `value` + 1 FROM Numbers;',
    'INSERT INTO Unsupported SELECT `value` + 1 FROM OtherNumbers;'
  ]);
});

for (const copies of [0, 2]) {
  test('rejects a paired fixture with ' + copies + ' Unsupported writers', () => {
    assert.throws(() => prepare(sql => sql.replace(/^INSERT INTO Unsupported [^\n]+;$/m,
      writer => Array(copies).fill(writer).join('\n'))), /Expected exactly one Unsupported writer/);
  });
}
