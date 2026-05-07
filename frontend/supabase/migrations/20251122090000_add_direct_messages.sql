-- Direct Messaging schema and policies
set check_function_bodies = off;

create extension if not exists "uuid-ossp";

create table if not exists public.direct_message_threads (
  id uuid primary key default uuid_generate_v4(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  last_message_id uuid,
  last_message_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.direct_message_participants (
  id bigserial primary key,
  thread_id uuid not null references public.direct_message_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  notifications_muted boolean not null default false,
  last_read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique(thread_id, user_id)
);

create table if not exists public.direct_messages (
  id uuid primary key default uuid_generate_v4(),
  thread_id uuid not null references public.direct_message_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  edited_at timestamptz,
  is_deleted boolean not null default false
);

alter table public.direct_message_threads
  add constraint direct_message_threads_last_message_fk
  foreign key (last_message_id) references public.direct_messages(id) on delete set null;

create table if not exists public.direct_message_receipts (
  id bigserial primary key,
  message_id uuid not null references public.direct_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique(message_id, user_id)
);

create index if not exists idx_direct_message_threads_last_message_at
  on public.direct_message_threads (last_message_at desc nulls last);

create index if not exists idx_direct_messages_thread_created
  on public.direct_messages (thread_id, created_at desc);

create index if not exists idx_direct_message_receipts_unread
  on public.direct_message_receipts (user_id)
  where read_at is null;

create or replace function public.set_dm_thread_cache()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_at timestamptz := coalesce(new.created_at, timezone('utc', now()));
begin
  update public.direct_message_threads
  set last_message_id = new.id,
      last_message_at = v_created_at
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists trg_update_dm_thread_cache on public.direct_messages;

create trigger trg_update_dm_thread_cache
after insert on public.direct_messages
for each row
execute procedure public.set_dm_thread_cache();

create or replace function public.create_direct_message_thread(
  p_sender uuid,
  p_recipient uuid,
  p_initial_body text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread_id uuid;
  v_existing uuid;
begin
  if p_sender is null or p_sender <> auth.uid() then
    raise exception 'Invalid sender';
  end if;

  if p_recipient is null or p_sender = p_recipient then
    raise exception 'Recipient required';
  end if;

  select dp1.thread_id
  into v_existing
  from public.direct_message_participants dp1
  join public.direct_message_participants dp2
    on dp1.thread_id = dp2.thread_id
  where dp1.user_id = p_sender
    and dp2.user_id = p_recipient
  limit 1;

  if v_existing is not null then
    v_thread_id := v_existing;
  else
    insert into public.direct_message_threads (created_by, last_message_at)
    values (p_sender, timezone('utc', now()))
    returning id into v_thread_id;

    insert into public.direct_message_participants (thread_id, user_id)
    values
      (v_thread_id, p_sender),
      (v_thread_id, p_recipient);
  end if;

  if coalesce(trim(p_initial_body), '') <> '' then
    insert into public.direct_messages (thread_id, sender_id, body)
    values (v_thread_id, p_sender, p_initial_body);
  end if;

  return v_thread_id;
end;
$$;

alter table public.direct_message_threads enable row level security;
alter table public.direct_message_participants enable row level security;
alter table public.direct_messages enable row level security;
alter table public.direct_message_receipts enable row level security;

create policy "dm_threads_select" on public.direct_message_threads
for select
using (
  exists (
    select 1 from public.direct_message_participants p
    where p.thread_id = direct_message_threads.id and p.user_id = auth.uid()
  )
);

create policy "dm_threads_update" on public.direct_message_threads
for update
using (
  exists (
    select 1 from public.direct_message_participants p
    where p.thread_id = direct_message_threads.id and p.user_id = auth.uid()
  )
);

create policy "dm_threads_insert" on public.direct_message_threads
for insert
with check (auth.uid() is not null);

create policy "dm_participants_select" on public.direct_message_participants
for select
using (user_id = auth.uid());

create policy "dm_participants_modify" on public.direct_message_participants
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "dm_messages_select" on public.direct_messages
for select
using (
  exists (
    select 1
    from public.direct_message_participants p
    where p.thread_id = direct_messages.thread_id
      and p.user_id = auth.uid()
  )
);

create policy "dm_messages_insert" on public.direct_messages
for insert
with check (
  sender_id = auth.uid() and
  exists (
    select 1
    from public.direct_message_participants p
    where p.thread_id = direct_messages.thread_id
      and p.user_id = auth.uid()
  )
);

create policy "dm_messages_update" on public.direct_messages
for update
using (sender_id = auth.uid())
with check (sender_id = auth.uid());

create policy "dm_receipts_select" on public.direct_message_receipts
for select
using (user_id = auth.uid());

create policy "dm_receipts_modify" on public.direct_message_receipts
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

