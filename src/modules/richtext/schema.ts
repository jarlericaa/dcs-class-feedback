import type { Schema } from "hast-util-sanitize";

/**
 * The sanitize allowlist for all rich staff-authored content
 * (docs/product/specification.md §5.2, §11).
 *
 * Written out explicitly rather than spread from `defaultSchema`, because a
 * default that gains a tag in a future release would silently widen what a
 * teacher can inject into a student's page. Everything here was added on
 * purpose; anything absent is dropped.
 *
 * Notable refusals:
 * - no `style`, `id`, `class` (except the two allowlisted `className` cases), and
 *   no `data-*`: a prompt must not be able to restyle or reposition the page, or
 *   collide with an element id the app relies on;
 * - `src` is **https only** — no `data:` (which can carry SVG containing script
 *   in some contexts) and no `http:` (which would break the page's security
 *   context and leak the referrer);
 * - no `h1`/`h2`: those are downgraded before sanitizing so a prompt cannot
 *   outrank the page's own heading structure and confuse a screen reader.
 */
export const SAFE_SCHEMA: Schema = {
  strip: ["script", "style", "iframe", "object", "embed", "form", "input"],
  allowComments: false,
  allowDoctypes: false,
  // `clobber` is empty because `id`/`name` are not allowed at all, so there is
  // nothing to prefix.
  clobber: [],
  clobberPrefix: "",
  protocols: {
    href: ["http", "https", "mailto"],
    src: ["https"],
  },
  tagNames: [
    "p",
    "br",
    "hr",
    "strong",
    "em",
    "del",
    "code",
    "pre",
    "blockquote",
    "ul",
    "ol",
    "li",
    "h3",
    "h4",
    "h5",
    "h6",
    "a",
    "img",
    "span",
    "sup",
    "sub",
    "kbd",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ],
  attributes: {
    a: ["href", "title"],
    img: ["src", "alt", "title", "width", "height"],
    // A literal allowlist: hast-util-sanitize takes no patterns, so each
    // supported language is named. An unlisted language simply renders as
    // unhighlighted code rather than being rejected.
    code: [
      [
        "className",
        /*
         * remark-math emits inline math as `<code class="language-math
         * math-inline">` and display math as `<pre><code class="language-math
         * math-display">`. These three MUST be allowlisted or sanitizing strips
         * the class, rehype-katex no longer recognizes the node, and every
         * formula silently renders as inline code instead of maths.
         */
        "language-math",
        "math-inline",
        "math-display",
        "language-text",
        "language-plaintext",
        "language-bash",
        "language-sh",
        "language-c",
        "language-cpp",
        "language-java",
        "language-js",
        "language-javascript",
        "language-ts",
        "language-typescript",
        "language-python",
        "language-sql",
        "language-json",
        "language-html",
        "language-css",
        "language-haskell",
        "language-diff",
      ],
    ],
    // KaTeX's own wrapper classes, plus the remark-math markers.
    span: [["className", "math", "math-inline", "math-display", "katex", "katex-display"]],
    pre: [["className", "math", "math-display"]],
    th: ["scope"],
    "*": [],
  },
  required: {},
};

export const KATEX_OPTIONS = {
  output: "htmlAndMathml" as const,
  throwOnError: false,
  strict: "ignore" as const,
  /**
   * `trust: false` disables \href, \url, \includegraphics and friends, so LaTeX
   * cannot smuggle a link or a remote fetch past the sanitizer that already ran.
   */
  trust: false,
  /** Bounds a `\def`-based expansion bomb. */
  maxExpand: 1000,
  maxSize: 50,
  errorColor: "#b42318",
};
