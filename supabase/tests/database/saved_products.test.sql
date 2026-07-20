begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

create function pg_temp.statement_fails(statement text, expected_state text)
returns boolean
language plpgsql
as $$
declare
  actual_state text;
begin
  execute statement;
  return false;
exception
  when others then
    get stacked diagnostics actual_state = returned_sqlstate;
    return actual_state = expected_state;
end;
$$;

select plan(38);

select has_table('public', 'saved_products', 'saved_products table exists');
select has_column('public', 'saved_products', 'id', 'id column exists');
select has_column('public', 'saved_products', 'user_id', 'user_id column exists');
select has_column('public', 'saved_products', 'name', 'name column exists');
select has_column('public', 'saved_products', 'source_preset_id', 'source_preset_id column exists');
select has_column('public', 'saved_products', 'pricing_inputs', 'pricing_inputs column exists');
select has_column('public', 'saved_products', 'calculation_snapshot', 'calculation_snapshot column exists');
select has_column('public', 'saved_products', 'formula_version', 'formula_version column exists');
select has_column('public', 'saved_products', 'created_at', 'created_at column exists');
select has_column('public', 'saved_products', 'updated_at', 'updated_at column exists');
select has_pk('public', 'saved_products', 'saved_products has a primary key');
select has_fk('public', 'saved_products', 'saved_products has an auth.users foreign key');
select has_index(
  'public',
  'saved_products',
  'saved_products_user_id_idx',
  'user_id index exists'
);
select has_index(
  'public',
  'saved_products',
  'saved_products_user_updated_at_id_idx',
  'composite list index exists'
);
select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'public.saved_products'::regclass
  ),
  'row level security is enabled and forced'
);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'user-a@example.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'user-b@example.test');

select ok(
  pg_temp.statement_fails(
    $$insert into public.saved_products
      (user_id, name, pricing_inputs, calculation_snapshot, formula_version)
      values ('00000000-0000-0000-0000-0000000000a1', '', '{}'::jsonb, '{}'::jsonb, 'pricing-v1')$$,
    '23514'
  ),
  'empty names fail'
);
select ok(
  pg_temp.statement_fails(
    $$insert into public.saved_products
      (user_id, name, pricing_inputs, calculation_snapshot, formula_version)
      values ('00000000-0000-0000-0000-0000000000a1', '   ', '{}'::jsonb, '{}'::jsonb, 'pricing-v1')$$,
    '23514'
  ),
  'whitespace-only names fail'
);
select lives_ok(
  $$insert into public.saved_products
    (id, user_id, name, pricing_inputs, calculation_snapshot, formula_version)
    values (
      '00000000-0000-0000-0001-000000000001',
      '00000000-0000-0000-0000-0000000000a1',
      'A',
      '{}'::jsonb,
      '{}'::jsonb,
      'pricing-v1'
    )$$,
  'one-character names succeed'
);
select lives_ok(
  format(
    'insert into public.saved_products (id, user_id, name, pricing_inputs, calculation_snapshot, formula_version) values (%L, %L, %L, %L::jsonb, %L::jsonb, %L)',
    '00000000-0000-0000-0001-000000000002',
    '00000000-0000-0000-0000-0000000000a1',
    repeat('x', 120),
    '{}',
    '{}',
    'pricing-v1'
  ),
  '120-character names succeed'
);
select ok(
  pg_temp.statement_fails(
    format(
      'insert into public.saved_products (user_id, name, pricing_inputs, calculation_snapshot, formula_version) values (%L, %L, %L::jsonb, %L::jsonb, %L)',
      '00000000-0000-0000-0000-0000000000a1',
      repeat('x', 121),
      '{}',
      '{}',
      'pricing-v1'
    ),
    '23514'
  ),
  '121-character names fail'
);
select lives_ok(
  $$insert into public.saved_products
    (id, user_id, name, pricing_inputs, calculation_snapshot, formula_version)
    values
      ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-0000000000a1', 'Duplicate', '{}', '{}', 'pricing-v1'),
      ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-0000000000a1', 'Duplicate', '{}', '{}', 'pricing-v1')$$,
  'duplicate names succeed'
);
select ok(
  pg_temp.statement_fails(
    $$insert into public.saved_products
      (user_id, name, pricing_inputs, calculation_snapshot, formula_version)
      values ('00000000-0000-0000-0000-0000000000a1', 'Bad input JSON', '[]', '{}', 'pricing-v1')$$,
    '23514'
  ),
  'pricing_inputs must be a JSON object'
);
select ok(
  pg_temp.statement_fails(
    $$insert into public.saved_products
      (user_id, name, pricing_inputs, calculation_snapshot, formula_version)
      values ('00000000-0000-0000-0000-0000000000a1', 'Bad result JSON', '{}', '[]', 'pricing-v1')$$,
    '23514'
  ),
  'calculation_snapshot must be a JSON object'
);
select ok(
  pg_temp.statement_fails(
    $$insert into public.saved_products
      (user_id, name, pricing_inputs, calculation_snapshot, formula_version)
      values ('00000000-0000-0000-0000-0000000000a1', 'Bad formula', '{}', '{}', '   ')$$,
    '23514'
  ),
  'formula_version must be trimmed and nonempty'
);
select lives_ok(
  $$insert into public.saved_products
    (id, user_id, name, source_preset_id, pricing_inputs, calculation_snapshot, formula_version)
    values (
      '00000000-0000-0000-0001-000000000005',
      '00000000-0000-0000-0000-0000000000a1',
      'Custom',
      null,
      '{}',
      '{}',
      'pricing-v1'
    )$$,
  'custom products allow null source_preset_id'
);
select lives_ok(
  $$insert into public.saved_products
    (id, user_id, name, source_preset_id, pricing_inputs, calculation_snapshot, formula_version)
    values (
      '00000000-0000-0000-0001-000000000006',
      '00000000-0000-0000-0000-0000000000a1',
      'Preset product',
      'historical-preset-id',
      '{}',
      '{}',
      'pricing-v1'
    )$$,
  'preset-derived products allow historical preset IDs'
);

