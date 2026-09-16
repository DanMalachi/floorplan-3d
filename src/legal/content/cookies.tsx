import type React from "react";
import { Link } from "@/i18n/navigation";
import { PD } from "@/ui/planDock/tokens";
import {
  legalH1, legalMeta, legalIntro, legalH2, legalP,
  DraftBanner, TranslationNotice, Fact, Mail, type LegalLang,
} from "@/app/[locale]/legal/legalKit";
import { LEGAL_FACTS as F } from "../facts";
import { COOKIE_INVENTORY, type StorageKind } from "../cookieInventory";

// Cookie Policy — one component for both languages because almost all of it is
// the inventory table, whose rows are already bilingual in cookieInventory.ts.
// The prose below is short enough that a side-by-side ternary is easier to keep
// in step than two files. Hebrew binds.

const KIND: Record<StorageKind, Record<LegalLang, string>> = {
  cookie: { he: "עוגייה", en: "Cookie" },
  localStorage: { he: "אחסון מקומי", en: "Local storage" },
  sessionStorage: { he: "אחסון לשונית", en: "Session storage" },
  indexedDB: { he: "IndexedDB", en: "IndexedDB" },
};

const cell: React.CSSProperties = {
  padding: "9px 10px",
  borderBottom: `1px solid ${PD.hairline}`,
  textAlign: "start",
  verticalAlign: "top",
  fontSize: 13,
  lineHeight: 1.6,
  color: PD.textSecondary,
};

export function CookiesPolicy({ lang }: { lang: LegalLang }) {
  const he = lang === "he";
  return (
    <>
      <h1 style={legalH1}>{he ? "מדיניות עוגיות" : "Cookie Policy"}</h1>
      {!he && <TranslationNotice />}
      <p style={legalMeta}>
        {he ? "עדכון אחרון: " : "Last updated: "}
        <Fact
          value={he ? F.effectiveDateHe : F.effectiveDateEn}
          missing={he ? "תאריך תחילה — ייקבע ביום ההשקה" : "effective date, set at launch"}
        />
      </p>
      <DraftBanner lang={lang} />

      <p style={legalIntro}>
        {he
          ? "עוגיות הן קבצים קטנים שאתר שומר בדפדפן. השירות משתמש רק בעוגיות ובאחסון מקומי שהכרחיים כדי שיעבוד: שמירת ההתחברות, שיתוף פרויקטים ושמירת העבודה שלכם על המכשיר. אין אצלנו עוגיות אנליטיקה, פרסום או מעקב, ואין עוגיות של צד שלישי."
          : "Cookies are small files a website stores in your browser. The Service uses only the cookies and local storage it needs to work: keeping you signed in, sharing projects and saving your work on your device. We use no analytics, advertising or tracking cookies, and no third-party cookies."}
      </p>

      <h2 style={legalH2}>{he ? "מה נשמר בדפדפן שלכם" : "What is stored in your browser"}</h2>
      <div style={{ overflowX: "auto", marginBottom: 18 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
          <thead>
            <tr>
              {(he ? ["שם", "סוג", "מטרה", "משך שמירה"] : ["Name", "Type", "Purpose", "Kept for"]).map((h) => (
                <th key={h} style={{ ...cell, color: PD.textPrimary, fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COOKIE_INVENTORY.map((row) => (
              <tr key={row.name}>
                {/* <bdi>, not dir on the cell: the key reads LTR but the cell still
                    aligns to the page's start edge, under its header. */}
                <td style={{ ...cell, fontFamily: PD.fontMono, fontSize: 12 }}><bdi dir="ltr">{row.name}</bdi></td>
                <td style={cell}>{KIND[row.kind][lang]}</td>
                <td style={cell}>{row[lang].purpose}</td>
                <td style={cell}>{row[lang].lifetime}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={legalH2}>{he ? "למה אין בקשת הסכמה" : "Why there is no consent prompt"}</h2>
      <p style={legalP}>
        {he
          ? "כל הפריטים ברשימה הכרחיים לפעולת השירות שביקשתם, ולכן אין מה לאשר או לדחות. אנחנו רק מיידעים אתכם. אם נוסיף בעתיד עוגיות שאינן הכרחיות, נבקש את הסכמתכם מראש, ונעדכן את המדיניות."
          : "Everything listed is necessary for the Service you asked for, so there is nothing to accept or reject; we only inform you. If we ever add non-essential cookies, we will ask for your consent first and update this policy."}
      </p>

      <h2 style={legalH2}>{he ? "איך לנהל ולמחוק" : "How to manage and delete"}</h2>
      <p style={legalP}>
        {he
          ? "אפשר למחוק עוגיות ואחסון מקומי בהגדרות הדפדפן. שימו לב: מחיקת האחסון המקומי מוחקת פרויקטים שלא סונכרנו לחשבון, וחסימת עוגיות תמנע התחברות ושיתוף. "
          : "You can delete cookies and local storage in your browser settings. Note: clearing local storage deletes projects that were not synced to an account, and blocking cookies prevents sign-in and sharing. "}
        {he ? "פרטים נוספים ב" : "More in the "}
        <Link href="/legal/privacy" style={{ color: "inherit" }}>
          {he ? "מדיניות הפרטיות" : "Privacy Policy"}
        </Link>
        {he ? ". שאלות: " : ". Questions: "}
        <Mail address={F.contactEmail} />.
      </p>
    </>
  );
}
