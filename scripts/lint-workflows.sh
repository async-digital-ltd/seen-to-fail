#!/usr/bin/env bash
#
# Lints every workflow in .github/workflows with actionlint, and the shell in
# each of their `run:` steps with shellcheck, both at pinned versions. It
# answers one question: would GitHub read these workflows the way they were
# meant, before any of them runs.
#
# Two of the three workflows run only when somebody dispatches them or on the
# Monday schedule: `record-run.yml` and `replay.yml`. Nothing else in the build
# reads them as workflows. Prettier reads them as YAML for formatting and
# ESLint does not read them at all, so a mistyped `inputs.*` name, a bad
# expression or a wrong key merged green and was first found by a person's
# real observation or by the next scheduled replay. A mistyped input is not
# even an error to GitHub: it reads as an empty string (#157).
#
# One script rather than a run block in the CI workflow, so a local run and the
# CI step are the same check. CI runs it as `pnpm lint:workflows`, and so can
# anyone with a clone. It needs bash, curl, tar and a network connection, and
# nothing installed beforehand.
#
# Both tools are downloaded from their own GitHub release pages on every run,
# into a temporary directory that is removed afterwards, and each download is
# refused unless its SHA-256 is the one written below for that platform. A
# version is a pin only if what runs is what was pinned, so the checksum is the
# pin and the version number is its label.
#
#   - actionlint publishes a checksums file with each release. The sums below
#     are copied from `actionlint_1.7.12_checksums.txt`.
#   - shellcheck publishes none, so its sums are the ones GitHub records for
#     each release asset, which
#     `gh api repos/koalaman/shellcheck/releases/tags/v0.11.0 --jq '.assets[] | .name + " " + .digest'`
#     prints.
#
# It pins shellcheck as well as actionlint because actionlint hands every
# `run:` script to whichever shellcheck it finds on the PATH, and the two places
# this runs had different ones when it was written, on 2 October 2026: 0.9.0 on
# GitHub's Ubuntu 24.04 runner image, by that image's published software list,
# and 0.11.0 from Homebrew on the machine that wrote this. Two versions of a
# linter are two definitions of the check, and a finding one of them raises and
# the other does not would pass locally and fail in CI, or the other way round.
#
# pyflakes is switched off, with `-pyflakes=` below, rather than pinned.
# actionlint hands it only the steps written with `shell: python`, and no
# workflow here has one, so it has nothing to read. Left to the PATH, whether
# it ran would depend on whether the machine happened to have it. A workflow
# that adds a Python step should pin it here first.
#
# To move either tool to a new release, change its version and all four of its
# sums together, from the sources above, and run this script on the tree and
# on a planted defect before trusting the new pin.
#
# It was watched failing before it was trusted, on 2 October 2026. Run as
# `pnpm lint:workflows`, the way CI runs it, with `inputs.check-id` typed as
# `inputs.check_id` in record-run.yml and `inputs.only-due` typed as
# `inputs.only_due` in replay.yml, it exited 1 and named both lines, while
# `pnpm lint` and `pnpm format:check` both exited 0 over the same two plants.
# With the plants removed it exited 0 and named all three workflows.
#
# The same two plants, pushed to the pull request for #157, failed this step
# in CI run 36984692843 with exit 1, naming both lines. Run 36984277388, on
# the commit before the plants, had passed it.
#
# Run with no shellcheck anywhere on the PATH and `"$BRANCH"` left unquoted in
# a run step of record-run.yml, it exited 1 on SC2086, so the one answering is
# the pinned one. A copy with one character of a pinned sum changed refused the
# download and exited 1 before running anything.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

actionlint_version=1.7.12
shellcheck_version=0.11.0

