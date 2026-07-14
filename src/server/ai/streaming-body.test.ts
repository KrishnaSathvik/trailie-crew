import { describe, expect, it } from "vitest";

import { StructuredBodyExtractor } from "./streaming-body";

describe("safe structured body streaming", () => {
  it("emits only decoded body text and never envelope metadata", () => {
    const extractor = new StructuredBodyExtractor();
    const chunks = [
      '{"responseType":"plain_answer","bo',
      'dy":"Drive \\"early\\"',
      '.","title":"Secret"}',
    ];
    const output = chunks.map((chunk) => extractor.push(chunk)).join("");
    expect(output).toBe('Drive "early".');
    expect(output).not.toContain("responseType");
    expect(output).not.toContain("Secret");
  });

  it("decodes escaped newlines across chunk boundaries", () => {
    const extractor = new StructuredBodyExtractor();
    expect(extractor.push('{"body":"Line one\\')).toBe("Line one");
    expect(extractor.push('nLine two"}')).toBe("\nLine two");
  });
});
