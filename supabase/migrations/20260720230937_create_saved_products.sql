create extension if not exists pgcrypto with schema extensions;

create table public.saved_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  source_preset_id text,
  pricing_inputs jsonb not null,
  calculation_snapshot jsonb not null,
  formula_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_products_name_trimmed check (name = btrim(name)),
  constraint saved_products_name_length check (char_length(name) between 1 and 120),
  constraint saved_products_source_preset_id_valid check (
    source_preset_id is null
    or (
      source_preset_id = btrim(source_preset_id)
      and char_length(source_preset_id) between 1 and 80
    )
  ),
  constraint saved_products_pricing_inputs_object check (
    jsonb_typeof(pricing_inputs) = 'object'
  ),
  constraint saved_products_calculation_snapshot_object check (
    jsonb_typeof(calculation_snapshot) = 'object'
  ),
  constraint saved_products_formula_version_valid check (
    formula_version = btrim(formula_version)
    and char_length(formula_version) between 1 and 40
  )
);

create index saved_products_user_id_idx
  on public.saved_products (user_id);

create index saved_products_user_updated_at_id_idx
  on public.saved_products (user_id, updated_at desc, id);

create function public.set_saved_products_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger saved_products_set_updated_at
before update on public.saved_products
for each row
execute function public.set_saved_products_updated_at();

revoke all on table public.saved_products from anon;
grant select, insert, update, delete on table public.saved_products to authenticated;

revoke all on function public.set_saved_products_updated_at() from public;
grant execute on function public.set_saved_products_updated_at() to authenticated;

alter table public.saved_products enable row level security;
alter table public.saved_products force row level security;

create policy "Users can select their own saved products"
on public.saved_products
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

create policy "Users can insert their own saved products"
on public.saved_products
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

create policy "Users can update their own saved products"
on public.saved_products
for update
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

create policy "Users can delete their own saved products"
on public.saved_products
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);
