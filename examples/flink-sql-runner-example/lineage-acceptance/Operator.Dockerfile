# Licensed under the Apache License, Version 2.0.
FROM eclipse-temurin:17-jre-jammy
ENV FLINK_HOME=/opt/flink FLINK_PLUGINS_DIR=/opt/flink/plugins OPERATOR_LIB=/opt/flink/operator-lib
ENV OPERATOR_JAR=flink-kubernetes-operator-1.17-SNAPSHOT-shaded.jar
ENV WEBHOOK_JAR=flink-kubernetes-webhook-1.17-SNAPSHOT-shaded.jar
ENV KUBERNETES_STANDALONE_JAR=flink-kubernetes-standalone-1.17-SNAPSHOT.jar
ENV DISABLE_JEMALLOC=true
RUN groupadd --system --gid=9999 flink && useradd --system --home-dir /opt/flink --uid=9999 --gid=flink flink && mkdir -p /opt/flink/operator-lib && chown -R flink:flink /opt/flink
WORKDIR /flink-kubernetes-operator
COPY --chown=flink:flink flink-kubernetes-operator/target/flink-kubernetes-operator-1.17-SNAPSHOT-shaded.jar ./
COPY --chown=flink:flink flink-kubernetes-webhook/target/flink-kubernetes-webhook-1.17-SNAPSHOT-shaded.jar ./
COPY --chown=flink:flink flink-kubernetes-standalone/target/flink-kubernetes-standalone-1.17-SNAPSHOT.jar ./
COPY --chown=flink:flink flink-kubernetes-operator/target/plugins /opt/flink/plugins
COPY --chown=flink:flink flink-kubernetes-operator/target/log4j /opt/flink/operator-lib/log4j
COPY --chown=flink:flink flink-kubernetes-operator/target/logback /opt/flink/operator-lib/logback
COPY LICENSE NOTICE ./
COPY licenses ./licenses
COPY --chmod=755 docker-entrypoint.sh /
LABEL org.opencontainers.image.revision=38a9f197465082a5f5987653b9497d7e5aef384a
USER flink
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["help"]
