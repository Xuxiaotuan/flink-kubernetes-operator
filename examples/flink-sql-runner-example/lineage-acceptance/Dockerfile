# Licensed under the Apache License, Version 2.0.
FROM eclipse-temurin:17-jdk-jammy
ENV FLINK_HOME=/opt/flink
ENV PATH=/opt/flink/bin:$PATH
RUN groupadd --gid 9999 flink && useradd --uid 9999 --gid 9999 --home-dir /opt/flink flink
COPY --chown=9999:9999 dist/ /opt/flink/
COPY --chown=9999:9999 openlineage-flink.jar /opt/flink/lib/openlineage-flink.jar
COPY --chown=9999:9999 build-provenance.json /opt/flink/build-provenance.json
COPY --chmod=755 docker-entrypoint.sh /docker-entrypoint.sh
ARG FLINK_GIT_SHA=unknown
ARG FLINK_GIT_DIRTY=unknown
ARG OPENLINEAGE_GIT_SHA=unknown
ARG OPENLINEAGE_GIT_DIRTY=unknown
LABEL flink.git.sha=$FLINK_GIT_SHA flink.git.dirty=$FLINK_GIT_DIRTY \
  openlineage.git.sha=$OPENLINEAGE_GIT_SHA openlineage.git.dirty=$OPENLINEAGE_GIT_DIRTY
USER 9999:9999
WORKDIR /opt/flink
ENTRYPOINT ["/docker-entrypoint.sh"]
