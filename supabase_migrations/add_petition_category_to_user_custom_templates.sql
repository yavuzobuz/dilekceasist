-- Require category selection for custom petition templates.
alter table public.user_custom_templates
  add column if not exists petition_category text;

-- Backfill legacy rows so the new constraint can be applied safely.
update public.user_custom_templates
set petition_category = 'Hukuk'
where template_type = 'dilekce'
  and petition_category is null;

update public.user_custom_templates
set petition_category = null
where template_type in ('sozlesme', 'ihtarname');

alter table public.user_custom_templates
  drop constraint if exists user_custom_templates_petition_category_check;

alter table public.user_custom_templates
  add constraint user_custom_templates_petition_category_check check (
    (template_type = 'dilekce' and petition_category in ('Hukuk', 'Ceza', 'Is Hukuku', 'Icra', 'Idari'))
    or (template_type in ('sozlesme', 'ihtarname') and petition_category is null)
  );
