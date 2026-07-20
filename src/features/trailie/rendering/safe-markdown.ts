const dangerousLink =
  /\[([^\]]+)\]\(\s*(?:javascript|data|vbscript):(?:[^()]|\([^)]*\))*\)/giu;
const markdownLink = /\[([^\]]+)\]\(([^)\s]+)\)/gu;

export function sanitizeTrailieMarkdown(value: string) {
  return value
    .replace(/<\/?[a-z][^>]*>/giu, "")
    .replace(dangerousLink, "$1")
    .replace(markdownLink, (match, label: string, rawUrl: string) => {
      try {
        const url = new URL(rawUrl);
        return url.protocol === "https:"
          ? `[${label}](${url.toString()})`
          : label;
      } catch {
        return label;
      }
    })
    .replace(/\0/gu, "")
    .trim();
}
