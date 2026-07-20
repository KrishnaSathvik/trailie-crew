begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(5);

select has_table(
  'private',
  'guest_suggestions',
  'guest suggestions are stored outside the browser-facing schema'
);
select has_function(
  'public',
  'create_guest_suggestion',
  array['text','text','text','text','text','text','date','time without time zone','time without time zone'],
  'service-only structured suggestion creation RPC exists'
);
select has_function(
  'public',
  'list_member_guest_suggestions',
  array['uuid'],
  'member-safe suggestion list RPC exists'
);
select has_function(
  'public',
  'convert_guest_suggestion',
  array['uuid','uuid','boolean'],
  'member conversion RPC requires an explicit rebase decision'
);
select has_function(
  'public',
  'dismiss_guest_suggestion',
  array['uuid','uuid'],
  'member dismissal RPC exists'
);

select * from finish();
rollback;
