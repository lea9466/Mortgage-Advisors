"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { addTemplate, deleteTemplate } from "@/lib/cases/requirements";
import { createClient } from "@/lib/supabase/server";
import { requirementTemplateSchema } from "@/lib/validation/requirement";

export type TemplateResult = { error?: string; ok?: boolean };

/** Adds an item that will appear in the document list of every open case. */
export async function addTemplateAction(_prev: TemplateResult, formData: FormData): Promise<TemplateResult> {
  const session = await requireSession();
  const parsed = requirementTemplateSchema.safeParse({
    title: formData.get("title"),
    category: formData.get("category"),
    perBorrower: formData.get("scope") === "borrower",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "השמירה נכשלה" };

  const supabase = await createClient();
  try {
    await addTemplate(supabase, { organizationId: session.organization.id, userId: session.user.id }, parsed.data);
  } catch (error) {
    console.error("template add failed", error instanceof Error ? error.message : "unknown");
    return { error: "השמירה נכשלה. נסו שוב בעוד רגע" };
  }
  refresh();
  return { ok: true };
}

/** Stops an item from being added to more cases. Cases that already have it keep it. */
export async function deleteTemplateAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = z.uuid().safeParse(formData.get("templateId"));
  if (!id.success) return;
  const supabase = await createClient();
  await deleteTemplate(supabase, session.organization.id, id.data);
  refresh();
}
