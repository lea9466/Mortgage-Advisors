import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/Button";
import styles from "./LogoutButton.module.css";

type LogoutButtonProps = { variant?: "quiet" | "secondary" };

export function LogoutButton({ variant = "quiet" }: LogoutButtonProps) {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant={variant}>
        <LogOut aria-hidden="true" className={styles.icon} />
        יציאה
      </Button>
    </form>
  );
}
