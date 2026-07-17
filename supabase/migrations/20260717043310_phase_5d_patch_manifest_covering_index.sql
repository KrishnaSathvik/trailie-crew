create index plan_change_patches_manifest_request_idx
  on private.plan_change_patches (manifest_id, change_request_id);
