# Task Management System (Roadmap-centric)

This repo uses a **roadmap-centric** task system optimized for:
- **High signal / low noise** in day-to-day work
- **Low context cost** for LLM agents (avoid reading long historical task lists)
- **Stable “contract”** so cross-project agent/skill instructions don't become stale

---

## Goals

- Keep the **current work** visible and unambiguous
- Make **status** and **priority** explicit
- Keep **history** accessible without polluting the default reading path

## Non-goals

- Replacing a full issue tracker (labels, assignees, automation, PR linking, etc.)
- Capturing every idea forever in one file

---

## Files (Contract)

### `FUTURE_ROADMAP.md` (single entrypoint)

- **Purpose**: A short, high-signal index for **Now/Next** work.
- **Reading rule (agents)**: Read this first; do **not** read archive unless needed.
- **Size rule**: Keep it short (ideally **≤ 1–2 screens**).
- **Content rule**: Only keep what is actionable in the near term.

### `docs/DESIGN_REMAINING_ISSUES.md` (deep implementation notes)

- **Purpose**: Detailed implementation paths, technical design, testing notes.
- **Usage**: When you pick an item from `FUTURE_ROADMAP.md`, open the matching section here.
- **Note**: This can be longer; it's not the default entrypoint.

### `docs/roadmap/ROADMAP_ARCHIVE.md` (history)

- **Purpose**: Preserve completed/obsolete items and prior long-form notes.
- **Rule**: Not part of the default workflow; treat as read-only history.

---

## Status Model

Use a small, explicit status set:

- **Pending**: agreed work, not started
- **In Progress**: actively being implemented
- **Done (recent)**: completed recently; eligible for archiving
- **Archived**: moved to `docs/roadmap/ROADMAP_ARCHIVE.md`

Keep “In Progress” items few; prefer finishing over parallelism.

---

## Workflow (Human + Agent Friendly)

- **Start work**
  - Move the item into `FUTURE_ROADMAP.md` → **Now**
  - Set status to **In Progress**
  - If there is non-trivial design: update/add notes in `docs/DESIGN_REMAINING_ISSUES.md`

- **Finish work**
  - Set status to **Done (recent)**
  - If behavior changed: update `CHANGELOG.md` under `## [Unreleased]`

- **Periodic cleanup (recommended)**
  - Move “Done (recent)” items from `FUTURE_ROADMAP.md` into `docs/roadmap/ROADMAP_ARCHIVE.md`
  - Keep `FUTURE_ROADMAP.md` short and current

---

## Relationship to GitHub Issues

This system is intentionally “GitHub Issues–like”, but file-based.

- **If you later migrate to GitHub Issues**:
  - Each roadmap item maps 1:1 to an issue
  - `FUTURE_ROADMAP.md` becomes the “milestone / focus view”
  - The archive becomes closed issues / release history

---

## Why this structure matters

The task system references **stable contracts** (files + reading order), not volatile task lists.

This avoids the failure mode where:
- tasks change daily
- agent instructions become outdated
- agents waste context budget reading large, low-signal history

---

## Refactor Summary (this repo)

Applied on **2026-01-08**:

- `FUTURE_ROADMAP.md` was rewritten to be a short **Now/Next** task hub (agent-friendly).
- The previous long-form roadmap content was moved to `docs/roadmap/ROADMAP_ARCHIVE.md`.
- `DEVELOPER_GUIDE.md` was updated to remove `TODO.md` drift and point to the new task-system contract.

