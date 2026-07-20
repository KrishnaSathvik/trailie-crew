import { createHash, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";

import { revisionItinerary } from "@/features/revisions/test-fixtures";

const hosted = process.env.HOSTED_ACCEPTANCE === "1";
const hostedBaseUrl = process.env.HOSTED_BASE_URL;
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const supabaseSecret = process.env.SUPABASE_SECRET_KEY;
const supabasePublicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabaseUrl = hosted
  ? `https://${process.env.SUPABASE_PROJECT_REF ?? "tkccksmiuucdstvvfglp"}.supabase.co`
  : process.env.NEXT_PUBLIC_SUPABASE_URL;
const workflowTimeout = (local: number, live: number) =>
  hosted ? live : local;

if (
  hosted &&
  (!hostedBaseUrl ||
    !bypassSecret ||
    !supabaseSecret ||
    !supabasePublicKey ||
    !supabaseUrl)
)
  throw new Error("guest_hosted_acceptance_environment_incomplete");

const admin = hosted
  ? createClient(supabaseUrl!, supabaseSecret!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

function appUrl(path: string) {
  return hosted ? new URL(path, hostedBaseUrl).toString() : path;
}

async function scopedContext(
  browser: Browser,
  options: BrowserContextOptions = {},
): Promise<BrowserContext> {
  const context = await browser.newContext(options);
  if (hosted) {
    const response = await context.request.get(hostedBaseUrl!, {
      headers: {
        "x-vercel-protection-bypass": bypassSecret!,
        "x-vercel-set-bypass-cookie": "true",
      },
    });
    expect(response.status()).toBe(200);
  }
  return context;
}

async function send(page: Page, text: string) {
  await page.getByLabel("Message your crew").fill(text);
  await page.getByLabel("Message your crew").press("Enter");
  await expect(
    page.getByLabel("Trip conversation").getByText(text, { exact: true }),
  ).toBeVisible({ timeout: 15_000 });
}

async function openPlan(page: Page) {
  await page.getByRole("button", { name: "Plan" }).first().click();
}

async function memberClient(context: BrowserContext) {
  const sessionCookies = (await context.cookies())
    .filter(
      (cookie) =>
        cookie.name.startsWith("sb-") &&
        cookie.name.includes("-auth-token") &&
        !cookie.name.includes("code-verifier"),
    )
    .sort((left, right) => left.name.localeCompare(right.name));
  const storageState = await context.storageState();
  const storedSession = storageState.origins
    .flatMap((origin) => origin.localStorage)
    .find(
      (entry) =>
        entry.name.startsWith("sb-") &&
        entry.name.includes("-auth-token") &&
        !entry.name.includes("code-verifier"),
    );
  if (sessionCookies.length === 0 && !storedSession?.value)
    throw new Error("hosted_fixture_member_session_unavailable");
  let serialized =
    sessionCookies.length > 0
      ? sessionCookies.map((cookie) => cookie.value).join("")
      : storedSession!.value;
  if (serialized.startsWith("base64-")) {
    serialized = Buffer.from(serialized.slice(7), "base64").toString("utf8");
  } else {
    serialized = decodeURIComponent(serialized);
  }
  const session = JSON.parse(serialized) as
    { access_token?: string } | [string, ...unknown[]];
  const accessToken = Array.isArray(session)
    ? session[0]
    : session.access_token;
  if (!accessToken) throw new Error("hosted_fixture_member_token_unavailable");
  const tokenParts = accessToken.split(".");
  if (tokenParts.length !== 3)
    throw new Error("hosted_fixture_member_token_invalid_shape");
  const claims = JSON.parse(
    Buffer.from(tokenParts[1], "base64url").toString("utf8"),
  ) as { exp?: number; iss?: string };
  if (
    new URL(claims.iss || "https://missing.invalid").hostname !==
    new URL(supabaseUrl!).hostname
  )
    throw new Error("hosted_fixture_member_token_wrong_issuer");
  if (!claims.exp || claims.exp <= Math.floor(Date.now() / 1000))
    throw new Error("hosted_fixture_member_token_expired");
  return createClient(supabaseUrl!, supabasePublicKey!, {
    accessToken: async () => accessToken,
  });
}

async function publishHostedFixture(roomId: string, context: BrowserContext) {
  if (!admin) throw new Error("hosted_fixture_admin_unavailable");
  const member = await memberClient(context);
  await expect
    .poll(
      async () => {
        const result = await member
          .from("planning_requests")
          .select("id,approved_summary_version")
          .eq("room_id", roomId)
          .single();
        if (result.error) throw result.error;
        return result.data?.approved_summary_version ?? null;
      },
      { timeout: 30_000 },
    )
    .toBe(1);
  const { data: request, error: requestError } = await member
    .from("planning_requests")
    .select("id,approved_summary_version")
    .eq("room_id", roomId)
    .single();
  const { data: host, error: hostError } = await member
    .from("participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("role", "host")
    .eq("status", "active")
    .single();
  if (requestError || hostError || !request?.approved_summary_version || !host)
    throw new Error("hosted_fixture_scope_unavailable");

  const itinerary = revisionItinerary();
  const { data: created, error: createError } = await member.rpc(
    "create_itinerary_generation",
    {
      target_planning_request_id: request.id,
      participant_id: host.id,
    },
  );
  const planId = (created as { id?: string } | null)?.id;
  if (createError || !planId)
    throw new Error("hosted_fixture_plan_creation_failed");
  const { error: draftError } = await admin.rpc("record_itinerary_draft", {
    target_trip_plan_id: planId,
    validated_draft: itinerary,
    target_provider_response_id: "guest-comments-e2e-response",
    target_provider_request_id: randomUUID(),
    target_input_tokens: 0,
    target_output_tokens: 0,
    target_reasoning_tokens: 0,
    target_cached_input_tokens: 0,
    target_total_tokens: 0,
    target_latency_ms: 0,
  });
  const { error: reportError } = await admin.rpc("record_validation_report", {
    target_trip_plan_id: planId,
    target_plan_version: 1,
    target_validator_version: "guest-comments-e2e-validator-v1",
    target_status: "pass",
    target_issues: [],
    target_warnings: [],
  });
  const { error: publishError } = await admin.rpc(
    "complete_itinerary_publication",
    {
      target_trip_plan_id: planId,
      validated_itinerary: itinerary,
    },
  );
  if (draftError || reportError || publishError)
    throw new Error("hosted_fixture_publication_failed");
  return planId;
}

async function publishHostedRevision(
  roomId: string,
  basePlanId: string,
  hostContext: BrowserContext,
  memberContext: BrowserContext,
) {
  if (!admin) throw new Error("hosted_fixture_admin_unavailable");
  const hostClient = await memberClient(hostContext);
  const otherMemberClient = await memberClient(memberContext);
  const { data: participants, error: participantsError } = await hostClient
    .from("participants")
    .select("id,display_name")
    .eq("room_id", roomId)
    .eq("status", "active");
  const host = participants?.find(
    (participant) => participant.display_name === "Maya",
  );
  const member = participants?.find(
    (participant) => participant.display_name === "Alex",
  );
  if (participantsError || !host || !member)
    throw new Error("hosted_fixture_revision_members_unavailable");

  const { data: created, error: createError } = await hostClient.rpc(
    "create_plan_change_request",
    {
      base_trip_plan_id: basePlanId,
      participant_id: host.id,
      request_type: "general_revision",
      target_item_id: null,
      request_text: "Move Glacier Point sunset later for Version 2.",
    },
  );
  const changeRequestId = (created as { id?: string } | null)?.id;
  if (createError || !changeRequestId)
    throw new Error("hosted_fixture_revision_creation_failed");

  const analysis = {
    schemaVersion: "1",
    title: "Move sunset later",
    requestSummary: "Move the sunset stop later.",
    requestedChange: {
      type: "general_revision",
      targetItemIds: [],
      normalizedInstruction: "Move Glacier Point sunset later for Version 2.",
    },
    affectedDays: ["2026-07-22"],
    affectedItems: [],
    impacts: {
      schedule: ["Later time"],
      routes: [],
      budget: [],
      reservations: [],
      lodging: [],
      food: [],
      travelerConstraints: [],
      confirmedDecisions: [],
    },
    proposedApproach: ["Shift timing"],
    preservedItems: ["All other itinerary content"],
    risks: [],
    missingInformation: [],
    materiality: "minor",
    feasibility: "feasible",
    blockers: [],
    approvalSummary: "All active members approve",
  };
  const analysisHash = createHash("sha256")
    .update(JSON.stringify(analysis))
    .digest("hex");
  const { error: claimError } = await admin.rpc("claim_change_analysis", {
    target_change_request_id: changeRequestId,
    target_model: "deterministic-guest-e2e",
    target_prompt_version: "guest-comments-e2e-analysis-v1",
    target_schema_version: "1",
  });
  const { error: analysisError } = await admin.rpc("complete_change_analysis", {
    target_change_request_id: changeRequestId,
    validated_analysis: analysis,
    target_materiality: "minor",
    target_feasibility: "feasible",
    target_analysis_hash: analysisHash,
    target_model: "deterministic-guest-e2e",
    target_prompt_version: "guest-comments-e2e-analysis-v1",
    target_schema_version: "1",
  });
  if (claimError || analysisError)
    throw new Error("hosted_fixture_revision_analysis_failed");

  const approval = {
    target_change_request_id: changeRequestId,
    target_analysis_version: 1,
    target_decision: "approved",
    note: null,
  };
  const { error: hostApprovalError } = await hostClient.rpc(
    "review_plan_change",
    { ...approval, target_participant_id: host.id },
  );
  const { error: memberApprovalError } = await otherMemberClient.rpc(
    "review_plan_change",
    { ...approval, target_participant_id: member.id },
  );
  if (hostApprovalError || memberApprovalError)
    throw new Error("hosted_fixture_revision_approval_failed");

  const itinerary = revisionItinerary();
  itinerary.days[0].items[1].startTime = "18:00";
  itinerary.days[0].items[1].endTime = "19:30";
  itinerary.days[0].items[1].description =
    "The confirmed sunset stop, shifted later in Version 2.";
  itinerary.validationMetadata.validatedAt = "2026-07-19T02:00:00.000Z";
  const { error: candidateClaimError } = await admin.rpc(
    "claim_candidate_generation",
    { target_change_request_id: changeRequestId },
  );
  const { data: candidate, error: attachError } = await admin.rpc(
    "attach_candidate_trip_plan",
    {
      target_change_request_id: changeRequestId,
      validated_itinerary: itinerary,
      target_model: "deterministic-guest-e2e",
      target_prompt_version: "guest-comments-e2e-revision-v1",
      target_schema_version: "1",
    },
  );
  const candidateId = (candidate as { id?: string } | null)?.id;
  if (candidateClaimError || attachError || !candidateId)
    throw new Error("hosted_fixture_revision_candidate_failed");
  const { error: validationError } = await admin.rpc(
    "record_validation_report",
    {
      target_trip_plan_id: candidateId,
      target_plan_version: 2,
      target_validator_version: "guest-comments-e2e-validator-v1",
      target_status: "pass",
      target_issues: [],
      target_warnings: [],
    },
  );
  const { error: candidateError } = await admin.rpc(
    "complete_plan_change_candidate",
    {
      target_change_request_id: changeRequestId,
      boundary_report: {
        validatorVersion: "guest-comments-e2e-boundary-v1",
        status: "pass",
        issues: [],
      },
      candidate_diff: {
        schemaVersion: "1",
        baseVersion: 1,
        candidateVersion: 2,
        summary: "Glacier Point sunset moved later",
        changedDays: ["2026-07-22"],
        items: [],
        routeChanges: [],
        budgetDelta: null,
        warningsAdded: [],
        warningsResolved: [],
      },
    },
  );
  if (validationError || candidateError)
    throw new Error("hosted_fixture_revision_validation_failed");

  const confirmation = {
    target_change_request_id: changeRequestId,
    target_candidate_trip_plan_id: candidateId,
    target_decision: "confirmed",
    note: null,
  };
  const { error: hostConfirmationError } = await hostClient.rpc(
    "confirm_plan_change_candidate",
    { ...confirmation, target_participant_id: host.id },
  );
  const { error: memberConfirmationError } = await otherMemberClient.rpc(
    "confirm_plan_change_candidate",
    { ...confirmation, target_participant_id: member.id },
  );
  const { error: publicationError } = await admin.rpc(
    "complete_plan_change_publication",
    { target_change_request_id: changeRequestId },
  );
  if (hostConfirmationError || memberConfirmationError || publicationError)
    throw new Error("hosted_fixture_revision_publication_failed");
  return candidateId;
}

async function createVersionOne(browser: Browser) {
  const hostContext = await scopedContext(browser, {
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const memberContext = await scopedContext(browser);
  const host = await hostContext.newPage();
  const member = await memberContext.newPage();

  await host.goto(appUrl("/trips/create"));
  await host.getByLabel("Trip name").fill("Versioned guest comments");
  await host.getByLabel("Your display name").fill("Maya");
  await host.getByRole("button", { name: "Create Trip" }).click();
  await expect(host).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
  const roomUrl = host.url();
  const roomId = new URL(roomUrl).pathname.split("/").at(-1);
  if (!roomId) throw new Error("hosted_fixture_room_id_missing");
  const inviteUrl = await host
    .getByLabel("One-time invitation URL")
    .inputValue();

  await member.goto(appUrl(inviteUrl));
  await member.getByLabel("Your display name").fill("Alex");
  await member.getByRole("button", { name: "Join Trip" }).click();
  await host.reload();
  await send(
    host,
    "We all decided on Yosemite National Park, California from July 22 through July 25, 2026. We arrive by 10 AM on July 22, depart after 4 PM on July 25, want a moderate budget, and must see Glacier Point sunset.",
  );
  await send(
    member,
    "I confirm Yosemite and Glacier Point sunset. I need accessible low-strain alternatives and peanut-free restaurant options.",
  );
  await openPlan(host);
  await host.getByRole("button", { name: "Build Our Itinerary" }).click();
  await expect(
    host.getByRole("heading", { name: "Before I build the trip" }),
  ).toBeVisible({ timeout: workflowTimeout(30_000, 120_000) });
  await openPlan(member);
  await expect(
    member.getByRole("heading", { name: "Before I build the trip" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    host.getByRole("button", { name: "Approve summary" }),
  ).toBeEnabled({ timeout: 30_000 });
  await expect(
    member.getByRole("button", { name: "Approve summary" }),
  ).toBeEnabled({ timeout: 30_000 });
  await host.getByRole("button", { name: "Approve summary" }).click();
  await member.getByRole("button", { name: "Approve summary" }).click();
  await expect(
    member.getByRole("button", { name: "Generate Itinerary" }),
  ).toBeVisible({ timeout: 30_000 });
  const planId = hosted
    ? await publishHostedFixture(roomId, hostContext)
    : await (async () => {
        await member
          .getByRole("button", { name: "Generate Itinerary" })
          .click();
        return null;
      })();
  if (hosted) {
    await host.reload();
    await member.reload();
    await openPlan(host);
    await openPlan(member);
  }
  await expect(host.getByText("Published itinerary · Version 1")).toBeVisible({
    timeout: workflowTimeout(90_000, 300_000),
  });

  return { hostContext, memberContext, host, member, roomId, roomUrl, planId };
}

async function createGuestLink(
  host: Page,
  permission: "guest_viewer" | "guest_commenter",
) {
  await host.getByRole("button", { name: "Invite guest" }).click();
  await host.getByLabel("Guest permission").selectOption(permission);
  await host.getByRole("button", { name: "Create guest link" }).click();
  const link = await host
    .getByLabel("New guest link · shown once")
    .inputValue();
  expect(link).toMatch(/^\/guest\/[A-Za-z0-9_-]{43}$/);
  return link;
}

test("Viewer and Commenter stay pinned to one safe plan version and revoke immediately", async ({
  browser,
}) => {
  test.setTimeout(hosted ? 18 * 60_000 : 180_000);
  const { hostContext, memberContext, host, member, roomId, roomUrl, planId } =
    await createVersionOne(browser);
  const viewerContext = await scopedContext(browser);
  const commenterContext = await scopedContext(browser);
  const viewer = await viewerContext.newPage();
  const commenter = await commenterContext.newPage();

  try {
    const viewerLink = await createGuestLink(host, "guest_viewer");
    await viewer.goto(appUrl(viewerLink));
    await expect(
      viewer.getByRole("heading", { name: "Join as a guest viewer" }),
    ).toBeVisible();
    await viewer.getByLabel("Guest display name").fill("Riley");
    await viewer.getByRole("button", { name: "Open Version 1" }).click();
    await expect(viewer).toHaveURL(/\/guest\/plan$/);
    await expect(viewer.getByLabel("Guest permission")).toContainText(
      "Viewer · read only",
    );
    await expect(viewer.getByLabel("Pinned Version 1")).toBeVisible();
    await expect(
      viewer.getByRole("button", { name: "Add comment" }),
    ).toHaveCount(0);
    expect(await viewer.evaluate(() => document.cookie)).not.toContain(
      "trailie_guest_session",
    );

    const commenterLink = await createGuestLink(host, "guest_commenter");
    const commenterPrefix = commenterLink.split("/").at(-1)!.slice(0, 8);
    await commenter.goto(appUrl(commenterLink));
    await expect(
      commenter.getByRole("heading", { name: "Join as a guest commenter" }),
    ).toBeVisible();
    await commenter.getByLabel("Guest display name").fill("Jordan");
    await commenter.getByRole("button", { name: "Open Version 1" }).click();
    await expect(commenter.getByLabel("Guest permission")).toContainText(
      "Commenter · comments enabled",
    );

    const guestItem = commenter
      .getByRole("heading", { name: "Glacier Point sunset" })
      .locator("..");
    const guestThread = guestItem.getByLabel(
      "Comments on Glacier Point sunset",
    );
    await guestThread
      .getByLabel("Comment on Glacier Point sunset")
      .fill("Could we meet 30 minutes earlier?");
    await guestThread.getByRole("button", { name: "Add comment" }).click();
    await expect(
      guestThread.getByText("Could we meet 30 minutes earlier?"),
    ).toBeVisible();
    await guestThread.getByRole("button", { name: "Edit" }).click();
    await guestThread
      .getByLabel("Edit comment")
      .fill("Please meet 20 minutes earlier.");
    await guestThread.getByRole("button", { name: "Save comment" }).click();
    await expect(
      guestThread.getByText("Please meet 20 minutes earlier."),
    ).toBeVisible();

    await host.getByRole("tab", { name: "Day-by-day" }).click();
    const hostItem = host
      .getByRole("heading", { name: "Glacier Point sunset" })
      .locator("..");
    const hostThread = hostItem.getByLabel("Comments on Glacier Point sunset");
    await expect(
      hostThread.getByText("Please meet 20 minutes earlier."),
    ).toBeVisible({ timeout: 15_000 });
    await hostThread.getByRole("button", { name: "Resolve" }).click();
    await expect(
      hostThread.getByText("Resolved comment by Jordan"),
    ).toBeVisible();

    if (hosted) {
      await publishHostedRevision(roomId, planId!, hostContext, memberContext);
      await host.reload();
      await member.reload();
      await openPlan(host);
      await openPlan(member);
    } else {
      await hostItem.getByRole("button", { name: "Change this" }).click();
      await host
        .getByLabel("Request details")
        .fill("Move Glacier Point sunset later without changing another day");
      await host.getByRole("button", { name: "Submit change request" }).click();
      await expect(
        host.getByRole("heading", { name: "Move an itinerary item later" }),
      ).toBeVisible({ timeout: workflowTimeout(30_000, 120_000) });
      await host.getByRole("button", { name: "Approve analysis" }).click();
      await expect(
        member.getByRole("heading", { name: "Move an itinerary item later" }),
      ).toBeVisible({ timeout: 20_000 });
      await member.getByRole("button", { name: "Approve analysis" }).click();
      await expect(
        host.getByRole("heading", { name: "Ready to publish Version 2" }),
      ).toBeVisible({ timeout: workflowTimeout(90_000, 300_000) });
      await host.getByRole("button", { name: "Confirm Version 2" }).click();
      await expect(
        member.getByRole("heading", { name: "Ready to publish Version 2" }),
      ).toBeVisible({ timeout: 20_000 });
      await member.getByRole("button", { name: "Confirm Version 2" }).click();
    }
    await expect(host.getByText("Published itinerary · Version 2")).toBeVisible(
      { timeout: workflowTimeout(30_000, 60_000) },
    );

    await commenter.reload();
    await expect(commenter.getByLabel("Pinned Version 1")).toBeVisible();
    await expect(
      commenter.getByText("Resolved comment by Jordan"),
    ).toBeVisible();
    await expect(commenter.getByLabel("Pinned Version 2")).toHaveCount(0);
    await expect(
      commenter.getByText(/latitude|longitude|exact address/i),
    ).toHaveCount(0);
    await expect(
      commenter.getByText(/crew chat|participants|approval|revision/i),
    ).toHaveCount(0);

    await commenter.goto(roomUrl);
    await expect(
      commenter.getByRole("heading", { name: "Trip unavailable" }),
    ).toBeVisible();
    await commenter.goto(appUrl("/guest/plan"));

    await host.getByRole("button", { name: "Version history" }).click();
    await host.getByRole("button", { name: "View version" }).last().click();
    const commenterInvite = host
      .getByRole("listitem")
      .filter({ hasText: `Commenter · ${commenterPrefix}…` });
    await commenterInvite
      .getByRole("button", { name: "Revoke guest link" })
      .click();
    await expect(host.getByRole("status")).toContainText(
      "Guest access is now off",
    );
    await commenter.reload();
    await expect(
      commenter.getByRole("heading", { name: "Guest access unavailable" }),
    ).toBeVisible();
  } finally {
    await Promise.all([
      viewerContext.close(),
      commenterContext.close(),
      memberContext.close(),
      hostContext.close(),
    ]);
  }
});
