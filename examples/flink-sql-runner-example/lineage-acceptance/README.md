<!-- Licensed under the Apache License, Version 2.0. -->

# Native Flink lineage: local Kubernetes acceptance

This is an opt-in, single-node ARM64 test fixture for the paired development
branches, not a generic SQL runner or a production deployment. Nothing in this
directory adds lineage extraction to business code or changes Operator controllers.
The batch-only `SqlRunner.java` is a copy of the adjacent upstream example with
runtime mode configured **before** TableEnvironment creation. The original example
is unchanged. Its line-based SQL splitter is sufficient for these fixed fixtures,
not arbitrary SQL scripts.

## Verified independent-observation image (2026-09-07, Asia/Shanghai)

Fresh image: `flink-lineage-local:isolated-20260907`, image ID
`sha256:a32bdb5bf45715385c586fbe9409110071fa46c7ac814dacdfb7fc0ca92de94b`.
Build provenance recorded clean Flink
`fe22cf714bb7ab567fe13cf0ad9abb834e34da42` and OpenLineage
`a85ea412d2eb2afedfaf31c6dca04e9dd2e8a25b` checkouts. The adapter SHA-256 is
`f54fab26c5a23b85887c84ee64bda0e1b33318bffe0d77ee654774bb5ebd7cd1`;
the dist Jar SHA-256 is
`0c253dd99646d3fab7ff14ba9509d49078c4aaa3038645d0b1eba7a450c7e76f`.
The full inventory includes all 14 distribution-lib Jars, not just the dist Jar.

| Case | Actual Flink JobID | Verified result |
| --- | --- | --- |
| Direct | `a4686ac7a56f71ff51bd346a6599e14d` | FINISHED, exact data and lineage |
| Column metadata missing | `7fd315f839d42b72af6eaf705948a76a` | FINISHED, complete table pairs, unavailable columns |
| Legacy metadata missing | `ed7e20d3ff32894a4c0b671a6534df45` | FINISHED, partial tables, unavailable columns |
| Mixed sinks | `a36ea332f87d1c671dbcf7eb800c23c3` | FINISHED, three table pairs, supported sink columns retained |
| Mixed restore | `214d78a519defea60898d535559148a0` | FINISHED, same data and per-sink lineage |
| Complex restore | `2272c66ba8c5fc21e5684193a75cbcde` | FINISHED, exact data and lineage |
| Cancel | `a4b229fc04f1553aa882eec4fb60119a` | CANCELED after tasks RUNNING; one matching ABORT |
| Runtime CAST failure | `36a47d3d3cd136ef002f684fd0b42c82` | FAILED with NumberFormatException; one matching FAIL |
| Application | `25e38effaad378c8666622634d147335` | FINISHED, exact data and lineage |

Evidence is retained in the paired OpenLineage checkout at
`integration/flink/build/isolated-poc-20260907/`, including raw events, CSV, logs,
REST snapshots, exact manifests, provenance and library hashes. An initial cancel
fixture failed SQL parsing before submission because `Result` was unquoted; the
generator now quotes reserved identifiers. That failed attempt remains archived.
No Collector-outage rerun was performed on this image. Performance, full upstream
CI, arbitrary SQL and Marquez consumption are not established by this matrix.

To fit the local cluster, completed `observer-session` and `isolated-session`
Deployments were scaled to zero after evidence capture; PVCs were retained.
The `isolated-application` and Collector were left available. Old `lineage-*`
resources were not modified.

## Historical fixture and observer evidence (2026-09-06)

- Operator: `38a9f197465082a5f5987653b9497d7e5aef384a`, 1.17-SNAPSHOT.
- Historical fixture image: `flink-lineage-local:f55bfca9ca7-754298264-jdk17`.
  Its strict missing-lineage rejection behavior predates the observer changes.
- Observer image: `flink-lineage-local:observer-20260906`, built from modified
  working trees, Flink 2.4-SNAPSHOT and adapter 1.54.0-SNAPSHOT. The historical
  revision labels are not an identity for these modified sources or a later commit.
- OrbStack Kubernetes 1.35.6, linux/arm64, Java 17, 12 GiB VM memory.
- cert-manager 1.20.3; Operator watches only `flink-lineage-test`.

