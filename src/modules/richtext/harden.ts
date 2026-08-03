import type { Element, Root } from "hast";
import type { Root as MdastRoot } from "mdast";
import { visit } from "unist-util-visit";

/**
 * Post-sanitize hardening.
 *
 * These attributes are ADDED after sanitizing rather than allowlisted, because
 * allowlisting `rel` and `target` would also let an author set them to something
 * weaker. Setting them here means the safe values always win.
 */

const SAFE_HREF = /^(https?:|mailto:)/i;

export function hardenLinks() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "a") return;
      const href = node.properties?.href;
      // Re-assert the protocol: cheap, and it means a future schema slip cannot
      // turn into a javascript: link.
      if (typeof href !== "string" || !SAFE_HREF.test(href.trim())) {
        delete node.properties?.href;
        return;
      }
      node.properties = {
        ...node.properties,
        // hast models space-separated tokens as an array.
        rel: ["nofollow", "noopener", "noreferrer", "ugc"],
        target: "_blank",
      };
    });
  };
}

export function hardenImages() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "img") return;
      const src = node.properties?.src;
      if (typeof src !== "string" || !/^https:/i.test(src.trim())) {
        // Drop the element entirely rather than render a broken image that
        // still triggers a request.
        node.tagName = "span";
        node.properties = {};
        node.children = [];
        return;
      }
      node.properties = {
        ...node.properties,
        loading: "lazy",
        decoding: "async",
        // An externally hosted image must not learn the authenticated URL the
        // student is viewing.
        referrerPolicy: "no-referrer",
      };
    });
  };
}

/**
 * Demote `#`/`##` to `###`/`####` BEFORE sanitizing.
 *
 * Every page already owns its `h1` and `h2`. A prompt that emitted an `h1` would
 * break the document outline a screen-reader user navigates by, so the levels are
 * shifted rather than the tags being dropped (which would lose the structure).
 */
export function demoteHeadings() {
  return (tree: MdastRoot) => {
    visit(tree, "heading", (node) => {
      node.depth = Math.min(6, node.depth + 2) as 1 | 2 | 3 | 4 | 5 | 6;
    });
  };
}
