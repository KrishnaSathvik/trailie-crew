import type { MessageType, TrailieInvocationDecision } from "@trailie/schemas";

type ApplicationAction = "answer_question";

type InvocationInput = {
  body: string;
  replyTargetType?: MessageType | null;
  applicationAction?: ApplicationAction | null;
};

const clarification = "Ask what help the crew needs.";

function maskNonProseMarkdown(body: string) {
  let fenced = false;
  return body
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        return "";
      }
      if (fenced || /^\s*>/.test(line)) return "";
      return line.replace(/`[^`\n]*`/g, "");
    })
    .join("\n");
}

function cleanRequest(value: string) {
  const cleaned = value
    .replace(/(^|\s)@trailie(?=$|[\s.,!?;:])/gi, "$1")
    .replace(/^\s*(?:hey\s+)?trailie\s*[,;:!?-]?\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/^\s*[,;:!?-]+\s*/, "")
    .trim();
  return cleaned || clarification;
}

export function detectTrailieInvocation(
  input: InvocationInput,
): TrailieInvocationDecision {
  const original = input.body.trim();
  if (input.applicationAction === "answer_question") {
    return {
      invoked: true,
      invocationType: "application_action",
      normalizedRequest: cleanRequest(original),
    };
  }
  if (input.replyTargetType === "trailie" && original) {
    return {
      invoked: true,
      invocationType: "reply_to_trailie",
      normalizedRequest: original,
    };
  }

  const prose = maskNonProseMarkdown(original);
  const direct = prose.match(/^\s*(?:hey\s+)?trailie\s*[,;:!?-]\s*([\s\S]*)$/i);
  if (direct) {
    return {
      invoked: true,
      invocationType: "direct_address",
      normalizedRequest: cleanRequest(direct[1]),
    };
  }

  const mention = prose.match(/(^|\s)@trailie(?=$|[\s.,!?;:])/i);
  if (!mention || mention.index === undefined) return { invoked: false };
  if (mention.index > 0 && prose.slice(0, mention.index).trim().length > 0)
    return { invoked: false };

  return {
    invoked: true,
    invocationType: "explicit_mention",
    normalizedRequest: cleanRequest(prose),
  };
}
