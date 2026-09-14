-- =============================================================================
-- Finance: receipt storage, bursar policies, invoice-total maintenance
-- Migration 0004_finance
-- =============================================================================

-- Private receipt bucket (objects stored at "<school_id>/<payment_id>").
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-receipts', 'payment-receipts', false, 5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

create policy "receipts_select" on storage.objects for select to authenticated
using (bucket_id = 'payment-receipts' and public.is_member_of(((storage.foldername(name))[1])::uuid));

create policy "receipts_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'payment-receipts'
  and public.has_role(((storage.foldername(name))[1])::uuid, array['owner','admin','bursar']::app_role[]));

create policy "receipts_update" on storage.objects for update to authenticated
using (bucket_id = 'payment-receipts'
  and public.has_role(((storage.foldername(name))[1])::uuid, array['owner','admin','bursar']::app_role[]));

create policy "receipts_delete" on storage.objects for delete to authenticated
using (bucket_id = 'payment-receipts'
  and public.has_role(((storage.foldername(name))[1])::uuid, array['owner','admin','bursar']::app_role[]));

-- Bursars (as well as owners/admins) manage finance tables.
do $$
declare t text;
begin
  foreach t in array array['fee_structures','invoices','invoice_items','payments'] loop
    execute format('drop policy if exists %I on %I;', t||'_ins', t);
    execute format('drop policy if exists %I on %I;', t||'_upd', t);
    execute format('drop policy if exists %I on %I;', t||'_del', t);
    execute format('create policy %I on %I for insert with check (public.has_role(school_id, array[''owner'',''admin'',''bursar'']::app_role[]));', t||'_ins', t);
    execute format('create policy %I on %I for update using (public.has_role(school_id, array[''owner'',''admin'',''bursar'']::app_role[]));', t||'_upd', t);
    execute format('create policy %I on %I for delete using (public.has_role(school_id, array[''owner'',''admin'',''bursar'']::app_role[]));', t||'_del', t);
  end loop;
end $$;

-- Keep invoice amount_paid / status in sync with payments.
create or replace function public.recompute_invoice(p_invoice uuid)
returns void language plpgsql security definer set search_path = public as $$
declare paid numeric; tot numeric;
begin
  select coalesce(sum(amount), 0) into paid from payments where invoice_id = p_invoice and status = 'confirmed';
  select total into tot from invoices where id = p_invoice;
  update invoices set amount_paid = paid,
    status = (case when paid <= 0 then 'issued' when paid >= tot then 'paid' else 'part_paid' end)::invoice_status
  where id = p_invoice;
end $$;

create or replace function public.on_payment_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recompute_invoice(coalesce(new.invoice_id, old.invoice_id));
  return coalesce(new, old);
end $$;

create trigger payments_recompute
  after insert or update or delete on payments
  for each row execute function public.on_payment_change();
