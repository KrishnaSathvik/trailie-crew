export function itineraryTerminalError(state: {
  status: string;
  error_code: string | null;
}) {
  if (state.status === "published") return null;
  if (state.status === "blocked") return "itinerary_validation_blocked";
  if (state.status === "failed") return state.error_code ?? "itinerary_failed";
  return "itinerary_incomplete";
}
