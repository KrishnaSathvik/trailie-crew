import { beforeEach, describe, expect, it, vi } from "vitest";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/server/supabase/admin";
import {
  assessAccountDeletionAction,
  deleteAccountAction,
  deleteRoomAction,
  transferRoomHostAction,
} from "./actions";

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock("@/server/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(),
}));

const userId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2";
const roomId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3";
const participantId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4";

function setup(rpcData: unknown = true) {
  const rpc = vi.fn().mockResolvedValue({ data: rpcData, error: null });
  const signOut = vi.fn().mockResolvedValue({ error: null });
  vi.mocked(createServerSupabaseClient).mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: userId } }, error: null }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "access" } },
        error: null,
      }),
      signOut,
    },
    rpc,
  } as never);
  const adminSignOut = vi.fn().mockResolvedValue({ error: null });
  const deleteUser = vi.fn().mockResolvedValue({ error: null });
  vi.mocked(createAdminSupabaseClient).mockReturnValue({
    auth: { admin: { signOut: adminSignOut, deleteUser } },
  } as never);
  return { rpc, signOut, adminSignOut, deleteUser };
}

describe("lifecycle server actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends room deletion confirmation to the locked RPC", async () => {
    const { rpc } = setup();
    await expect(
      deleteRoomAction({ roomId, confirmation: "Disposable room" }),
    ).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("delete_room", {
      target_room_id: roomId,
      confirmation: "Disposable room",
    });
  });

  it("transfers host only through the trusted RPC", async () => {
    const { rpc } = setup();
    await expect(
      transferRoomHostAction({ roomId, participantId }),
    ).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("transfer_room_host", {
      target_room_id: roomId,
      target_participant_id: participantId,
    });
  });

  it("returns safe account obligations", async () => {
    setup({ soleHostRooms: [], hostRooms: [], ordinaryMemberships: 2 });
    await expect(assessAccountDeletionAction()).resolves.toMatchObject({
      ok: true,
      data: { ordinaryMemberships: 2 },
    });
  });

  it("revokes refresh sessions before soft-deleting the Auth user", async () => {
    const { rpc, adminSignOut, deleteUser, signOut } = setup({
      prepared: true,
    });
    await expect(
      deleteAccountAction({ confirmation: "DELETE MY ACCOUNT" }),
    ).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("prepare_account_deletion", {
      confirmation: "DELETE MY ACCOUNT",
    });
    expect(adminSignOut).toHaveBeenCalledWith("access", "global");
    expect(deleteUser).toHaveBeenCalledWith(userId, true);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("does not expose database details from lifecycle failures", async () => {
    const { rpc } = setup();
    rpc.mockResolvedValue({
      data: null,
      error: { message: "private.participants host_required" },
    });
    await expect(
      deleteRoomAction({ roomId, confirmation: "Disposable room" }),
    ).resolves.toEqual({ ok: false, error: "host_required" });
  });
});
