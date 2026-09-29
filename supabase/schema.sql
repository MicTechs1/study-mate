-- StudyMate campus identity
-- Apply in the Supabase SQL editor. Do not grant anon access to student records.

create extension if not exists pgcrypto;

create or replace function public.studymate_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('student', 'lecturer', 'advisor', 'admin')),
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table if not exists public.student_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  index_number text not null unique,
  student_id text unique,
  faculty text,
  department text,
  programme text,
  level text,
  gpa numeric(3, 2),
  profile_photo_url text,
  qr_token text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.lecturer_assignments (
  id uuid primary key default gen_random_uuid(),
  lecturer_user_id uuid not null references auth.users(id) on delete cascade,
  student_profile_id uuid not null references public.student_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (lecturer_user_id, student_profile_id)
);

create table if not exists public.advisor_assignments (
  id uuid primary key default gen_random_uuid(),
  advisor_user_id uuid not null references auth.users(id) on delete cascade,
  student_profile_id uuid not null references public.student_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (advisor_user_id, student_profile_id)
);

create table if not exists public.student_access_logs (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid references auth.users(id) on delete set null,
  student_id uuid references public.student_profiles(id) on delete set null,
  action text not null check (action in (
    'PROFILE_VIEWED',
    'ACADEMIC_INFO_VIEWED',
    'STUDENT_VERIFIED',
    'STUDENT_SEARCHED'
  )),
  created_at timestamptz not null default now()
);

create index if not exists student_profiles_user_id_idx on public.student_profiles (user_id);
create index if not exists student_profiles_index_number_idx on public.student_profiles (index_number);
create index if not exists student_profiles_student_id_idx on public.student_profiles (student_id);
create index if not exists student_profiles_qr_token_idx on public.student_profiles (qr_token);
create index if not exists student_profiles_faculty_idx on public.student_profiles (faculty);
create index if not exists student_profiles_department_idx on public.student_profiles (department);
create index if not exists student_profiles_programme_idx on public.student_profiles (programme);
create index if not exists user_roles_user_id_idx on public.user_roles (user_id);
create index if not exists lecturer_assignments_lecturer_idx on public.lecturer_assignments (lecturer_user_id);
create index if not exists lecturer_assignments_student_idx on public.lecturer_assignments (student_profile_id);
create index if not exists advisor_assignments_advisor_idx on public.advisor_assignments (advisor_user_id);
create index if not exists advisor_assignments_student_idx on public.advisor_assignments (student_profile_id);
create index if not exists student_access_logs_requester_idx on public.student_access_logs (requester_user_id);
create index if not exists student_access_logs_student_idx on public.student_access_logs (student_id);
create index if not exists student_access_logs_created_idx on public.student_access_logs (created_at desc);

drop trigger if exists student_profiles_set_updated_at on public.student_profiles;
create trigger student_profiles_set_updated_at
before update on public.student_profiles
for each row execute function public.studymate_set_updated_at();

create or replace function public.studymate_has_role(target_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role = target_role
  );
$$;

create or replace function public.studymate_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.studymate_has_role('lecturer')
      or public.studymate_has_role('advisor')
      or public.studymate_has_role('admin');
$$;

revoke all on public.student_profiles from anon, authenticated, public;
revoke all on public.user_roles from anon, authenticated, public;
revoke all on public.lecturer_assignments from anon, authenticated, public;
revoke all on public.advisor_assignments from anon, authenticated, public;
revoke all on public.student_access_logs from anon, authenticated, public;

grant select (
  id,
  user_id,
  full_name,
  index_number,
  student_id,
  faculty,
  department,
  programme,
  level,
  profile_photo_url,
  is_active,
  created_at,
  updated_at
) on public.student_profiles to authenticated;

grant select (id, user_id, role, created_at) on public.user_roles to authenticated;
grant select on public.lecturer_assignments to authenticated;
grant select on public.advisor_assignments to authenticated;
grant insert (requester_user_id, student_id, action) on public.student_access_logs to authenticated;
grant select (id, requester_user_id, student_id, action, created_at) on public.student_access_logs to authenticated;

alter table public.student_profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.lecturer_assignments enable row level security;
alter table public.advisor_assignments enable row level security;
alter table public.student_access_logs enable row level security;

drop policy if exists student_profiles_select on public.student_profiles;
create policy student_profiles_select
on public.student_profiles
for select
to authenticated
using (
  user_id = auth.uid()
  or public.studymate_has_role('admin')
  or exists (
    select 1 from public.lecturer_assignments a
    where a.student_profile_id = student_profiles.id
      and a.lecturer_user_id = auth.uid()
  )
  or exists (
    select 1 from public.advisor_assignments a
    where a.student_profile_id = student_profiles.id
      and a.advisor_user_id = auth.uid()
  )
);

drop policy if exists student_profiles_update_own_qr on public.student_profiles;
create policy student_profiles_update_own_qr
on public.student_profiles
for update
to authenticated
using (user_id = auth.uid() or public.studymate_has_role('admin'))
with check (user_id = auth.uid() or public.studymate_has_role('admin'));

drop policy if exists student_profiles_admin_write on public.student_profiles;
create policy student_profiles_admin_write
on public.student_profiles
for insert
to authenticated
with check (public.studymate_has_role('admin'));

drop policy if exists user_roles_select_own on public.user_roles;
create policy user_roles_select_own
on public.user_roles
for select
to authenticated
using (user_id = auth.uid() or public.studymate_has_role('admin'));

drop policy if exists user_roles_admin_write on public.user_roles;
create policy user_roles_admin_write
on public.user_roles
for all
to authenticated
using (public.studymate_has_role('admin'))
with check (public.studymate_has_role('admin'));

drop policy if exists lecturer_assignments_select on public.lecturer_assignments;
create policy lecturer_assignments_select
on public.lecturer_assignments
for select
to authenticated
using (
  lecturer_user_id = auth.uid()
  or public.studymate_has_role('admin')
);

drop policy if exists advisor_assignments_select on public.advisor_assignments;
create policy advisor_assignments_select
on public.advisor_assignments
for select
to authenticated
using (
  advisor_user_id = auth.uid()
  or public.studymate_has_role('admin')
);

drop policy if exists assignment_admin_write_lecturer on public.lecturer_assignments;
create policy assignment_admin_write_lecturer
on public.lecturer_assignments
for all
to authenticated
using (public.studymate_has_role('admin'))
with check (public.studymate_has_role('admin'));

drop policy if exists assignment_admin_write_advisor on public.advisor_assignments;
create policy assignment_admin_write_advisor
on public.advisor_assignments
for all
to authenticated
using (public.studymate_has_role('admin'))
with check (public.studymate_has_role('admin'));

drop policy if exists access_logs_insert_self on public.student_access_logs;
create policy access_logs_insert_self
on public.student_access_logs
for insert
to authenticated
with check (requester_user_id = auth.uid());

drop policy if exists access_logs_select_admin on public.student_access_logs;
create policy access_logs_select_admin
on public.student_access_logs
for select
to authenticated
using (
  requester_user_id = auth.uid()
  or public.studymate_has_role('admin')
);

-- QR token and GPA are not granted to authenticated clients.
-- Verification APIs read them with the service role, then apply authorization.

notify pgrst, 'reload schema';