| Check | Recorded result |
| --- | --- |
| Remote Session SQL Client | FINISHED; exact CSV rows and HTTP lineage |
| Fresh-Pod compiled-plan restore | FINISHED; no original DDL; MultipleInput retained; identical lineage |
| Incomplete compiled lineage | FINISHED; exact projection rows; PARTIAL/UNAVAILABLE status, no false column or exact table-edge facet |
| Application FlinkDeployment | FINISHED; identical CSV rows and HTTP lineage |
| SQL Client HTTP endpoint unavailable | FINISHED; timeout and no START; healthy remote JobManager emitted RUNNING/COMPLETE |
| Collector unavailable to both processes | FINISHED; exact rows; zero received events; collector restored |

These observer results are backed by the paired OpenLineage checkout's generated
`integration/flink/build/observer-poc-20260906/evidence/summary.json` and
`verification.txt`, with raw events, rows, manifests and logs retained beside them.
Image ID: `sha256:b4948949265a2514a33fba8f8b3bd75b3cd657516b6633eb265ab38a41e1ca73`.
Dist Jar SHA-256: `1c075f5de17deebbe3ef091e5fc95f1677955c93c921227e529af49ed9beba5c`;
adapter Jar SHA-256: `5d150fb6bcefeb61cc9e8b48820d733421c17ff998df95e3da8dcca220a1c5f8`.
Those hashes identify the tested artifacts, not an unrecorded post-build commit.
The first full-outage attempt was inconclusive due to insufficient memory; the
repeat passed after suspending/scaling down the completed new application.

Positive cases require two input datasets, two outputs and all six output field
dependency sets, including DIRECT/INDIRECT dependencies and namespace alignment.
The HTTP event's `flink_job.jobId` must match the actual remote job ID.
Expected Detail rows: `1,gold,105` and `3,gold,55`; Summary: `gold,160,2`.

**Successful execution does not guarantee event delivery.** The final negative
transport case characterizes that limitation; it is not a successful delivery test.
No optimizer setting is disabled. This fixture does not prove arbitrary connectors,
AdaptiveJoin runtime selection, SQL Gateway, HA, savepoints, multi-node storage,
full upstream CI or reliable delivery. The HTTP collector is an internal test
receiver, not a lineage platform or a complete OpenLineage schema validator.

## Build and prepare

Use Java 17, Maven, Node.js 22+, Docker, Helm and kubectl. Set these shell variables
to your local checkout/artifact locations before running the commands:

- `operator_repo`: this Operator checkout at the pinned commit plus this fixture.
- `openlineage_repo`: the paired OpenLineage checkout.
- `flink_repo`: the paired Flink source checkout used to produce the distribution.
- `flink_dist`: the freshly built modified Flink distribution directory.
- `adapter_jar`: the freshly built paired OpenLineage Jar.
- `lineage_image`: a new image tag for this build; update the generated manifests
  to this tag. The checked-in historical tag is not a current build instruction.

Build both paired projects using the OpenLineage SQL Client acceptance README.
In particular, use `-Djar.forceCreation=true` or a clean Flink build to avoid stale
shaded Planner classes. Then, from the Operator repository:

```sh
mvn -ntp install -pl flink-kubernetes-standalone,flink-kubernetes-operator-api,flink-kubernetes-operator,flink-autoscaler,flink-kubernetes-webhook -am -DskipTests
mvn -ntp -pl flink-kubernetes-operator-api -Dtest=FlinkVersionTest test
fixture="$operator_repo/examples/flink-sql-runner-example/lineage-acceptance"
docker build --platform linux/arm64 -f "$fixture/Operator.Dockerfile" -t flink-operator-local:38a9f1974650 "$operator_repo"
lineage_work=$(mktemp -d)
cp -R "$fixture/." "$lineage_work/"
cp -R "$flink_dist" "$lineage_work/dist"
cp "$adapter_jar" "$lineage_work/openlineage-flink.jar"
mkdir -p "$lineage_work/direct" "$lineage_work/runner-classes"
cp "$openlineage_repo/integration/flink/flink2/src/test/scripts/sql-client-lineage/orders.csv" "$lineage_work/direct/"
cp "$openlineage_repo/integration/flink/flink2/src/test/scripts/sql-client-lineage/customers.csv" "$lineage_work/direct/"
node "$lineage_work/prepare-cases.cjs" "$openlineage_repo"
node --test "$lineage_work/collector.test.cjs" "$lineage_work/build-provenance.test.cjs"
javac -cp "$flink_dist/lib/*" -d "$lineage_work/runner-classes" "$lineage_work/SqlRunner.java"
jar --create --file "$lineage_work/sql-runner-batch.jar" --main-class org.apache.flink.examples.SqlRunner -C "$lineage_work/runner-classes" .
node "$lineage_work/build-provenance.cjs" "$flink_repo" "$openlineage_repo" \
  "$lineage_work/dist/lib/flink-dist-2.4-SNAPSHOT.jar" "$lineage_work/openlineage-flink.jar" \
  "$lineage_work/build-provenance.json"
docker build --platform linux/arm64 -t "$lineage_image" \
  --build-arg FLINK_GIT_SHA="$(node -p 'require(process.argv[1]).flink.gitSha' "$lineage_work/build-provenance.json")" \
  --build-arg FLINK_GIT_DIRTY="$(node -p 'require(process.argv[1]).flink.dirty' "$lineage_work/build-provenance.json")" \
  --build-arg OPENLINEAGE_GIT_SHA="$(node -p 'require(process.argv[1]).openlineage.gitSha' "$lineage_work/build-provenance.json")" \
  --build-arg OPENLINEAGE_GIT_DIRTY="$(node -p 'require(process.argv[1]).openlineage.dirty' "$lineage_work/build-provenance.json")" "$lineage_work"
docker run --rm "$lineage_image" bash -lc '/opt/flink/bin/flink --version'
```

