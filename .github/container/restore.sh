#!/usr/bin/env bash
set -euo pipefail
: "${SOURCE_SHA:?}"
[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]
git clone --no-checkout --branch candidate candidate.bundle source
test "$(git -C source rev-parse HEAD)" = "$SOURCE_SHA"
git -C source checkout --detach "$SOURCE_SHA"
test -z "$(git -C source status --porcelain)"
