import { describe, expect, it } from "vitest";
import {
  MAX_SOURCE_CHARS,
  renderRichText,
  richTextToPlain,
} from "@/modules/richtext/render";

/**
 * The renderer is the only place HTML reaches a student's DOM, so these tests
 * are the security boundary for docs/product/specification.md §11 ("rich content is sanitized
 * to prevent script injection"). Each case is an attack that must fail closed.
 */
describe("renderRichText — injection", () => {
  it("drops a literal <script> tag entirely", async () => {
    const html = await renderRichText('Hello <script>alert("x")</script> there');
    expect(html).not.toContain("<script");
    // The tag is gone; its inner text survives as ordinary escaped text, which
    // is inert. That is the correct outcome — dropping the text as well would
    // silently eat a teacher's prose that merely mentioned a script.
    expect(html).toContain("Hello");
  });

  it("drops inline event handlers", async () => {
    const html = await renderRichText('<img src=x onerror="alert(1)">');
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("alert(1)");
  });

  it("drops an iframe, object and form", async () => {
    const html = await renderRichText(
      '<iframe src="https://evil.test"></iframe><object data="x"></object><form action="/x"><input name="y"></form>',
    );
    for (const tag of ["<iframe", "<object", "<form", "<input"]) {
      expect(html).not.toContain(tag);
    }
  });

  it("refuses a javascript: link", async () => {
    const html = await renderRichText("[click](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
  });

  it("refuses a data: image and an http: image", async () => {
    const dataUri = await renderRichText(
      "![x](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)",
    );
    expect(dataUri).not.toContain("data:image");
    const insecure = await renderRichText("![x](http://evil.test/a.png)");
    expect(insecure).not.toContain("http://evil.test");
  });

  it("keeps an https image and hardens it against referrer leakage", async () => {
    const html = await renderRichText("![diagram](https://cdn.example.edu/a.png)");
    expect(html).toContain("https://cdn.example.edu/a.png");
    expect(html).toContain('referrerpolicy="no-referrer"');
    expect(html).toContain('loading="lazy"');
  });

  it("strips style, id and arbitrary class attributes", async () => {
    const html = await renderRichText(
      '<p style="position:fixed" id="main" class="evil">x</p>',
    );
    expect(html).not.toContain("style=");
    expect(html).not.toContain('id="main"');
    expect(html).not.toContain("evil");
  });

  it("never throws on hostile or malformed input", async () => {
    for (const source of ["<<<>>>", "$$\\def\\x{\\x}\\x$$", "[".repeat(500)]) {
      await expect(renderRichText(source)).resolves.toBeTypeOf("string");
    }
  });
});

describe("renderRichText — supported content", () => {
  it("renders markdown emphasis, lists and blockquotes", async () => {
    const html = await renderRichText(
      "**bold** and _italic_\n\n- one\n- two\n\n> quoted",
    );
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<blockquote>");
  });

  it("renders a fenced code block and keeps only an allowlisted language class", async () => {
    const ok = await renderRichText("```python\nprint(1)\n```");
    expect(ok).toContain("<pre>");
    expect(ok).toContain("language-python");
    const unknown = await renderRichText("```wat\nx\n```");
    expect(unknown).toContain("<code");
    expect(unknown).not.toContain("language-wat");
  });

  it("renders a GFM table", async () => {
    const html = await renderRichText("| a | b |\n| - | - |\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<td>1</td>");
  });

  it("typesets inline and display LaTeX", async () => {
    const inline = await renderRichText("mass is $E = mc^2$ here");
    expect(inline).toContain("katex");
    const display = await renderRichText("$$\\int_0^1 x^2\\,dx$$");
    expect(display).toContain("katex");
  });

  it("renders \\href inert because KaTeX runs untrusted", async () => {
    const html = await renderRichText("$\\href{javascript:alert(1)}{x}$");
    // With `trust: false` KaTeX refuses the command and renders an error. The
    // literal source text still appears inside the MathML <annotation>, which is
    // inert — what must never happen is a real link, so assert on that rather
    // than on the substring.
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("href=");
    expect(html).toContain("katex");
  });

  it("hardens outbound links", async () => {
    const html = await renderRichText("[docs](https://example.edu/docs)");
    expect(html).toContain('rel="nofollow noopener noreferrer ugc"');
    expect(html).toContain('target="_blank"');
  });

  it("demotes h1/h2 so a prompt cannot outrank the page heading", async () => {
    const html = await renderRichText("# Title\n\n## Sub");
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<h2");
    expect(html).toContain("<h3");
    expect(html).toContain("<h4");
  });

  it("truncates rather than rejecting an over-long source", async () => {
    const html = await renderRichText("a".repeat(MAX_SOURCE_CHARS + 500));
    expect(html).toContain("truncated");
  });

  it("returns an empty string for empty input", async () => {
    expect(await renderRichText(null)).toBe("");
    expect(await renderRichText("")).toBe("");
  });

  it("is stable across repeated calls (memoized)", async () => {
    const source = "# Cached\n\n$x^2$";
    expect(await renderRichText(source)).toBe(await renderRichText(source));
  });
});

describe("richTextToPlain", () => {
  it("strips markdown syntax for exports and email bodies", () => {
    expect(richTextToPlain("**Bold** [link](https://x.test) `code`")).toBe(
      "Bold link code",
    );
  });

  it("replaces code blocks and math with neutral placeholders", () => {
    expect(richTextToPlain("```\nsecret\n```")).toBe("[code]");
    expect(richTextToPlain("$$x^2$$")).toBe("[math]");
  });

  it("never emits angle brackets", () => {
    expect(richTextToPlain("# Heading\n\n<b>x</b>")).not.toContain("<");
  });
});
