# Drag-and-Drop Implementation

## Decision

Use the browser-native HTML5 Drag and Drop API for tree item reordering instead of a third-party library (e.g. `dnd-kit`, `@hello-pangea/dnd`).

## Context

Tracksy needs drag-and-drop reordering of sibling items within the tree. The scope is constrained: reordering is limited to siblings with the same `parent_id`. Cross-parent reparenting via drag is not supported in v0.1.

## Options considered

1. **Native HTML5 DnD API** — zero dependencies, works with TanStack Virtual's absolutely-positioned items, simple top/bottom-half detection for drop position.
2. **dnd-kit** — full-featured library with sortable presets. However, `@dnd-kit/sortable` expects items in normal document flow for displacement animations, which conflicts with TanStack Virtual's absolute positioning. Would require disabling virtualization during drag or significant adapter code.
3. **@hello-pangea/dnd** — fork of react-beautiful-dnd. Same flow-based layout assumption as dnd-kit. Also unmaintained upstream.

## Rationale

Native DnD is sufficient for sibling-only reordering. It avoids a dependency, avoids the virtualization/sortable conflict, and keeps the implementation simple. If cross-parent reparenting or more complex interactions are needed later, this decision should be revisited.

## Trade-offs

- No animated displacement of siblings during drag (items don't shift out of the way).
- Drop position is indicated by a static blue line rather than a gap opening.
- Mobile touch support is limited (HTML5 DnD has poor mobile support). This is acceptable since Tracksy is a Linux desktop app (SPEC.md § 2.2 — mobile is a non-goal).
