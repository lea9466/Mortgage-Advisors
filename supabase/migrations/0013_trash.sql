-- Recycle bin for documents (2026-11-21).
-- "Remove" in a case moves a document to the bin (deleted_at). From the bin it
-- can be restored, or deleted permanently: the row, its file row and the stored
-- object all go. Permanent delete is allowed only for documents already in the
-- bin, so a live document can never be deleted directly.

alter table public.case_documents
  add column deleted_by uuid references auth.users (id) on delete set null;

create index case_documents_trash_idx on public.case_documents (organization_id, deleted_at desc) where deleted_at is not null;

-- The trigger keeps case, file and creator fixed on update; deleted_by may change.
create policy "members delete documents from the bin" on public.case_documents for delete to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id) and deleted_at is not null);

-- files.deleted_at follows the document, so a file row can be removed only once its document is in the bin.
create policy "members delete binned files" on public.files for delete to authenticated
  using (public.has_mfa() and public.is_org_member(organization_id) and deleted_at is not null);