select ok(
  not has_table_privilege('anon', 'public.saved_products', 'select'),
  'anonymous users have no select privilege'
);
select ok(
  not has_table_privilege('anon', 'public.saved_products', 'insert'),
  'anonymous users have no insert privilege'
);

set local role anon;
select ok(
  pg_temp.statement_fails(
    'select count(*) from public.saved_products',
    '42501'
  ),
  'anonymous access fails'
);
reset role;

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-0000000000b2',
  true
);
set local role authenticated;
select lives_ok(
  $$insert into public.saved_products
    (id, user_id, name, pricing_inputs, calculation_snapshot, formula_version)
    values (
      '00000000-0000-0000-0002-000000000001',
      '00000000-0000-0000-0000-0000000000b2',
      'User B product',
      '{}',
      '{}',
      'pricing-v1'
    )$$,
  'authenticated User B can insert their own row'
);
reset role;

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-0000000000a1',
  true
);
set local role authenticated;

select lives_ok(
  $$insert into public.saved_products
    (id, user_id, name, pricing_inputs, calculation_snapshot, formula_version, updated_at)
    values (
      '00000000-0000-0000-0002-000000000002',
      '00000000-0000-0000-0000-0000000000a1',
      'User A product',
      '{}',
      '{}',
      'pricing-v1',
      '2000-01-01 00:00:00+00'
    )$$,
  'authenticated user can insert their own row'
);
select ok(
  pg_temp.statement_fails(
    $$insert into public.saved_products
      (user_id, name, pricing_inputs, calculation_snapshot, formula_version)
      values ('00000000-0000-0000-0000-0000000000b2', 'Not mine', '{}', '{}', 'pricing-v1')$$,
    '42501'
  ),
  'authenticated user cannot insert for another user'
);
select results_eq(
  $$select count(*)::bigint
    from public.saved_products
    where user_id = '00000000-0000-0000-0000-0000000000b2'$$,
  $$values (0::bigint)$$,
  'User A cannot select User B rows'
);
select results_eq(
  $$with changed as (
      update public.saved_products
      set name = 'Changed by A'
      where id = '00000000-0000-0000-0002-000000000001'
      returning 1
    )
    select count(*)::bigint from changed$$,
  $$values (0::bigint)$$,
  'User A cannot update User B rows'
);
select results_eq(
  $$with removed as (
      delete from public.saved_products
      where id = '00000000-0000-0000-0002-000000000001'
      returning 1
    )
    select count(*)::bigint from removed$$,
  $$values (0::bigint)$$,
  'User A cannot delete User B rows'
);
select ok(
  pg_temp.statement_fails(
    $$update public.saved_products
      set user_id = '00000000-0000-0000-0000-0000000000b2'
      where id = '00000000-0000-0000-0002-000000000002'$$,
    '42501'
  ),
  'users cannot transfer row ownership'
);
select lives_ok(
  $$update public.saved_products
    set name = 'Updated by owner'
    where id = '00000000-0000-0000-0002-000000000002'$$,
  'owners can update their own rows'
);
select ok(
  (
    select updated_at > '2000-01-01 00:00:00+00'::timestamptz
    from public.saved_products
    where id = '00000000-0000-0000-0002-000000000002'
  ),
  'updated_at changes on update'
);

reset role;
select * from finish();
rollback;
