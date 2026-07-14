export class StructuredBodyExtractor {
  private searchBuffer = "";
  private state: "search" | "body" | "done" = "search";
  private escaped = false;
  private unicode = "";

  push(chunk: string) {
    if (this.state === "done") return "";
    let source = chunk;
    if (this.state === "search") {
      this.searchBuffer += chunk;
      const match = /"body"\s*:\s*"/.exec(this.searchBuffer);
      if (!match) {
        this.searchBuffer = this.searchBuffer.slice(-32);
        return "";
      }
      source = this.searchBuffer.slice(match.index + match[0].length);
      this.searchBuffer = "";
      this.state = "body";
    }

    let output = "";
    for (const character of source) {
      if (this.unicode) {
        this.unicode += character;
        if (this.unicode.length === 5) {
          const value = Number.parseInt(this.unicode.slice(1), 16);
          if (!Number.isNaN(value)) output += String.fromCharCode(value);
          this.unicode = "";
          this.escaped = false;
        }
        continue;
      }
      if (this.escaped) {
        if (character === "u") {
          this.unicode = "u";
          continue;
        }
        output +=
          (
            { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" } as Record<
              string,
              string
            >
          )[character] ?? character;
        this.escaped = false;
        continue;
      }
      if (character === "\\") {
        this.escaped = true;
      } else if (character === '"') {
        this.state = "done";
        break;
      } else {
        output += character;
      }
    }
    return output;
  }
}