platform="$(uname -s)/$(uname -m)"
case "$platform" in
  Linux/x86_64)
    actionlint_build=linux_amd64
    actionlint_sha256=8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8
    shellcheck_build=linux.x86_64
    shellcheck_sha256=b7af85e41cc99489dcc21d66c6d5f3685138f06d34651e6d34b42ec6d54fe6f6
    ;;
  Linux/aarch64 | Linux/arm64)
    actionlint_build=linux_arm64
    actionlint_sha256=325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6
    shellcheck_build=linux.aarch64
    shellcheck_sha256=68a8133197a50beb8803f8d42f9908d1af1c5540d4bb05fdfca8c1fa47decefc
    ;;
  Darwin/arm64)
    actionlint_build=darwin_arm64
    actionlint_sha256=aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f
    shellcheck_build=darwin.aarch64
    shellcheck_sha256=339b930feb1ea764467013cc1f72d09cd6b869ebf1013296ba9055ab2ffbd26f
    ;;
  Darwin/x86_64)
    actionlint_build=darwin_amd64
    actionlint_sha256=5b44c3bc2255115c9b69e30efc0fecdf498fdb63c5d58e17084fd5f16324c644
    shellcheck_build=darwin.x86_64
    shellcheck_sha256=c2c15e08df0e8fbc374c335b230a7ee958c313fa5714817a59aa59f1aa594f51
    ;;
  *)
    echo "The workflow lint has no pinned build of actionlint and shellcheck for $platform." >&2
    exit 1
    ;;
esac

for tool in curl tar; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "The workflow lint needs $tool, and there is none on the PATH." >&2
    exit 1
  fi
done

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d ' ' -f 1
  else
    shasum -a 256 "$1" | cut -d ' ' -f 1
  fi
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Downloads one file and refuses it unless its SHA-256 is the expected one. A
# refused file is never unpacked, so nothing from it runs.
fetch() {
  local url="$1" expected="$2" file="$3" actual
  curl --fail --silent --show-error --location --retry 3 --output "$file" "$url"
  actual="$(sha256_of "$file")"
  if [ "$actual" != "$expected" ]; then
    echo "The workflow lint refused $url: its SHA-256 is $actual, and the pin is $expected." >&2
    exit 1
  fi
}

fetch "https://github.com/rhysd/actionlint/releases/download/v${actionlint_version}/actionlint_${actionlint_version}_${actionlint_build}.tar.gz" \
  "$actionlint_sha256" "$work/actionlint.tar.gz"
fetch "https://github.com/koalaman/shellcheck/releases/download/v${shellcheck_version}/shellcheck-v${shellcheck_version}.${shellcheck_build}.tar.gz" \
  "$shellcheck_sha256" "$work/shellcheck.tar.gz"

tar -xzf "$work/actionlint.tar.gz" -C "$work" actionlint
tar -xzf "$work/shellcheck.tar.gz" -C "$work" "shellcheck-v${shellcheck_version}/shellcheck"
actionlint="$work/actionlint"
shellcheck="$work/shellcheck-v${shellcheck_version}/shellcheck"

# Every workflow by name, rather than leaving actionlint to find them, so the
# pass line below can say which files it read. No files at all is a refusal: a
# lint over nothing would pass, and that pass would mean nothing.
shopt -s nullglob
workflows=(.github/workflows/*.yml .github/workflows/*.yaml)
shopt -u nullglob
if [ "${#workflows[@]}" -eq 0 ]; then
  echo "The workflow lint found no .yml or .yaml file in .github/workflows to read." >&2
  exit 1
fi

# actionlint exits 1 when it finds something, and 2 or 3 when it could not run
# at all. Either way the status is passed on unchanged. It is collected rather
# than left to `set -e`, so that the pass line below is printed only by a run
# that reached the end.
status=0
"$actionlint" -shellcheck="$shellcheck" -pyflakes= "${workflows[@]}" || status=$?
if [ "$status" -ne 0 ]; then
  echo "The workflow lint failed: actionlint $actionlint_version exited $status." >&2
  exit "$status"
fi

echo "The workflow lint passed: actionlint $actionlint_version, with shellcheck $shellcheck_version, found nothing in ${workflows[*]}."
