# Licensed under the Apache License, Version 2.0.
FROM eclipse-temurin:17-jdk-jammy
ENV FLINK_HOME=/opt/flink
ENV PATH=/opt/flink/bin:$PATH
RUN groupadd --gid 9999 flink && useradd --uid 9999 --gid 9999 --home-dir /opt/flink flink
COPY --chown=9999:9999 dist/ /opt/flink/
COPY --chown=9999:9999 openlineage-flink.jar /opt/flink/lib/openlineage-flink.jar
COPY --chmod=755 docker-entrypoint.sh /docker-entrypoint.sh
LABEL flink.git.sha="f55bfca9ca7" openlineage.git.sha="754298264"
USER 9999:9999
WORKDIR /opt/flink
ENTRYPOINT ["/docker-entrypoint.sh"]
