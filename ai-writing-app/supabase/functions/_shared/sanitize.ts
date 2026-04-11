export function sanitizeRewriteOutput(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let s = raw.trim();
  if (!s) return "";

  const fence = /^```(?:[\w+-]*)?\n?([\s\S]*?)\n?```$/;
  const fm = s.match(fence);
  if (fm) s = fm[1]!.trim();

  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/\*([^*]+)\*/g, "$1");
  s = s.replace(/__([^_]+)__/g, "$1");
  for (let i = 0; i < 4; i++) {
    s = s.replace(/(^|\s)_([^_\n]+)_(\s|$)/g, "$1$2$3");
  }

  s = s.replace(/\\\(([\s\S]*?)\\\)/g, "$1");
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, "$1");
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, "$1");
  s = s.replace(/\$([^$\n]+)\$/g, "$1");

  let prev = "";
  for (let i = 0; i < 8 && prev !== s; i++) {
    prev = s;
    s = s.replace(/\\[a-zA-Z]+\{([^}]*)\}/g, "$1");
  }
  s = s.replace(/\\[a-zA-Z]+(?:\[[^\]]*\])?/g, "");

  s = s.replace(/[*`]/g, "");
  s = s.replace(/[ \t]+\n/g, "\n");
  s = s.replace(/\n[ \t]+/g, "\n");
  s = s.replace(/[ \t]{2,}/g, " ");
  return s.trim();
}
