# Develata container packaging and upstream sync

This fork follows stable releases of [tufantunc/ssh-mcp](https://github.com/tufantunc/ssh-mcp).
The application is built from the tested **fork commit**, with its upstream merge
history intact. Source/version selection is automatic; no old release SHA is
hardcoded in the publisher.

## Images and deployment

- Moving, verified channel: `ghcr.io/develata/ssh-mcp:latest`
- Immutable-by-workflow source tag: `sha-<full 40-character fork commit SHA>`
- Version-qualified distribution tag:
  `<package version>-develata.<full 40-character fork commit SHA>`
- Platforms: `linux/amd64` and `linux/arm64`
- Each successful run records the exact index digest, source SHA, upstream SHA,
  tags and platforms in its summary and `container-publication` artifact.

For example, an application based on upstream 2.19.1 receives a distribution tag
beginning `2.19.1-develata.`. It is not mislabeled as an unchanged upstream
release. The full SHA is the fork's build source; the upstream release SHA is a
separate OCI label. Existing version/source tags are never overwritten. An
identical source is reused by digest on retries, re-inspected and re-tested,
rather than rebuilt over an existing tag. Registry access by other actors can
still change tags; this is a workflow policy, not registry-enforced immutability.

Use the run's `ghcr.io/develata/ssh-mcp@sha256:...` reference for a reproducible
deployment. Pulling `latest` opts into newer verified images. This workflow does
not connect to or restart any VPS, and does not include server credentials,
private SSH configuration or keys.

Historical release, retained unchanged:

- `2.18.0` and `sha-723a7c5a4846dfba822894d566212b1a58656b5e`
- Digest: `sha256:c18a1e6e6e179a0b35ad4ab6c187b8e538770cfff77b76750ad59f6a6d9f0ab1`
- [Verified historical run](https://github.com/Develata/ssh-mcp/actions/runs/37427418466)

Do not push new commits to the historical `container-publish-v2.18.0` branch:
its old workflow publishes on push.

## Three-day schedule

GitHub wakes the workflow daily at **03:17 UTC**. A tested UTC-date gate admits
every third day from **2026-10-15**: October 15, 18, 21, 24, 27, 30, November 2,
and so on. This is not a day-of-month `*/3` cron, so month/year boundaries do
not shorten the interval.

[GitHub schedules](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
can be delayed or dropped. This is a three-day target cadence, not an exact
72-hour SLA. A wake delayed into a non-due UTC day is skipped; the next due day
tries again. Public repositories can also have inactive schedules disabled by
GitHub. The Actions page is the authoritative record of whether a run occurred.

Main pushes run immediately. Manual **Run workflow** with `publish: true`
on main also bypasses the date gate. With `publish: false`, it only prepares
and tests a candidate, with no main update or image publication. PRs build and
test their own candidate and cannot enter either write-enabled job.

## Merge and validation sequence

1. Resolve the latest published, non-prerelease upstream release. Require a
   stable `vMAJOR.MINOR.PATCH` tag, resolve it to a full commit SHA, and verify
   that the tag matches upstream `package.json`.
2. Make an ordinary merge candidate on the current fork commit, without
   modifying the remote. Conflicts abort. Any changed file under `.github/`,
   or a change to this document, also aborts for review. This protects the
   publisher, helper scripts, CI permissions and upstream-only release guards,
   including against cleanly merging new workflows. No automatic conflict
   resolution, force push, reset-to-upstream or mirror replacement is used.
3. Transfer that exact candidate in a Git bundle and verify its commit SHA in
   every downstream job. Run install/build/typecheck plus unit/property tests
   on Linux, Windows and macOS. Linux additionally runs the complete suite with
   real Docker SSH fixtures and `SSH_MCP_REQUIRE_SERVERS=1`, so unavailable
   fixtures fail rather than silently skipping integration coverage.
4. Independently build and smoke-test both container architectures without
   GHCR credentials. Keep the upstream base-image digest and UID 65532. A
   checked packaging step adds the upstream MIT license to the image.
5. Only after all tests/builds pass, a separate job fast-forwards main to the
   candidate, verifying the original head and refusing concurrent changes.
   It executes no application or dependency scripts. A `GITHUB_TOKEN` push
   does not trigger another workflow, so these gates run in this same workflow
   rather than relying on another CI event.
6. Build a run-specific staging tag with BuildKit maximum provenance and SPDX
   SBOMs, or reuse the existing immutable digest for that source. Inspect the
   index, both platform manifests, their attestation predicate types and OCI
   source/version labels. Pull each architecture by its own manifest digest
   and smoke-test the actual published bytes.
7. Only then create any missing immutable tags. Recheck main and tag digests,
   and promote the verified index to `latest` as the last registry mutation.

The smoke test verifies UID 65532, the exact MIT license, package/MCP version,
a sequential initialization handshake, 14 distinct tools including
`run-command`, and refusal to execute without configuration. Network access
is disabled in smoke-test containers. A changed tool inventory or Dockerfile
packaging anchor intentionally stops publication for review.

## Failure and retry behavior

Any failure before promotion leaves the previous `latest` unchanged. A failed
staging build/verification may leave a `candidate-<run>-<attempt>` tag; it is
never a deployment channel. Main may already contain the validated merge if
the subsequent registry publication fails. Rerunning the workflow safely reuses
and re-verifies immutable source tags and can finish a partially completed
publication. A failed-job rerun can reuse the source bundle from the same run.

Concurrent main changes make the sync/promotion checks fail rather than
overwrite work or knowingly promote an outdated candidate. Workflow concurrency
serializes publishers. Git and GHCR cannot be committed as one transaction:
if the final registry request times out after GHCR accepted it, inspect
`latest` by digest before deciding whether promotion happened. Do not claim
that a network error proves the remote tag was unchanged.

Conflicts or protected upstream changes require a reviewed merge. Preserve
this file, all container helpers/workflow, fork CI's read-only defaults,
Codecov owner guards, CodeQL `upload: never`, and the upstream-only
Changesets/Scorecard guards. Then push the reviewed result to main or manually
run the workflow. No PAT or broader repository setting is needed.

## Permissions and verification limits

The workflow defaults to `contents: read`. Checkouts do not retain credentials.
Only the isolated sync job receives short-lived `contents: write`; only the
publication job receives `packages: write`. PR validation has neither
repository/package writes nor GHCR login. No new secrets, OAuth grants, OIDC
permissions, npm release, remote deployment or persistent credentials are used.

arm64 smoke tests use QEMU, not native hardware. Integration fixtures cover the
test environment, not a user's real SSH hosts or credential mounts. Source,
lockfile and base images are pinned by the selected commit; runner tooling,
BuildKit/QEMU, SBOM tooling and timestamps can vary. The digest identifies the
verified artifact; the workflow does not promise byte-for-byte reproducible
rebuilds. Publication records are retained for 90 days; Git history and GHCR
labels/attestations retain source references.
