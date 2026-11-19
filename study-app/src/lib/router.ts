import { useSyncExternalStore } from "react";

export interface Route {
  parts: string[];
  query: URLSearchParams;
  raw: string;
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const [path, qs] = raw.split("?");
  return { parts: path.split("/").filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs ?? ""), raw };
}

let current = parse();
const listeners = new Set<() => void>();
window.addEventListener("hashchange", () => {
  current = parse();
  for (const l of listeners) l();
});

export function useRoute(): Route {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export function navigate(href: string, replace = false) {
  const h = href.startsWith("#") ? href : `#${href}`;
  if (replace) {
    history.replaceState(null, "", h);
    current = parse();
    for (const l of listeners) l();
  } else {
    window.location.hash = h;
  }
}
