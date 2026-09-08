# StudyLoop brand assets

Original geometric mark: two open book pages surrounded by a learning loop. The arrow represents returning to an idea through practice. It does not use the OpenMAIC logo.

| Asset              | Use                                                 |
| ------------------ | --------------------------------------------------- |
| `symbol-light.svg` | Cobalt loop and midnight book, on light backgrounds |
| `symbol-dark.svg`  | Cobalt loop and white book, on midnight backgrounds |
| `logo.svg`         | Complete wordmark for light backgrounds             |
| `logo-dark.svg`    | Complete wordmark for dark backgrounds              |
| `../favicon.svg`   | Small-size white mark on a cobalt tile              |

Colors: cobalt `#315BFF`, midnight `#111B35`, white `#FFFFFF`. Keep the mark square, preserve its negative space, and do not add a trailing dot to the wordmark.

The React component exports `Logo({ small = false, inverse = false })`. Use `<Logo inverse />` on the dark sidebar. Symbols are decorative beside the visible “StudyLoop” text, so the component uses an empty image alt and `aria-hidden="true"` to avoid duplicate announcements. Standalone SVGs have accessible titles and descriptions.
