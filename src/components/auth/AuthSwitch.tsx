import Link from "next/link";
import styles from "./AuthSwitch.module.css";

type AuthSwitchProps = { question: string; href: "/login" | "/signup"; label: string };

/** "No account yet? Sign up" line under the login and sign-up forms. */
export function AuthSwitch({ question, href, label }: AuthSwitchProps) {
  return (
    <p className={styles.line}>
      {question} <Link href={href}>{label}</Link>
    </p>
  );
}
