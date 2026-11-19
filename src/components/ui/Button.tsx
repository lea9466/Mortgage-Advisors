import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "quiet";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant };

export function Button({ variant = "primary", className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={clsx(styles.button, styles[variant], className)} {...rest} />;
}

type ButtonLinkProps = {
  href: string;
  variant?: Variant;
  className?: string;
  /** Turn off for pages that must only load on a real click, e.g. ones written to the audit log. */
  prefetch?: boolean;
  children: ReactNode;
};

/** A link that looks like a button, for navigation actions such as "new client". */
export function ButtonLink({ href, variant = "primary", className, prefetch, children }: ButtonLinkProps) {
  return (
    <Link href={href} prefetch={prefetch} className={clsx(styles.button, styles[variant], className)}>
      {children}
    </Link>
  );
}
