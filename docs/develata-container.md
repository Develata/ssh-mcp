# Develata container packaging and upstream sync

This fork keeps the application on upstream history and adds a small, reviewable
container-maintenance layer. The upstream project is
[tufantunc/ssh-mcp](https://github.com/tufantunc/ssh-mcp).

## Current image

- Source: upstream v2.18.0, commit
  `723a7c5a4846dfba822894d566212b1a58656b5e`
- Image: `ghcr.io/develata/ssh-mcp:2.18.0`
- Immutable deployment reference:
  `ghcr.io/develata/ssh-mcp@sha256:c18a1e6e6e179a0b35ad4ab6c187b8e538770cfff77b76750ad59f6a6d9f0ab1`
- Platforms: `linux/amd64` and `linux/arm64`
- Verified publication:
  [Actions run 37427418466](https://github.com/Develata/ssh-mcp/actions/runs/37427418466)

The Docker build checks out that exact upstream commit, regardless of the fork's
current source. It keeps upstream application code, lockfile, base-image digest,
and non-root UID 65532 unchanged. The only packaging adjustment copies the
upstream MIT license into the image. No server configuration or credentials are
included.

Use the digest for deployments. Tags can be changed by actors with registry
access; the workflow's preflight refusal is a safety check, not a registry-level
immutability policy. Do not push new commits to the old
`container-publish-v2.18.0` branch: its historical workflow publishes on push.
That branch is retained as a record of the verified publication.

## What runs in this fork

- Upstream CI still builds and tests the PR's application code on Linux, Windows,
  and macOS, runs local security analysis, and checks its Docker image
- The fork's CI tokens are read-only. Codecov uploads are restricted to the
  upstream repository, and CodeQL runs with `upload: never` without
  `security-events: write`
- All five Changesets release/listing/attestation jobs and the separate
  Scorecard publication job are restricted to `tufantunc/ssh-mcp`
- `publish-container.yml` builds and smoke-tests the pinned image separately for
  both architectures on relevant PRs and main pushes. These validation jobs have
  only `contents: read`, do not log in to GHCR, and use `push: false`
- Publishing requires a manual dispatch of this workflow on `main` in
  `Develata/ssh-mcp`, with `publish` explicitly selected, after both validation
  jobs succeed. Only that job receives `packages: write`
- There is no tag-triggered publication, scheduled sync, automatic upstream
  version selection, `latest` tag, npm release, or deployment

A manual run with `publish` left false only validates. A publishing run refuses
to overwrite either the version tag or the source-SHA tag. Because v2.18.0
already exists, publishing the current configuration intentionally stops at that
guard. Do not remove the guard to rebuild over this image.

## Sync upstream without losing fork changes

Use a merge PR so upstream ancestry and the fork's maintenance files survive.
From a clean local checkout:

```sh
# Add once; if it already exists, inspect its URL instead of replacing it blindly.
git remote add upstream https://github.com/tufantunc/ssh-mcp.git
git remote -v
git fetch origin
git fetch upstream --tags
git switch main
git pull --ff-only origin main
git switch -c sync/upstream-YYYY-MM-DD
git merge --no-ff upstream/main
# Review the merged diff, resolve conflicts, run CI, then push the new branch.
git push -u origin sync/upstream-YYYY-MM-DD
```

Open a PR from that branch into `Develata/ssh-mcp:main`. Use an ordinary merge
commit for upstream-sync PRs to retain upstream ancestry. Do not force-push,
reset main to upstream, discard fork commits, or use a mirror sync that removes
fork-only files. If the merge is not ready, `git merge --abort` leaves main
unchanged.

Before merging each sync PR:

1. Preserve this document and `.github/workflows/publish-container.yml`
2. Preserve every upstream-only owner guard in `changesets.yml` and
   `scorecard.yml`
3. Preserve the fork's read-only CI permissions, Codecov guards, and CodeQL
   `upload: never`; inspect any newly added upstream workflow, job, permission,
   secret use, release step, or external upload
4. Resolve workflow conflicts deliberately and require successful tests on the
   final merged commit; do not bypass failures merely because upstream is green

Most application updates can merge normally because this fork does not change
application code. Workflow changes can conflict with the small fork-specific
guards. New upstream workflows can also merge cleanly yet introduce new
publication or permission behavior, so review is still necessary.

## Updating the published version is a separate decision

Syncing main does not change the image source pin and does not publish a new
image. For an approved upgrade, prepare another PR that deliberately updates
the source SHA, version, both checkout refs, tags, labels, concurrency group,
expected tool count if needed, and this document. Verify the upstream version,
Dockerfile license-copy anchor, security changes, and test results.

Choose new, unused version/source tags and obtain approval for the exact
version and GHCR destination before manually dispatching publication. If the
same source must be rebuilt, design a reviewed new packaging tag rather than
overwriting the existing source tag. After publication, verify both platform
manifests and smoke tests, record the new immutable digest, and make any server
deployment a separate approved operation.

## Verification limits

The image checks prove it builds, runs as UID 65532, contains the MIT license,
answers the MCP initialization/tools-list requests, and refuses commands
without configuration on both architectures. arm64 is tested through QEMU, not
on a native arm64 host. They do not prove connectivity to a real SSH server,
credential mounting, deployment health, or byte-for-byte reproducible rebuilds.

The source, dependency lockfile, and base image are pinned. Runner tooling,
QEMU/BuildKit components, SBOM generation, and build timestamps can still vary;
the historical build also reported Node 20 deprecation warnings in its pinned
Docker action versions. Keep those upgrades as separately reviewed changes.
