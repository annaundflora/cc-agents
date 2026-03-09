# Weave + rerere Setup Guide

Setup guide for Weave CLI, Weave merge driver, GitHub CLI, and git rerere.
Follow the steps from top to bottom — all commands are copy-paste ready.

---

## 1. Prerequisites (per machine, once)

### 1a. Rust / Cargo

Weave CLI and Weave Driver are distributed as Rust crates and require Cargo to install.

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

After installation, reload your shell or run:

```bash
source "$HOME/.cargo/env"
```

Verify:

```bash
cargo --version
```

### 1b. Weave CLI (v0.2.3)

The `weave-cli` binary provides `weave-cli setup` (repo configuration) and
`weave-cli preview <branch>` (dry-run entity-level merge analysis).

```bash
cargo install --git https://github.com/Ataraxy-Labs/weave weave-cli
```

Verify:

```bash
weave-cli --version
```

### 1c. Weave Driver (v0.2.3)

The `weave-driver` binary is the git merge driver that performs entity-level
merges automatically during `git merge` and `git rebase`.

```bash
cargo install --git https://github.com/Ataraxy-Labs/weave weave-driver
```

Verify:

```bash
weave-driver --version
```

### 1d. GitHub CLI

The `gh` CLI is used by `conflict-scanner.js` to create and read GitHub Issues
for the session registry.

Install: https://cli.github.com (package manager recommended — see site for your OS)

After installation, authenticate:

```bash
gh auth login
```

Verify:

```bash
gh auth status
```

---

## 2. Repository Setup (per repo, once)

Run these commands from the root of the target repository.

### 2a. Copy the .gitattributes template

```bash
cp plugins/clemens/templates/gitattributes-weave.template .gitattributes
```

Or if the template is not in the repo, download it and copy manually. The template
contains merge driver assignments (`merge=weave`) and diff driver assignments
(`diff=typescript`, `diff=python`, `diff=golang`) for all supported file types.

### 2b. Run weave-cli setup

`weave-cli setup` registers the Weave merge driver and funcname diff patterns in
the local git config (`.git/config`). Run this after `.gitattributes` is in place:

```bash
weave-cli setup
```

This command configures:
- `[merge "weave"]` driver pointing to the `weave-driver` binary
- `[diff "typescript"]`, `[diff "python"]`, `[diff "golang"]` xfuncname patterns
  so that `git diff` hunk headers (`@@` lines) show function/class names instead
  of only line numbers

### 2c. Enable git rerere

`git rerere` (Reuse Recorded Resolution) records conflict resolutions and
automatically replays them when the same conflict is encountered again.

```bash
git config rerere.enabled true
```

To enable rerere globally for all repositories on this machine:

```bash
git config --global rerere.enabled true
```

---

## 3. Verification

Run the following checks to confirm the setup is complete.

### 3a. Verify weave-cli setup (dry-run)

```bash
weave-cli setup --dry-run
```

This shows what `weave-cli setup` would configure without writing to `.git/config`.
If the output lists the merge driver and diff patterns, the setup would succeed.

### 3b. Verify git rerere is active

```bash
git config rerere.enabled
```

Expected output: `true`

### 3c. Verify the merge driver is registered

```bash
git config merge.weave.driver
```

Expected output: path to the `weave-driver` binary with `%O %A %B %L %P` arguments.

### 3d. Verify funcname patterns (TypeScript example)

After setup, create or modify a TypeScript file and run:

```bash
git diff
```

The `@@` hunk headers should show the enclosing function or class name, e.g.:

```
@@ -42,10 +42,15 @@ function PromptArea() {
```

If the hunk header only shows line numbers (e.g., `@@ -42,10 +42,15 @@`), the
`diff=typescript` pattern is not active. Re-run `weave-cli setup`.

### 3e. Verify GitHub CLI authentication

```bash
gh auth status
```

Expected: authenticated to github.com as your username.

---

## 4. Usage

Once setup is complete:

- `git merge feature/<branch>` — Weave driver resolves entity-level conflicts automatically
- `weave-cli preview main` — dry-run analysis of what Weave would merge
- `git config rerere.enabled` — confirm rerere is recording resolutions

The `conflict-scanner.js` script uses `weave-cli preview` for entity extraction
(with `--weave` flag) or falls back to `git diff` hunk header parsing.

---

## Supported Languages

Weave supports 17 languages via Tree-sitter AST:
TypeScript, JavaScript, Python, Go, Rust, Java, C#, C, C++, Ruby, PHP, Swift,
Fortran, JSON, YAML, TOML, Markdown

Funcname patterns (for `git diff` hunk headers) are active for:
TypeScript/TSX, JavaScript/JSX, Python, Go, Rust, Java, C#, Ruby, PHP