The local-runtime Operator Dockerfile packages the Maven outputs instead of
rebuilding them inside Docker. Keep it paired with this exact source layout.
Capture provenance immediately after the paired builds and before further edits.
It records each build-time HEAD, whether the working tree is dirty, and hashes of
the copied Jars. It is also embedded as `/opt/flink/build-provenance.json`.
Dirty HEAD is a base revision, not a claim that the commit alone reproduces the
artifact. Keep source diffs with the evidence; a subsequent commit does not rewrite
build-time identity. Do not overwrite existing tags with unrelated builds.
Retain SHA-256 hashes of every copied `dist/lib/*.jar` in the final evidence,
including `flink-table-planner-loader-2.4-SNAPSHOT.jar` (which embeds the Planner
Bundle) and `flink-table-runtime-2.4-SNAPSHOT.jar`. The dist Jar hash alone does not
identify the planner code executed by SQL Client.

## Deploy deliberately

These steps mutate the selected cluster. Check `kubectl config current-context`
first. Use a watched test namespace and fresh resource names/evidence PVC for a new run; fixed
names/paths are intentional and this is **not** an idempotent rerun against old data.
Do not blindly apply to a cluster with existing Operator CRDs or workloads.

Install cert-manager following its official Helm instructions if absent, keeping
the webhook enabled. Install the matching source chart and generated CRDs, not the
released 1.15.0 chart: that actual release artifact rejected `v2_4` in this run.
Helm does not automatically upgrade CRDs. When upgrading a test installation,
inventory existing CRs and field ownership and apply all matching generated CRDs;
do not hand-edit the enum or relabel Flink 2.4 as 2.2.

For a fresh approved test installation:

```sh
kubectl create namespace flink-lineage-test
helm install flink-operator "$operator_repo/helm/flink-kubernetes-operator" -n flink-lineage-test -f "$lineage_work/operator-source-values.yaml" --wait
kubectl create configmap lineage-collector -n flink-lineage-test --from-file="$lineage_work/collector.cjs"
kubectl apply --dry-run=server -f "$lineage_work/cluster.yaml"
kubectl apply -f "$lineage_work/cluster.yaml"
kubectl rollout status deployment/lineage-collector -n flink-lineage-test
kubectl rollout status deployment/lineage-session -n flink-lineage-test
```

`imagePullPolicy: Never` requires both local images to be visible to the Kubernetes
container runtime (verified on OrbStack). For another cluster, explicitly load or
publish to an approved registry and adjust policies; these commands do not push.
The PVC is single-node ReadWriteOnce storage shared at `/evidence` by the test Pods.
All SQL-submitting processes use the modified Flink plus the adapter in `lib`.

## Run and judge cases

Find the collector Pod by label `app=lineage-collector`, then use `kubectl cp` to
copy the generated `direct`, `restored`, `incomplete`, `application`, and
`transport-failure` directories, all generated `.sql` files, and
`sql-runner-batch.jar` from `lineage_work` into its `/evidence` volume.

Run cases in this order, retaining SQL Client logs, remote REST job IDs/states,
Operator status and a copy of `/evidence`:

1. Apply `submit.yaml`. Require SQL success and remote FINISHED, then verify data
   and HTTP events. Kubernetes Job completion alone is not sufficient.
