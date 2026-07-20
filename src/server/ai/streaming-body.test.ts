import { describe, expect, it } from "vitest";

import { StructuredBodyExtractor } from "./streaming-body";

describe("safe structured body streaming", () => {
  it("emits only decoded body text and never envelope metadata", () => {
    const extractor = new StructuredBodyExtractor("message");
    const chunks = [
      '{"schemaVersion":"1","mes',
      'sage":"Drive \\"early\\"',
      '.","intent":"direct_question"}',
    ];
    const output = chunks.map((chunk) => extractor.push(chunk)).join("");
    expect(output).toBe('Drive "early".');
    expect(output).not.toContain("schemaVersion");
    expect(output).not.toContain("direct_question");
  });

  it("decodes escaped newlines across chunk boundaries", () => {
    const extractor = new StructuredBodyExtractor("message");
    expect(extractor.push('{"message":"Line one\\')).toBe("Line one");
    expect(extractor.push('nLine two"}')).toBe("\nLine two");
  });
});
