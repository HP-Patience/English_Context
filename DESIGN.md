# ContextVocab Design Contract

This document codifies the current interface in `src/app/globals.css`, `src/app/layout.tsx`, and `src/components/story`. It is an extraction of existing behavior, not a redesign. New story controls must compose the tokens and patterns below without adding a palette, font, layout model, dependency, or motion language.

## 1. Atmosphere

The product feels like a quiet reading desk: warm stone around paper surfaces, dark ink, and restrained terracotta marks for story emphasis. Story pages should favor readable narrative flow over dashboard density. English target words feel annotated rather than gamified. Serif headings, chapter numbering, left rules, and small ledger labels provide the archival story character; Inter keeps navigation, controls, metadata, and status text practical.

Light and dark modes carry the same hierarchy. Dark mode is a low-glare reading surface, not a separate visual identity. Amber marks recall and due work, emerald marks completion, and red or terracotta marks primary story actions and errors, following the existing story components.

## 2. Color Tokens

The canonical story tokens come from `.story-theme` in `globals.css`.

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| Page background | `--story-bg: #f7f4ef` | `--story-bg: #171615` | Story canvas and header ground |
| Surface | `--story-surface: #fffdfa` | `--story-surface: #211f1d` | Paper cards, navigation, raised reading surfaces |
| Ink | `--story-ink: #262421` | `--story-ink: #f2eee8` | Primary text |
| Muted ink | `--story-muted: #756f68` | `--story-muted: #aaa098` | Metadata and secondary copy |
| Rule | `--story-line: #d8d0c7` | `--story-line: #4a433d` | Borders, dividers, scene rails |
| Accent | `--story-accent: #c65d3b` | `--story-accent: #e07a57` | Kicker text, active marks, target emphasis |
| Accent wash | `--story-accent-soft: #f4ddd3` | `--story-accent-soft: #3a2019` | Active steps and target-word fill |
| Accent rule | `--story-accent-line: #d99a86` | `--story-accent-line: #8f4a38` | Inset target-word boundary |

The root app remains `stone-50` and `stone-900` in light mode, then `stone-950` and `stone-100` in dark mode, as set in `layout.tsx`. Existing Tailwind stone, red, amber, and emerald utilities remain valid for shell chrome, actions, due states, completion, and alerts. New story components should prefer the story CSS tokens for their base surface, ink, border, and accent so both themes stay aligned.

## 3. Typography

- Inter, loaded in `layout.tsx`, is the body and interface face. Use it for controls, labels, metadata, status text, filters, and gloss annotations.
- `font-serif` is the existing content hierarchy for story titles, scene titles, target-word headings, lesson numbers, progress totals, and completion headings. Keep the current Tailwind serif family rather than adding a font.
- Story title scale: `text-3xl` on small screens and `text-4xl` from `sm`, bold with tight tracking.
- Section title scale: `text-2xl`, bold. Scene and card headings use `text-lg` through `text-2xl` according to their existing level.
- Reading copy uses `1.02rem`, rising to `1.08rem` from `sm`, with `leading-9`. Supporting copy uses `text-sm` with `leading-6`; notes use `text-xs` with `leading-5`.
- Ledger labels use `0.62rem` to `0.68rem`, semibold uppercase, with the existing wide tracking of `0.16em` to `0.28em`. Keep these labels short.
- Numbers that report order or progress use tabular figures. English words carry `lang="en"`; Chinese glosses carry `lang="zh-CN"` where the component boundary permits it.

## 4. Spacing And Layout

Use Tailwind's existing 4px spacing base. Common steps already in the story UI are 4, 8, 12, 16, 20, 24, 28, and 32px. Preserve them rather than introducing one-off spacing.

- App shell: centered `max-w-4xl` at 56rem, with 16px horizontal padding. Main content starts with 32px vertical padding.
- Story reading shell: centered `max-w-3xl` at 48rem, with 56px bottom padding.
- Story header: 20px by 28px padding on small screens, 32px by 36px from `sm`.
- Narrative scenes: 32px vertical rhythm, a 2px left rule, and 20px left padding rising to 28px from `sm`.
- Repeated cards and controls use 12px to 20px internal gaps. Standard controls are at least 44px high; primary progression actions are 48px high. The shipped compact gloss control is 40px high and 96px wide.
- Reusable surface radii follow the shipped set: 6px for compact tags, 8px for small controls, 12px for standard controls, 16px for cards, and 24px for the story masthead. Pills are reserved for status and compact metadata.
- Responsive grids collapse to one column first. Existing breakpoints then allow three equal step columns, two word-card columns at `md`, and split control or card layouts at `sm`. Wide review tables remain horizontally scrollable rather than compressing their content.

## 5. Components And States

All controls need default, hover, focus-visible, active or selected, disabled or locked, loading, success, error, empty, and offline treatment where relevant. Focus uses a visible 2px ring with suitable offset. Disabled controls keep their label, reduce opacity to 40 or 60 percent as existing components do, and show the correct blocked or waiting cursor.