2. Apply `compile.yaml` and `compile-gate.yaml`; wait for completion. Confirm no new
   remote job or START event. Require `batch-exec-multiple-input_1` in
   `/evidence/restored/plan.json`.
3. In a **copy** of `/evidence/incomplete/plan.json`, recursively remove exactly
   one `columnLineage` property, assert the count, and write `bad-plan.json` in the
same directory. Apply `incomplete.yaml`. Require remote FINISHED and Detail rows
   `1,fixed,105`, `2,fixed,205`, `3,fixed,55`. START and COMPLETE must carry explicit
   unavailable column status and issues. With the current independent serialized
   `tableLineage`, require COMPLETE table status and the exact Orders-to-Detail
   pair, with no column facet. This is stronger than the historical observer
   image's PARTIAL table result. Inspect the SQL log as well as its exit code.
4. Apply `restore.yaml`: this starts a fresh Pod without original table/view DDL.
   Require remote FINISHED and exact data/lineage equivalence.
5. Apply `application.yaml`: Operator runs the batch-only SQL runner in the
   application cluster without an external SQL Client. Require remote FINISHED
   and exact data/lineage equivalence.
6. Apply `transport-failure.yaml`. Its URL uses an unserved port on the receiver
   Service, without stopping the receiver. Require the transport error and no START
   for the job. The remote JobManager uses its own endpoint and may emit RUNNING or
   COMPLETE; record those separately. Require FINISHED and exact rows. Capture the SQL Client file logs
   before the completed container is garbage-collected.

Copy `/evidence` to a fresh local directory. For each positive case run:

```sh
node "$fixture/verify-http.cjs" "$evidence_dir" direct "$direct_job_id" "$openlineage_repo"
node "$fixture/verify-http.cjs" "$evidence_dir" restored "$restored_job_id" "$openlineage_repo"
node "$fixture/verify-http.cjs" "$evidence_dir" application "$application_job_id" "$openlineage_repo"
node "$fixture/verify-http.cjs" "$evidence_dir" incomplete "$incomplete_job_id" "$openlineage_repo"
node "$fixture/verify-http.cjs" "$evidence_dir" legacy "$legacy_job_id" "$openlineage_repo"
```

Use actual remote job IDs, not hard-coded IDs from earlier runs. The verifier keeps
the root raw `events.jsonl` unchanged and writes derived per-case event files plus
the direct baseline. It reuses the paired OpenLineage repository's exact field/data
assertions. Failed assertions must not be replaced by partial-lineage acceptance.

No cleanup is automated. These commands leave controllers, clusters, test Jobs,
PVC and images present; review retained evidence and exact targets before removal.
Raw logs, images, compiled plans and data outputs are build artifacts, not source
files to commit.

## Mixed sinks and terminal lifecycle regression fixtures

For the separate legacy case, apply `compile-legacy.yaml`, remove exactly one
`tableLineage` and one `columnLineage` property from a copy of its compiled plan,
and write `/evidence/legacy/bad-plan.json`. Apply `legacy.yaml`; require the same
three projection rows, PARTIAL table status, UNAVAILABLE columns and no precise
table-pair/column facet. Keep this distinct from the column-only removal case.

Passing `openlineage_repo` to `prepare-cases.cjs` also generates `mixed.yaml`,
`compile-mixed.yaml` and `mixed-restored.yaml`. The projection writes `2,3,4`
to Good; INTERSECT writes `2,3` to Unsupported. Both must finish. Require complete
table lineage, PARTIAL column status, and a column facet only on Good. Compare
direct and restored data, column fields and nested `columnStatuses` with
`verify-http.cjs` modes `mixed` and `mixed-restored`.

`cancel.yaml` submits a detached, unbounded datagen job at one row per second.
After verifying the newly submitted job ID is RUNNING, cancel only that job using
the Flink REST endpoint `PATCH /jobs/<jobId>?mode=cancel`; require remote CANCELED
and one ABORT event with the same lineage availability as START.
`fail.yaml` reads the string `not-a-number` from CSV and casts it to BIGINT at
runtime with restarts disabled. Require remote FAILED and one FAIL event with
unchanged lineage availability. Use verifier modes `cancel` and `fail` after
recording the actual remote states. SQL Client exit status alone is insufficient.
These new scenarios require fresh paired artifacts; their generated SQL and
verifier unit tests do not themselves establish Kubernetes execution success.
