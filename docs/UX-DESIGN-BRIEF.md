# UX Design Brief

**Status:** [Recommended] visual direction for owner/design review.
**Superseded for implementation by [DESIGN.md](../DESIGN.md) as of 2026-08-05.**
**Working concept:** a calm academic operations workspace for honest feedback.

> This brief is the origin of the current design, not its specification. The
> implemented system keeps its goals — a calm university product, a warm neutral
> canvas, a restrained green accent, amber for attention, red held back for
> destruction and privacy risk, status never carried by colour alone — and
> resolves the parts it left open. Where the token table below disagrees with
> DESIGN.md, **DESIGN.md is authoritative**: the implemented palette is a matte
> board rather than a near-white canvas, the accent is `#1f6b4a`, and the
> category colour spectrum this brief never asked for has been removed. The
> layout, information-hierarchy, forms, review-queue, privacy-confirmation and
> accessibility sections below all still hold.

## Design goal

The site should feel like a real university product: focused, trustworthy, and
quietly polished. It should not look like a generic AI dashboard, a social
network, or an unstyled admin panel.

The product has two different emotional jobs:

- **Students:** “I can say what I need to say, understand who can see it, and
  finish this quickly.”
- **Teachers:** “I can make sense of this week's feedback, respond responsibly,
  and know what still needs attention.”

## Visual direction

Use a light, warm neutral canvas with deep ink text and a restrained campus-green
accent. Green should signal progress and trust; amber should signal attention;
red should be reserved for destructive or privacy-risk actions.

| Token | Proposed value | Use |
|---|---|---|
| Canvas | `#F5F7F2` | App background |
| Surface | `#FFFFFF` | Cards, forms, panels |
| Ink | `#17231C` | Primary text |
| Muted ink | `#607067` | Supporting text |
| Border | `#DCE5DD` | Dividers and input borders |
| Primary green | `#167A58` | Primary actions, links, positive status |
| Soft green | `#DFF1E6` | Selected states and low-emphasis highlights |
| Amber | `#A96512` | Needs review, pending, scheduled |
| Soft amber | `#FFF0D8` | Warning background |
| Danger | `#B54747` | Destructive action and privacy-risk state |

These values are a starting point, not a locked brand palette. Check contrast
before shipping and keep a neutral/monochrome fallback for print/export views.

## Layout

### Student layout

- Single-column content with a compact top bar.
- Section identity and cycle deadline visible before the form begins.
- Generous vertical spacing between question blocks.
- Sticky or persistent submit action only when it does not obscure content.
- History and Q&A are one tap away from the section home.

### Teacher layout

- Persistent left navigation on desktop; collapsible on smaller screens.
- Main review queue in the center.
- Optional context panel for cycle, student, category, and permission state.
- Filters and counts above the queue, not hidden in a settings drawer.
- Composer stays visually attached to the item being answered.

## Information hierarchy

Every page should answer these questions in order:

1. Where am I? — course, section, and workspace.
2. What needs attention? — cycle state, unanswered items, pending matches.
3. What can I do? — one primary action and a small number of secondary actions.
4. What will happen to visibility? — especially before private/public actions.
5. What happened? — clear success, error, or empty state.

## Components and behavior

### App shell

Use a restrained sidebar with the current section, workspace switcher, and
role-appropriate destinations. Do not expose every future feature as a disabled
menu item; show only available surfaces and a small “coming later” note where
useful.

### Status indicators

Use text + icon + color. Examples:

- `Open · closes Friday, 5:00 PM`
- `Submitted · edits are closed`
- `Needs review · 12 items`
- `Published to this section`
- `Pending identity confirmation`

### Forms

Use visible labels, helper text, required markers, and inline errors. Keep the
student-originated question area visually separate and explain that the
question can be reworded before publication.

### Review queue

Treat the teacher view like an inbox, not a spreadsheet. Each item should show
the minimum context required to decide what happens next, with the original
wording in a read-only block and the public wording in a separate editable
block.

### Privacy confirmation

The publish action should include a compact, plain-language check:

> This answer will be visible to students in this section. The original wording
> stays private, but specific details can still identify the asker. Review the
> public wording before publishing.

## Typography and motion

- Use one legible sans-serif family with a clear hierarchy; system-ui/Inter/
  Geist-style typography is appropriate.
- Use sentence case, short labels, and concrete verbs.
- Keep shadows soft and surfaces mostly flat.
- Use motion only for feedback: submit success, queue updates, drawer opening,
  and validation—not decorative floating elements.

## Avoid

- Purple-on-white “AI product” gradients.
- Excessive glassmorphism, floating blobs, or ornamental dashboards.
- Dense admin tables as the default student experience.
- Social features that are not in the product scope: likes, voting, reactions,
  public identity, or open comments.
- Treating “anonymous” as a vague badge without explaining the audience.
- Hiding all important actions behind three-dot menus.
- Making every role use the same navigation and dashboard.

## Accessibility and trust checklist

- [ ] All inputs have programmatic labels and useful error associations.
- [ ] Keyboard users can reach and understand every action.
- [ ] Focus states are visible on the green/neutral palette.
- [ ] Status is communicated through words/icons, not color alone.
- [ ] Body text and controls meet WCAG contrast expectations.
- [ ] Destructive, irreversible, and visibility-changing actions require clear
      confirmation.
- [ ] Student-facing copy never reveals internal identity or review metadata.
- [ ] Empty states explain what the user can do next.
- [ ] The experience remains usable at small widths and with zoom.

## Inspiration synthesis

Borrow interaction patterns from the products in
[DESIGN-RESEARCH.md](DESIGN-RESEARCH.md), but keep the visual language original:

- Ed Discussion/Piazza → course-scoped Q&A organization.
- Slido/Top Hat → clear anonymous-question handling and triage.
- Watermark → teacher-facing summaries and attention indicators.

Do not copy logos, illustrations, exact layouts, or proprietary copy.
