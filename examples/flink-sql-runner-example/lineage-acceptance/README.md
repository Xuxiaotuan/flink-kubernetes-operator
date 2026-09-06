<!-- Licensed under the Apache License, Version 2.0. -->

# Native Flink lineage: local Kubernetes acceptance

This is an opt-in, single-node ARM64 test fixture for the paired development
branches, not a generic SQL runner or a production deployment. Nothing in this
directory adds lineage extraction to business code or changes Operator controllers.
The batch-only `SqlRunner.java` is a copy of the adjacent upstream example with
runtime mode configured **before** TableEnvironment creation. The original example
is unchanged. Its line-based SQL splitter is sufficient for these fixed fixtures,
not arbitrary SQL scripts.

## Verified versions and results (2026-09-06)

- Operator: `38a9f197465082a5f5987653b9497d7e5aef384a`, 1.17-SNAPSHOT.
- Modified Flink: `f55bfca9ca7`, 2.4-SNAPSHOT.
- Paired OpenLineage: `754298264`, adapter 1.54.0-SNAPSHOT.
- OrbStack Kubernetes 1.35.6, linux/arm64, Java 17, 12 GiB VM memory.
- cert-manager 1.20.3; Operator watches only `flink-lineage-test`.

| Check | Recorded result |
| --- | --- |
| Remote Session SQL Client | FINISHED; exact CSV rows and HTTP lineage |
| Fresh-Pod compiled-plan restore | FINISHED; no original DDL; MultipleInput retained; identical lineage |
| Incomplete compiled lineage | Explicit rejection; no new remote job, START event or sink files |
| Application FlinkDeployment | FINISHED; identical CSV rows and HTTP lineage |
| HTTP endpoint unavailable | Transport timeout; job still FINISHED; no corresponding START received |

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
- `flink_dist`: the freshly built modified Flink distribution directory.
- `adapter_jar`: the freshly built paired OpenLineage Jar.

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
node "$lineage_work/prepare-cases.cjs"
node --test "$lineage_work/collector.test.cjs"
javac -cp "$flink_dist/lib/*" -d "$lineage_work/runner-classes" "$lineage_work/SqlRunner.java"
jar --create --file "$lineage_work/sql-runner-batch.jar" --main-class org.apache.flink.examples.SqlRunner -C "$lineage_work/runner-classes" .
docker build --platform linux/arm64 -t flink-lineage-local:f55bfca9ca7-754298264-jdk17 "$lineage_work"
docker run --rm flink-lineage-local:f55bfca9ca7-754298264-jdk17 bash -lc '/opt/flink/bin/flink --version'
```

The local-runtime Operator Dockerfile packages the Maven outputs instead of
rebuilding them inside Docker. Keep it paired with this exact source layout.
Image tags and revision labels describe the versions above: if sources change,
update the tags/labels/manifests together; do not overwrite the tags with unrelated
builds. Record image IDs and Jar hashes alongside the run evidence.

## Deploy deliberately

These steps mutate the selected cluster. Check `kubectl config current-context`
first. Use an empty test namespace and a fresh evidence PVC for a new run; fixed
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
   same directory. Apply `reject.yaml`. Require the explicit missing-lineage error,
   unchanged remote job/event counts and no sink files. Empty staging directories
   may exist. SQL Client can return zero after a SQL error, so inspect its log.
4. Apply `restore.yaml`: this starts a fresh Pod without original table/view DDL.
   Require remote FINISHED and exact data/lineage equivalence.
5. Apply `application.yaml`: Operator runs the batch-only SQL runner in the
   application cluster without an external SQL Client. Require remote FINISHED
   and exact data/lineage equivalence.
6. Apply `transport-failure.yaml`. Its URL uses an unserved port on the receiver
   Service, without stopping the receiver. Require the transport error, no new
   HTTP event, and independently record job/data outcome. The recorded run finished
   successfully despite the delivery failure. Capture the SQL Client file logs
   before the completed container is garbage-collected.

Copy `/evidence` to a fresh local directory. For each positive case run:

```sh
node "$fixture/verify-http.cjs" "$evidence_dir" direct "$direct_job_id" "$openlineage_repo"
node "$fixture/verify-http.cjs" "$evidence_dir" restored "$restored_job_id" "$openlineage_repo"
node "$fixture/verify-http.cjs" "$evidence_dir" application "$application_job_id" "$openlineage_repo"
```

Use actual remote job IDs, not hard-coded IDs from earlier runs. The verifier keeps
the root raw `events.jsonl` unchanged and writes derived per-case event files plus
the direct baseline. It reuses the paired OpenLineage repository's exact field/data
assertions. Failed assertions must not be replaced by partial-lineage acceptance.

No cleanup is automated. These commands leave controllers, clusters, test Jobs,
PVC and images present; review retained evidence and exact targets before removal.
Raw logs, images, compiled plans and data outputs are build artifacts, not source
files to commit.
