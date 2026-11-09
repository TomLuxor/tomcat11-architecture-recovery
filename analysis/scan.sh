#!/usr/bin/env bash
# Source model (step 4): scans the release JARs listed in scope.json into the jQAssistant store.
# Usage: JQA_HOME=<jqassistant-cli-dir> analysis/scan.sh <tomcat-distribution-dir>
set -euo pipefail
here=$(dirname "$(realpath "$0")")
dist=$(realpath "$1")
files=$(node -e 'const s = require(process.argv[1]);
  console.log(s.jars.map(j => require("path").join(process.argv[2], j)).join(","))' "$here/scope.json" "$dist")
cd "$here/jqassistant"
"$JQA_HOME/bin/jqassistant" reset
"$JQA_HOME/bin/jqassistant" scan -f "$files"
# Each JAR gets its own placeholder for a type it only references; java-classpath:Resolve copies
# DEPENDS_ON, INVOKES etc. to the real type in the other JAR (marked resolved: true).
"$JQA_HOME/bin/jqassistant" analyze
