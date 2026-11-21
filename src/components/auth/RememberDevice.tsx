import styles from "./SecondStep.module.css";

/** "Remember this computer for 30 days" checkbox, shared by the app-code and email-code forms. */
export function RememberDevice() {
  return (
    <label className={styles.remember}>
      <input type="checkbox" name="remember" defaultChecked />
      לזכור את המחשב הזה ל-30 יום
      <span className={styles.rememberHint}>לא לסמן במחשב משותף או ציבורי</span>
    </label>
  );
}
