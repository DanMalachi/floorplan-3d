// Every cookie and browser-storage key the production app writes, verified in
// code on 2026-09-16 (origin/main 8772873). The cookie policy renders this list
// in both languages, so a new key is ONE entry here, not two page edits.
//
// Deliberately absent: `pseudo-locale` (dev-only, src/proxy.ts NODE_ENV gate),
// `done.dev.furnitureReview` (dev route, 404 in prod), NEXT_LOCALE (routing.ts
// `localeCookie: false`). If you add analytics, ads or any non-essential
// tracker, this page stops being enough: Amendment 13 + ePrivacy-style
// practice then require prior opt-in consent, and ConsentNotice.tsx must become
// a real accept/reject control.

export type StorageKind = "cookie" | "localStorage" | "sessionStorage" | "indexedDB";

export interface StorageEntry {
  name: string;
  kind: StorageKind;
  he: { purpose: string; lifetime: string };
  en: { purpose: string; lifetime: string };
}

export const COOKIE_INVENTORY: StorageEntry[] = [
  {
    name: "sb-*",
    kind: "cookie",
    he: { purpose: "שמירת ההתחברות לחשבון (Supabase).", lifetime: "עד ההתנתקות או פקיעת ההתחברות" },
    en: { purpose: "Keeps you signed in (Supabase).", lifetime: "Until sign-out or session expiry" },
  },
  {
    name: "fp_anon",
    kind: "cookie",
    he: {
      purpose: "מזהה אקראי למי שנכנס לפרויקט משותף בלי חשבון. חתום, ולא ניתן לקריאה על ידי סקריפטים בדף.",
      lifetime: "180 יום",
    },
    en: {
      purpose: "Random ID for someone joining a shared project without an account. Signed, not readable by page scripts.",
      lifetime: "180 days",
    },
  },
  {
    name: "fp_owned_rooms",
    kind: "cookie",
    he: {
      purpose: "זוכר אילו חדרי שיתוף נפתחו מהדפדפן הזה, כדי שרק הבעלים יוכלו לנהל אותם. חתום, ולא ניתן לקריאה על ידי סקריפטים בדף.",
      lifetime: "שנה",
    },
    en: {
      purpose: "Remembers which share rooms this browser opened, so only their owner can manage them. Signed, not readable by page scripts.",
      lifetime: "1 year",
    },
  },
  {
    name: "IndexedDB",
    kind: "indexedDB",
    he: {
      purpose: "הפרויקטים שלכם, תמונות תוכנית, תמונות ממוזערות, רשימת הפרויקטים והקישור בין פרויקט לחדר השיתוף שלו. נשמר על המכשיר.",
      lifetime: "עד שתמחקו אותם",
    },
    en: {
      purpose: "Your projects, plan images, thumbnails, the project list and which share room belongs to which project. Saved on your device.",
      lifetime: "Until you delete them",
    },
  },
  {
    name: "fp:grant:*",
    kind: "localStorage",
    he: { purpose: "קישור השיתוף שדרכו נכנסתם לפרויקט משותף.", lifetime: "עד שתוקף הקישור פג" },
    en: { purpose: "The share link you used to join a shared project.", lifetime: "Until the link expires" },
  },
  {
    name: "planDock:theme, planDock:dockHeight2, furniture:hostHeights1",
    kind: "localStorage",
    he: { purpose: "העדפות תצוגה: ערכת צבעים, גובה המגש התחתון ומידות רהיטים שנמדדו.", lifetime: "עד שתמחקו אותם" },
    en: { purpose: "Display preferences: theme, bottom dock height, measured furniture sizes.", lifetime: "Until you delete them" },
  },
  {
    name: "fp3d:legalNotice:v1, editor:smallScreenAcknowledged",
    kind: "localStorage",
    he: { purpose: "זוכר שסגרתם את הודעת העוגיות ואת הודעת המסך הקטן.", lifetime: "עד שתמחקו אותם" },
    en: { purpose: "Remembers that you closed the cookie notice and the small-screen notice.", lifetime: "Until you delete them" },
  },
  {
    name: "live:left, golive-seed:*",
    kind: "sessionStorage",
    he: { purpose: "מעבר תקין בין פרויקט רגיל לפרויקט חי בתוך אותה לשונית.", lifetime: "עד סגירת הלשונית" },
    en: { purpose: "Smooth hand-off between a normal and a live project within one tab.", lifetime: "Until the tab closes" },
  },
];
