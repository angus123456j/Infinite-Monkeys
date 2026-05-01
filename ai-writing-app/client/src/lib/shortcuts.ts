export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return true;
  const p = (navigator as any).userAgentData?.platform;
  const platform = typeof p === "string" ? p : navigator.platform;
  const ua = navigator.userAgent || "";
  return /mac|iphone|ipad|ipod/i.test(platform) || /mac os x|iphone|ipad|ipod/i.test(ua);
}

export function modKeyLabel(): "Cmd" | "Ctrl" {
  return isApplePlatform() ? "Cmd" : "Ctrl";
}

export function shortcut(label: string): string {
  return `${modKeyLabel()}+${label}`;
}

