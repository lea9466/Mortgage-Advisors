import type { Metadata } from "next";
import { ClientForm } from "@/components/clients/ClientForm";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { requireSession } from "@/lib/auth/session";
import { createClientAction } from "../actions";
import styles from "../clients.module.css";

export const metadata: Metadata = { title: "לקוח חדש" };

export default async function NewClientPage() {
  await requireSession();
  return (
    <div className={styles.page}>
      <PageHeader title="לקוח חדש" back={{ href: "/clients", label: "לקוחות" }} />
      <ClientForm action={createClientAction} initialValues={{}} submitLabel="שמירת לקוח" cancelHref="/clients" />
    </div>
  );
}
