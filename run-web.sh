#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export BARYOKONEK_DB_URL="${BARYOKONEK_DB_URL:-jdbc:postgresql://localhost:5432/baryokonek}"
export BARYOKONEK_DB_USER="${BARYOKONEK_DB_USER:-baryokonek_app}"
export BARYOKONEK_DB_PASSWORD="${BARYOKONEK_DB_PASSWORD:-ChangeThisPassword123!}"
export BARYOKONEK_WEB_PORT="${BARYOKONEK_WEB_PORT:-8080}"
export BARYOKONEK_WEB_BIND="${BARYOKONEK_WEB_BIND:-0.0.0.0}"
export BARYOKONEK_COOKIE_SECURE="${BARYOKONEK_COOKIE_SECURE:-false}"
java -version
mvn clean package
java --add-modules jdk.httpserver -jar target/BaryoKonekWebServer.jar