- **Paragraph card:** compose a `story-surface` card with a `story-line` border, 16px radius, 16px padding rising to 20px where space permits, serif scene heading, and the existing reading-copy scale. Preserve the scene rail and terracotta dot when paragraphs remain part of a sequence. Selected or bookmarked paragraphs may use the accent wash and accent rule, never a new fill.
- **Repeatable date-history control:** render repeated date choices as one labeled group of 44px minimum-height buttons. Use stone or story surfaces by default, the existing inactive hover treatment, a visible focus ring, and accent wash plus ink for the selected date. Mark selection with `aria-pressed` or `aria-current="date"`. Keep dates tabular, allow wrapping or horizontal scrolling on narrow screens, and expose loading, empty-history, unavailable, and offline states without shifting the group.
- **Progress indicator:** reuse `StoryCourseProgress`: an 8px-high rounded track, tabular completed and total values, and a terracotta or existing red fill. Supply `role="progressbar"`, min, max, current value, and human-readable value text. When no total exists, replace the bar with a `role="status"` message.
- **Bookmark control:** use one unified 44px square icon target for paragraph favorites, placed immediately after the scene-title text in the same compact row. Render the supplied star geometry without a text label: outlined in the unselected state, filled in the selected state. The unselected state is a bordered story-surface control with muted ink; hover strengthens the rule; selected uses accent wash and accent ink. Expose state with `aria-pressed`, an action-oriented accessible name, and a matching title tooltip. Saving keeps the same geometry and dimensions while using the existing waiting cursor and 60 percent opacity. A save failure keeps the prior confirmed state and announces an adjacent alert.
- **Target-word and gloss toggle:** preserve the current target chip anatomy: 6px radius, compact horizontal padding, semibold English word, accent wash, ink text, and an inset 1px accent rule. Keep each English word and gloss as one non-wrapping `inline-flex` group where feasible. Its line box must contribute the full 40px control height plus 8px on each block edge, while 8px on each inline edge keeps neighboring text and target groups apart. Use an 8px internal gap so the target inset rule and gloss border remain visibly separate. The gloss uses Inter at `text-xs`. Hidden gloss controls remain real buttons with at least a 40px by 96px target, dashed accent or amber border, `aria-expanded`, and `aria-pressed` when pinned. Keep padding, border, width, and wrapping identical across states: permanently render both labels in one CSS grid cell so the larger intrinsic label determines the stable box, then toggle only their opacity over 200ms and remove that transition for reduced motion. Hidden labels must also be hidden from assistive technology. Hover and focus may preview; click pins. Hidden, previewed, pinned, disabled, and unavailable states must be visually distinct and named for assistive technology.
- **Story step and action controls:** active steps use accent wash, inactive steps use muted ink and gain page background plus ink on hover, and locked steps retain their place at 40 percent opacity. Primary actions use the existing deep red treatment; secondary actions use bordered stone or semantic amber and emerald treatments.
- **Offline states:** keep readable cached story content visible. Present a bordered status surface using existing stone and amber roles, with a concise `role="status"` message. Disable only actions that require a network save, label them as unavailable offline, and preserve locally confirmed bookmark, reveal, selection, and reading state. Failed synchronization becomes `role="alert"`; retry uses the existing secondary-button anatomy. Don't imply that unsaved progress or favorites were stored.

## 6. Motion

Motion is restrained and functional. Use the existing 200ms transition cadence for color, border, shadow, opacity, and transform changes. Course cards may rise by 2px on hover and move from subtle to medium shadow, matching `StoryCourseList`. Progress fill may transition its width. Reveals, selected states, loading states, and offline recovery should change without decorative movement.

Respect `prefers-reduced-motion`: remove translation and width animation while keeping the final state immediate and clear. Never animate layout around reading text, and never use motion as the only signal of selection, completion, or error.

## 7. Depth

Depth comes from borders first, then restrained shadow. Standard cards use a 1px stone or story rule with `shadow-sm`; hoverable course cards may reach `shadow-md`. The step navigation alone uses the existing `shadow-lg` with a low-opacity stone shadow. Dark mode generally removes card shadow and depends on surface contrast plus borders.

Use dashed borders for latent or unavailable content such as empty courses, hidden glosses, and later reinforcement. Use inset 1px accent rules for target words. Avoid stacked shadows, glass effects, gradients, and borderless floating surfaces.

## 8. Accessibility And Debt

WCAG 2.2 AA is the release floor. Text and interactive-state colors must meet AA contrast in both themes. Interactive targets must meet the AA minimum of 24 by 24px; standard controls remain at the shipped 44px minimum, while the compact gloss control remains 40 by 96px. Keyboard users must reach every action in a logical order and receive a visible 2px focus ring that is not clipped. Selected, expanded, pressed, current, locked, loading, success, error, empty, and offline states need text or semantic attributes in addition to color.

Use semantic headings in order, labeled `nav`, `section`, `article`, `fieldset`, tables with scoped headers, and native buttons and links. Status updates use `role="status"`; save and synchronization failures use `role="alert"`. Progress, dates, bookmarks, and gloss controls expose their values through ARIA. Horizontal tables and date history must remain keyboard-scrollable, and truncation must not hide the only accessible label.

Known debt stays explicit: the serif family is the Tailwind default rather than a loaded project font; several shipped controls rely on Tailwind utility colors outside the story token set; some existing transitions don't declare a duration; and the wide Step4 table requires horizontal scrolling. This contract doesn't resolve those items. New components should not expand that debt, and any later change to tokens or component behavior must update this file before implementation.
