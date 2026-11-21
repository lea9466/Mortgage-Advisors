export const NAV_ITEMS = [
  { href: "/", label: "לוח בקרה", icon: "dashboard" },
  { href: "/clients", label: "לקוחות", icon: "clients" },
  { href: "/cases", label: "תיקי משכנתאות", icon: "cases" },
  { href: "/tasks", label: "משימות", icon: "tasks" },
  { href: "/leads", label: "לידים", icon: "leads" },
  { href: "/calendar", label: "יומן פגישות", icon: "calendar" },
  { href: "/insights", label: "מרכז התובנות", icon: "insights" },
] as const;

/** Shown at the bottom of the menu, apart from the work areas. */
export const NAV_SECONDARY_ITEMS = [{ href: "/trash", label: "סל מחזור", icon: "trash" }] as const;

export type NavItem = (typeof NAV_ITEMS)[number] | (typeof NAV_SECONDARY_ITEMS)[number];
export type NavIconName = NavItem["icon"];
