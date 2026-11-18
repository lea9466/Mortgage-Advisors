import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ClientListItem } from "@/lib/clients/clients";
import { formatPhone, maskedIdNumber } from "@/lib/format";
import styles from "./ClientPicker.module.css";

type ClientPickerProps = {
  /** Where the search form submits (the current page). */
  action: string;
  query?: string;
  clients: ClientListItem[];
  /** The button or link shown next to each client. */
  renderChoice: (client: ClientListItem) => ReactNode;
  empty: ReactNode;
};

/** Search the client registry and pick one client. */
export function ClientPicker({ action, query, clients, renderChoice, empty }: ClientPickerProps) {
  return (
    <div className={styles.picker}>
      <form role="search" action={action} className={styles.search}>
        <label htmlFor="q" className="visually-hidden">
          חיפוש לקוח
        </label>
        <input id="q" name="q" type="search" defaultValue={query} maxLength={60} placeholder="שם או מספר תעודת זהות" className={styles.input} />
        <Button type="submit" variant="secondary">
          <Search aria-hidden="true" className={styles.icon} />
          חיפוש
        </Button>
      </form>
      {clients.length === 0 ? (
        <div className={styles.empty}>{empty}</div>
      ) : (
        <ul className={styles.list}>
          {clients.map((client) => (
            <li key={client.id} className={styles.row}>
              <div className={styles.who}>
                <span className={styles.name}>
                  {client.first_name} {client.last_name}
                </span>
                <span className={styles.meta}>
                  <span dir="ltr">{maskedIdNumber(client.id_number_last4)}</span>
                  {client.phone && <span dir="ltr">{formatPhone(client.phone)}</span>}
                  {client.city && <span>{client.city}</span>}
                </span>
              </div>
              {renderChoice(client)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
