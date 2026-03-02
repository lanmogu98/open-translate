# Future Roadmap (Task Hub)

This is the **high-signal entrypoint** for near-term work.

- **Deep implementation notes**: `docs/DESIGN_REMAINING_ISSUES.md`
- **History / prior long-form roadmap**: `docs/roadmap/ROADMAP_ARCHIVE.md`

---

## Notes for Agents

- Default: read **only** the `## Now` section unless deeper context is required.
- Keep scope tight: pick **one** item, confirm insertion points, implement minimally, and update status.

---

## Now (Next 1–2 iterations)

| ID | Priority | Item | Status | GH |
| --- | --- | --- | --- | --- |
| 45 | P3 | 提示词注入防护增强: 扩展sanitizeUserPrompt过滤更多注入模式 | 🔲 Pending | — |
| 31b | P2 | Smart batch fallback: check context/output token limits and auto-reduce batch size | 🔲 Pending | — |
| 33 | P2 | Extract magic numbers as named constants: consolidate `8`, `3`, `10` thresholds in `dom-utils.js` with documented rationale | 🔲 Pending | — |
| 34 | P2 | Improve visibility check: `offsetParent === null` misses `position: fixed` elements; add `getComputedStyle` fallback | 🔲 Pending | — |
| 13 | P3 | Translation caching | 🔲 Pending | — |
| 35 | P3 | Refactor `getTranslatableElements` to pipeline pattern: split 95-line function into composable filter stages | 🔲 Pending | — |
| 36 | P3 | Add Shadow DOM support: traverse shadow roots for Web Components (YouTube, GitHub Codespaces, etc.) | 🔲 Pending | — |

---

## Next (Not scheduled yet)

- Add candidates here when they become "near-term actionable".
