// Markdown + LaTeX maths ($…$, $$…$$, \(…\), \[…\]) → safe HTML.
import DOMPurify from "dompurify";
import katex from "katex";
import { Marked } from "marked";

function renderMath(tex: string, display: boolean) {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false, output: "html", strict: "ignore" });
  } catch {
    return `<code>${tex.replace(/</g, "&lt;")}</code>`;
  }
}

const marked = new Marked({ gfm: true, breaks: true });

marked.use({
  extensions: [
    {
      name: "mathBlock",
      level: "block",
      start(src: string) {
        const m = src.match(/\$\$|\\\[/);
        return m ? m.index : undefined;
      },
      tokenizer(src: string) {
        const m = src.match(/^\$\$([\s\S]+?)\$\$/) || src.match(/^\\\[([\s\S]+?)\\\]/);
        if (m) return { type: "mathBlock", raw: m[0], text: m[1].trim() };
        return undefined;
      },
      renderer(token) {
        return `<div class="math-block">${renderMath(token.text as string, true)}</div>`;
      },
    },
    {
      name: "mathInline",
      level: "inline",
      start(src: string) {
        const m = src.match(/\$|\\\(/);
        return m ? m.index : undefined;
      },
      tokenizer(src: string) {
        const m =
          src.match(/^\$\$([^$]+?)\$\$/) ||
          src.match(/^\$(?!\s)((?:\\\$|[^$\n])+?)(?<!\s)\$(?!\d)/) ||
          src.match(/^\\\(([\s\S]+?)\\\)/);
        if (m) return { type: "mathInline", raw: m[0], text: m[1], display: m[0].startsWith("$$") };
        return undefined;
      },
      renderer(token) {
        return renderMath(token.text as string, Boolean(token.display));
      },
    },
  ],
});

const cache = new Map<string, string>();

export function renderMarkdown(src: string): string {
  const hit = cache.get(src);
  if (hit !== undefined) return hit;
  const html = DOMPurify.sanitize(marked.parse(src ?? "", { async: false }) as string, {
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["style", "form", "input", "iframe"],
  });
  if (cache.size > 500) cache.clear();
  cache.set(src, html);
  return html;
}
