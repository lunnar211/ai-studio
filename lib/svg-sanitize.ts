// Strict server-side SVG sanitizer (whitelist only).
// Allowed tags and attributes are fixed below. Everything else — script,
// foreignObject, event handlers (on*), href/xlink, style elements, external
// references, data: and javascript: values — is stripped. Output that does
// not contain a valid <svg> root is rejected by the caller.

const ALLOWED_TAGS = new Set([
  "svg", "g", "path", "circle", "rect", "ellipse", "polygon", "polyline",
  "line", "defs", "lineargradient", "radialgradient", "stop",
]);

const ALLOWED_ATTRS = new Set([
  "viewbox", "width", "height", "fill", "stroke", "stroke-width", "d",
  "cx", "cy", "r", "x", "y", "x1", "y1", "x2", "y2", "points", "opacity",
  "transform", "offset", "stop-color", "gradientunits", "id",
  "stroke-linecap", "stroke-linejoin", "fill-rule", "clip-rule",
]);

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
    const isClose = m[0].startsWith("</");
    const rawName = m[1].toLowerCase().replace(/^.*:/, "");
    const selfClosing = m[0].endsWith("/>");
    if (!ALLOWED_TAGS.has(rawName)) {
      // Drop the tag but keep scanning; disallowed content tags (script,
      // foreignObject, style, text, image, use, a) are removed wholesale
      // by skipping everything until their close tag below.
      if (!isClose && !selfClosing && ["script", "foreignobject", "style", "text", "image", "use", "a", "iframe", "object", "embed", "animate"].includes(rawName)) {
        const closeRe = new RegExp(`</${m[1]}\\s*>`, "i");
        const rest = input.slice(tagRe.lastIndex);
        const closeMatch = rest.match(closeRe);
        if (closeMatch && closeMatch.index !== undefined) {
          tagRe.lastIndex += closeMatch.index + closeMatch[0].length;
        }
      }
      continue;
    }
    if (isClose) {
      if (openStack.length && openStack[openStack.length - 1] === rawName) {
        openStack.pop();
        out.push(`</${rawName}>`);
        if (rawName === "svg") svgClosed = true;
        depth -= 1;
      }
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
    void lastIndex;
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
