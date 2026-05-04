import { useEffect } from "react";

type SeoProps = {
  title: string;
  description?: string;
  /** Absolute canonical URL (preferred). If omitted, uses `https://www.infinitemonkeys.world` + current path. */
  canonicalUrl?: string;
  /**
   * Set `noindex` for private/auth pages you don't want indexed.
   * Defaults to "index,follow".
   */
  robots?: "index,follow" | "noindex,nofollow" | "noindex,follow";
};

function upsertMeta(name: string, content: string) {
  const head = document.head;
  if (!head) return;

  let el = head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  const head = document.head;
  if (!head) return;

  let el = head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export default function Seo({ title, description, canonicalUrl, robots }: SeoProps) {
  useEffect(() => {
    document.title = title;

    if (description) {
      upsertMeta("description", description);
      // Keep OG description aligned for nicer sharing.
      const head = document.head;
      const og = head?.querySelector<HTMLMetaElement>('meta[property="og:description"]');
      if (og) og.setAttribute("content", description);
    }

    const canonical =
      canonicalUrl ??
      `https://www.infinitemonkeys.world${window.location.pathname || "/"}`;
    upsertLink("canonical", canonical);

    upsertMeta("robots", robots ?? "index,follow");
  }, [title, description, canonicalUrl, robots]);

  return null;
}

