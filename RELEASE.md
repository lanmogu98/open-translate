# Release Process

This document describes how to create and publish a new release of Open Translate.

## Version Strategy

We follow [Semantic Versioning (SemVer)](https://semver.org/):

| Version Part | When to Bump | Example |
|--------------|--------------|---------|
| **MAJOR** (X.0.0) | Breaking changes requiring user action (config migration, API changes) | 1.0.0 → 2.0.0 |
| **MINOR** (0.X.0) | New features, backward compatible | 1.0.0 → 1.1.0 |
| **PATCH** (0.0.X) | Bug fixes, performance improvements | 1.0.0 → 1.0.1 |

**Current Stage**: We use `0.x.y` to indicate the project is experimental. Move to `1.0.0` when the core feature set is stable.

## Version Sources

The **single source of truth** for the extension version is:

```
manifest.json → "version": "X.Y.Z"
```

Keep `package.json` version in sync for consistency, but Chrome only reads `manifest.json`.

## Release Checklist

### 1. Prepare the Release

```bash
# Ensure you're on main with latest changes
git checkout main
git pull

# Run all tests
npm test

# Verify the extension works manually in Chrome
```

### 2. Update Version Numbers

Edit `manifest.json`:
```json
{
  "version": "0.2.0"  // ← Update this
}
```

Edit `package.json` (keep in sync):
```json
{
  "version": "0.2.0"  // ← Update this
}
```

### 3. Finalize Changelog

Move items from `[Unreleased]` to a new version section in `CHANGELOG.md`:

```markdown
## [Unreleased]
<!-- Empty or only unreleased items -->

## [0.2.0] - 2026-01-15

### Added
- ...

### Fixed
- ...
```

### 4. Commit Version Bump

```bash
git add manifest.json package.json CHANGELOG.md
git commit -m "chore: release v0.2.0"
```

### 5. Create Git Tag

```bash
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin main --tags
```

### 6. Build Release Package

```bash
chmod +x scripts/package-release.sh
./scripts/package-release.sh
```

This creates `dist/open-translate-v0.2.0.zip`.

### 7. Create GitHub Release

1. Go to the [New Release page](https://github.com/lanmogu98/open-translate/releases/new)
2. Select the tag you just pushed (e.g., `v0.2.0`)
3. Title: `v0.2.0`
4. Description: Copy the changelog section for this version
5. Attach the zip file from `dist/`
6. Publish release

## Release Package Contents

The release zip includes only files needed for the extension to run:

| Included | Excluded |
|----------|----------|
| `manifest.json` | `node_modules/` |
| `src/` (all source) | `tests/` |
| `icons/` | `scripts/` (dev scripts) |
| `lib/` (if any) | `*.test.js` |
| | `.git/`, `.gitignore` |
| | `package.json`, `package-lock.json` |
| | `jest.config.cjs` |
| | `llm_config.yml`, `llm_config.json` |
| | `docs/`, `DEVELOPER_GUIDE.md` |

Users don't need npm or any build step to install from the release zip.

## Hotfix Releases

For urgent fixes on a released version:

```bash
# Create hotfix branch from the release tag
git checkout -b hotfix/v0.2.1 v0.2.0

# Make fixes, then follow steps 2-7 with version 0.2.1
```

## Pre-release Versions

For testing before official release:

```bash
# Use pre-release suffix in manifest.json
"version": "0.2.0-beta.1"

# Tag with pre-release
git tag -a v0.2.0-beta.1 -m "Pre-release v0.2.0-beta.1"
```

Mark as "Pre-release" when creating the GitHub release.
