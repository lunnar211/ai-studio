// Strict server-side SVG sanitizer (whitelist only).
// Allowed tags and attributes are fixed below. Everything else — script,
// foreignObject, event handlers (on*), href/xlink, style elements, external
// references, data: and javascript: values — is stripped. Output that does
// not contain a valid <svg> root is rejected by the caller.
//
// <text> IS allowed (brand names in logos): only safe attributes, and the
// text content itself is copied only when it sits inside a <text> element.
// Text nodes are length-capped and entity-escaped; nested markup inside
// <text> is dropped, never rendered.

const ALLOWED_TAGS = new Set([
  "svg", "g", "path", "circle", "rect", "ellipse", "polygon", "polyline",
  "line", "defs", "lineargradient", "radialgradient", "stop", "text",
]);

const ALLOWED_ATTRS = new Set([
  "viewbox", "width", "height", "fill", "stroke", "stroke-width", "d",
  "cx", "cy", "r", "x", "y", "x1", "y1", "x2", "y2", "points", "opacity",
  "transform", "offset", "stop-color", "gradientunits", "id",
  "stroke-linecap", "stroke-linejoin", "fill-rule", "clip-rule",
  "font-family", "font-size", "font-weight", "text-anchor",
]);

// Max characters kept from a single <text> node (brand names are short;
// this stops a model stuffing paragraphs into a logo).
const MAX_TEXT_NODE = 120;

function escapeText(s: string): string {
  return s
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const VOID_TAGS = new Set(["circle", "rect", "ellipse", "line", "stop"]);

function safeAttrValue(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v.includes("javascript:") || v.includes("data:") || v.includes("vbscript:")) return false;
  if (v.includes("http://") || v.includes("https://") || v.includes("//")) return false;
  // url() references are only allowed for internal gradient ids.
  if (v.includes("url(") && !/^url\(#[a-z0-9_-]+\)$/i.test(v.trim())) return false;
  if (v.includes("<") || v.includes(">")) return false;
  return true;
}

export function extractSvgRoot(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;
  // Strip a fenced code block if the model wrapped the SVG in one.
  let text = raw.trim();
  const fence = text.match(/```(?:svg|xml)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.search(/<svg[\s>]/i);
  if (start === -1) return null;
  const end = text.lastIndexOf("</svg>");
  if (end === -1) {
    // Self-closing svg is not a usable logo; reject.
    return null;
  }
  return text.slice(start, end + "</svg>".length);
}

export function sanitizeSvg(raw: string): string | null {
  const root = extractSvgRoot(raw);
  if (!root) return null;
  // Remove comments and CDATA entirely.
  let input = root.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  const out: string[] = [];
  const tagRe = /<\/?([a-zA-Z][\w:-]*)((?:\s+[^<>]*)?)\/?>/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let depth = 0;
  let sawSvg = false;
  let svgClosed = false;
  const openStack: string[] = [];
  while ((m = tagRe.exec(input)) !== null) {
    // Copy safe text nodes that sit inside a <text> element. Text anywhere
    // else (whitespace, stray model chatter) is discarded, never rendered.
    const gap = input.slice(lastIndex, m.index);
    if (openStack.length && openStack[openStack.length - 1] === "text" && gap.trim()) {
      out.push(escapeText(gap.slice(0, MAX_TEXT_NODE)));
    }
    const isClose = m[0].startsWith("</");
    const rawName = m[1].toLowerCase().replace(/^.*:/, "");
    const selfClosing = m[0].endsWith("/>");
    if (!ALLOWED_TAGS.has(rawName)) {
      // Drop the tag but keep scanning; disallowed content tags (script,
      // foreignObject, style, image, use, a) are removed wholesale
      // by skipping everything until their close tag below.
      if (!isClose && !selfClosing && ["script", "foreignobject", "style", "image", "use", "a", "iframe", "object", "embed", "animate"].includes(rawName)) {
        const closeRe = new RegExp(`</${m[1]}\\s*>`, "i");
        const rest = input.slice(tagRe.lastIndex);
        const closeMatch = rest.match(closeRe);
        if (closeMatch && closeMatch.index !== undefined) {
          tagRe.lastIndex += closeMatch.index + closeMatch[0].length;
        }
      }
      lastIndex = tagRe.lastIndex;
      continue;
    }
    if (isClose) {
      if (openStack.length && openStack[openStack.length - 1] === rawName) {
        openStack.pop();
        out.push(`</${rawName}>`);
        if (rawName === "svg") svgClosed = true;
        depth -= 1;
      }
      lastIndex = tagRe.lastIndex;
      continue;
    }
    // Opening tag: filter attributes.
    const attrRe = /([a-zA-Z:-]+)\s*=\s*"([^"]*)"|([a-zA-Z:-]+)\s*=\s*'([^']*)'/g;
    const kept: string[] = [];
    let am: RegExpExecArray | null;
    const attrSrc = m[2] || "";
    while ((am = attrRe.exec(attrSrc)) !== null) {
      const name = (am[1] || am[3]).toLowerCase();
      const value = am[2] !== undefined ? am[2] : am[4];
      if (!ALLOWED_ATTRS.has(name)) continue;
      if (!safeAttrValue(value)) continue;
      const escaped = value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
      kept.push(`${name}="${escaped}"`);
    }
    if (rawName === "svg") {
      sawSvg = true;
      // Force a sane, bounded canvas.
      if (!kept.some((a) => a.startsWith("viewbox="))) kept.push('viewBox="0 0 512 512"');
      if (!kept.some((a) => a.startsWith("width="))) kept.push('width="512"');
      if (!kept.some((a) => a.startsWith("height="))) kept.push('height="512"');
    }
    // Note: attribute names were lowercased; restore camelCase for viewBox.
    const fixed = kept.map((a) =>
      a.startsWith("viewbox=") ? a.replace("viewbox=", "viewBox=") : a
    );
    if (VOID_TAGS.has(rawName) || selfClosing) {
      out.push(`<${rawName}${fixed.length ? " " + fixed.join(" ") : ""} />`);
    } else {
      out.push(`<${rawName}${fixed.length ? " " + fixed.join(" ") : ""}>`);
      openStack.push(rawName);
      depth += 1;
    }
    lastIndex = tagRe.lastIndex;
    void depth;
  }
  if (!sawSvg) return null;
  // Close anything left open (but never emit a second </svg>).
  while (openStack.length) {
    const t = openStack.pop();
    if (t !== "svg") out.push(`</${t}>`);
  }
  if (!svgClosed) out.push("</svg>");
  const result = out.join("");
  if (!result.includes("<svg") || !result.includes("</svg>")) return null;
  return result;
}
