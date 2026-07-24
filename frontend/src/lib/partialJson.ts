/**
 * Best-effort parsing of *streaming* JSON — the head of an object the model is
 * still writing. Close any open strings/brackets and parse the largest valid
 * prefix, so the UI can fill in live as tokens arrive. Shared by the CV import
 * and the writing-voice learning flows.
 */

function closeAndParse(prefix: string): unknown {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < prefix.length; i++) {
    const ch = prefix[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") {
      if (!stack.length) return undefined;
      stack.pop();
    }
  }
  let out = prefix;
  if (inStr) out += '"';
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i];
  try {
    return JSON.parse(out);
  } catch {
    return undefined;
  }
}

/** Parse the largest valid object prefix of a partial JSON string, or null. */
export function parsePartial(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;
  const s = raw.slice(start);
  const floor = Math.max(1, s.length - 600);
  for (let end = s.length; end >= floor; end--) {
    const v = closeAndParse(s.slice(0, end));
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  }
  return null;
}
