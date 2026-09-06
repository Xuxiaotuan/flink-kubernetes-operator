#!/usr/bin/env bash
# Licensed under the Apache License, Version 2.0.
set -euo pipefail
# Native Kubernetes supplies the version-matched Flink startup script as arguments.
exec "$@"
