import { joinTripInputSchema } from "@trailie/schemas";

function decodeRouteValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error("Invite value is malformed.");
  }
}

export function parseInviteValue(input: string): string {
  const value = input.trim();

  if (!value) {
    throw new Error("Invite value is required.");
  }

  if (value.startsWith("/") || /^https?:\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value, "https://trailie.local");
    } catch {
      throw new Error("Invite URL is malformed.");
    }

    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 2 || segments[0] !== "join" || !segments[1]) {
      throw new Error("Invite URL is not a Trailie Crew join link.");
    }

    const routeValue = decodeRouteValue(segments[1]);
    return joinTripInputSchema.shape.inviteValue.parse(routeValue);
  }

  return joinTripInputSchema.shape.inviteValue.parse(value);
}
