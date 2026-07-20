import { sanitizeTrailieMarkdown } from "@/features/trailie/rendering/safe-markdown";

const internalContent =
  /\b(?:chain[- ]of[- ]thought|hidden (?:prompt|reasoning)|internal reasoning|private memory|ignore (?:the |your )?(?:system|developer) (?:prompt|instructions)|reveal (?:api keys?|secrets?))\b/i;

function safeVisibleSegment(value: string) {
  const trailingWhitespace = value.match(/\s+$/u)?.[0] ?? "";
  const sanitized = sanitizeTrailieMarkdown(value);
  return sanitized ? `${sanitized}${trailingWhitespace}` : "";
}

function readableBoundary(value: string) {
  let boundary = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\n") {
      boundary = index + 1;
      continue;
    }
    if (
      (character === "." || character === "?" || character === "!") &&
      /\s/u.test(value[index + 1] ?? "")
    ) {
      boundary = index + 2;
    }
  }
  return boundary;
}

export function createSafeTrailieTextStream() {
  let buffer = "";
  let blocked = false;
  let finished = false;
  return {
    get blocked() {
      return blocked;
    },
    push(delta: string) {
      if (blocked || finished || !delta) return [];
      buffer += delta.replaceAll("\0", "");
      if (internalContent.test(buffer)) {
        buffer = "";
        blocked = true;
        return [];
      }
      const boundary = readableBoundary(buffer);
      if (boundary === 0) return [];
      const visible = safeVisibleSegment(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary);
      return visible ? [visible] : [];
    },
    flushValidated() {
      if (blocked || finished) return "";
      finished = true;
      if (internalContent.test(buffer)) {
        buffer = "";
        blocked = true;
        return "";
      }
      const visible = safeVisibleSegment(buffer);
      buffer = "";
      return visible;
    },
    discard() {
      buffer = "";
      finished = true;
    },
  };
}
