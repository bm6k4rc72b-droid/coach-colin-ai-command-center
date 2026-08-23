# Animation & Interaction Direction

`flight-plan.html` is a self-contained direction document for the Command Center
site. Every technique it recommends is implemented and running inside the page
itself, so it doubles as a reference implementation.

Open it directly in a browser — no build step, no dependencies, no network calls
except Google Fonts.

## What's demonstrated live

| Technique | Where | Notes |
|---|---|---|
| Scroll telemetry bus | whole page | One rAF loop publishing `--sp` (progress) and `--sv` (velocity) as CSS custom properties. Everything else subscribes to these. |
| 3D waypoint transit | §01 | CSS 3D, one `perspective` container, six bodies on a shared z-axis. No library. |
| Velocity-reactive warp | §02 | Canvas 2D. Streak length, density, and chromatic aberration are functions of scroll velocity, not position. |
| Data-bound system map | §03 | Orbit radius encodes proximity to the client, diameter encodes volume, period encodes run frequency. |
| Pointer-reactive iridescence | §04 | Four holographic material models in pure CSS, driven by `--mx` / `--my`. |

## Implementation notes worth keeping

- **`background-clip: text` paints in the background phase.** A `text-shadow` on
  the same element paints *over* the gradient and hides it completely. Use
  `filter: drop-shadow()` instead — it filters the rendered result.
- **An inline element fragments per line box**, and each fragment samples its own
  slice of the background image, which flattens a gradient across a multi-line
  headline. The element needs `display: inline-block`.
- **Custom properties do not cross elements you did not set them on.** Orbit
  labels read `--d` from their parent node, not from the sibling that draws the body.
- `prefers-reduced-motion` collapses the flight into a static readable document.
  All copy is real DOM behind the canvas layers, so the page degrades to a
  normal article with JS off.
