-- User-owned custom template library (petition / contract / notice)
create table if not exists public.user_custom_templates (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  template_type text not null check (template_type in ('dilekce', 'sozlesme', 'ihtarname')),
  title text not null,
  description text,
  content text not null,
  style_notes text,
  source_file_name text,
  variables jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create or replace function public.set_user_custom_templates_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_user_custom_templates_updated_at on public.user_custom_templates;
create trigger set_user_custom_templates_updated_at
before update on public.user_custom_templates
for each row execute function public.set_user_custom_templates_updated_at();

alter table public.user_custom_templates enable row level security;

drop policy if exists "Users can view own custom templates" on public.user_custom_templates;
create policy "Users can view own custom templates"
  on public.user_custom_templates for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own custom templates" on public.user_custom_templates;
create policy "Users can insert own custom templates"
  on public.user_custom_templates for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own custom templates" on public.user_custom_templates;
create policy "Users can update own custom templates"
  on public.user_custom_templates for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own custom templates" on public.user_custom_templates;
create policy "Users can delete own custom templates"
  on public.user_custom_templates for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_custom_templates to authenticated;
