"use client";

import { AuthCard } from "@/components/AuthCard/AuthCard";
import { Button } from "@/components/ui/Button";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ reset }: ErrorPageProps) {
  return (
    <AuthCard title="משהו השתבש" description="הפעולה לא הושלמה. אפשר לנסות שוב.">
      <Button onClick={reset}>ניסיון נוסף</Button>
    </AuthCard>
  );
}
