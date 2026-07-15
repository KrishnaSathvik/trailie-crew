export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { status: "ok", service: "trailie-crew" },
    {
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
