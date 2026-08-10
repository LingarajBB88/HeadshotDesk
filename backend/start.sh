#!/bin/sh
# Production entrypoint (Render).
#
# Migrations do NOT run here. They run in Render's preDeployCommand, which
# executes once per deploy in a separate container before any new instance
# takes traffic. Running them at web-process boot meant three things:
#
#   1. A slow or lock-blocked migration kept the container from ever
#      serving, so a schema change could take the whole API down.
#   2. With more than one instance, every instance raced to migrate.
#   3. There was no way to fail a deploy on a bad migration without also
#      killing the running version.
#
# See render.yaml preDeployCommand.
set -e
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
