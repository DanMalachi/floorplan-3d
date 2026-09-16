import { Brand } from "@/brand/Brand";
import {
  legalH1, legalMeta, legalIntro, legalH2, legalP, legalUl, legalLi,
  DraftBanner, Verify, Fact, Mail, Placeholder,
} from "@/app/[locale]/legal/legalKit";
import { LEGAL_FACTS as F } from "../facts";

// הצהרת נגישות — הנוסח המחייב. accessibility.en.tsx must say the same thing.
//
// Required by the Equal Rights for Persons with Disabilities (Service
// Accessibility Adjustments) Regulations 5773-2013, reg. 35: the standard aimed
// for (IS 5568, which adopts WCAG 2.0 AA), what was made accessible, what is
// NOT accessible and any alternative, contact details for accessibility
// requests, and the date of the statement.
//
// Every claim below comes from docs/ACCESSIBILITY.md (code audit, 2026-08-24).
// That audit says outright that nothing was tested with a screen reader, a
// keyboard in a live browser or an automated tool, so this statement does NOT
// claim conformance — claiming it untested is the one thing worse than having
// no statement. When a real test pass happens, update both this file and that
// doc, and move items out of "not yet accessible".

export function AccessibilityHe() {
  return (
    <>
      <h1 style={legalH1}>הצהרת נגישות</h1>
      <p style={legalMeta}>
        עדכון אחרון: <Fact value={F.effectiveDateHe} missing="תאריך — ייקבע ביום ההשקה" />
      </p>
      <DraftBanner lang="he" />

      <p style={legalIntro}>
        אנחנו רוצים ש-<Brand /> יהיה שמיש לכמה שיותר אנשים, כולל אנשים עם
        מוגבלות. הצהרה זו מתארת בכנות מה כבר נעשה, מה עדיין לא נגיש, ואיך
        לפנות אלינו אם נתקלתם בקושי.
      </p>

      <h2 style={legalH2}>1. רמת הנגישות</h2>
      <p style={legalP}>
        אנחנו פועלים להתאים את השירות לתקן הישראלי ת&quot;י 5568, שמבוסס על
        הנחיות WCAG 2.0 ברמה AA. <b>השירות עדיין אינו עומד בתקן במלואו.</b>{" "}
        אתר התדמית ועמודי המידע המשפטי קרובים יותר לעמידה בתקן. עורך
        התלת-ממד נגיש באופן חלקי בלבד, כפי שמפורט בהמשך.{" "}
        <Verify>האם חלה על המפעיל הקלה לעסק קטן לפי תקנה 35</Verify>
      </p>

      <h2 style={legalH2}>2. מה נעשה</h2>
      <ul style={legalUl}>
        <li style={legalLi}>
          לכל הכפתורים והפקדים באתר ובעורך יש שם נגיש שקורא מסך יכול להקריא,
          כולל כפתורים שמוצג בהם אייקון בלבד.
        </li>
        <li style={legalLi}>
          גלריית הפרויקטים, תפריטי הניווט המאוירים, הלוחות והחלונות הקופצים
          ניתנים להפעלה מהמקלדת.
        </li>
        <li style={legalLi}>
          מצב נבחר מסומן גם בתכונות נגישות ולא רק בצבע, והודעות מצב מוכרזות
          לקוראי מסך.
        </li>
        <li style={legalLi}>
          לעמודים יש מבנה כותרות ואזורים (landmarks) ברורים, ושדות טופס
          מקושרים לתוויות שלהם.
        </li>
        <li style={legalLi}>
          אנימציות בממשק מצטמצמות או מבוטלות אצל מי שביקשו במערכת ההפעלה
          להפחית תנועה.
        </li>
        <li style={legalLi}>
          השירות זמין בעברית, בכיוון מימין לשמאל, ובאנגלית.
        </li>
      </ul>

      <h2 style={legalH2}>3. מה עדיין לא נגיש</h2>
      <ul style={legalUl}>
        <li style={legalLi}>
          <b>מודל התלת-ממד עצמו.</b> שרטוט קירות, בחירה, גרירה וסיבוב של
          פריטים והסיור הווירטואלי מתבצעים באמצעות עכבר או מגע על גבי תצוגה
          גרפית. אין להם כרגע חלופה שמתאימה לקורא מסך או להפעלה מלאה מהמקלדת.
        </li>
        <li style={legalLi}>
          <b>ניגודיות.</b> הלוחות השקופים למחצה בעורך מוצגים מעל התמונה
          התלת-ממדית, ולכן הניגודיות של הטקסט בהם משתנה ועלולה לרדת מתחת לנדרש.
          גם טקסט משני בגוון בהיר נמצא מתחת ליחס 4.5:1.
        </li>
        <li style={legalLi}>
          <b>קיצורי מקשים</b> של תו בודד אינם ניתנים לכיבוי או לשינוי.
        </li>
        <li style={legalLi}>
          <b>עורך במסך קטן.</b> העורך עדיין לא מותאם לטלפון.
        </li>
        <li style={legalLi}>
          כשבוחרים פריט במודל, לוח ההגדרות שנפתח לא מוכרז לקורא מסך, וחלק
          מהחלונות הקופצים לא מתנהגים כתפריטים מלאים.
        </li>
        <li style={legalLi}>
          התנועה בתוך התצוגה התלת-ממדית (מעברי מצלמה, סיור, מזג אוויר) לא
          מצטמצמת לפי הגדרת הפחתת התנועה.
        </li>
        <li style={legalLi}>
          השירות טרם נבדק עם קוראי מסך (NVDA,&rlm; JAWS,&rlm; VoiceOver), בבדיקת
          מקלדת מלאה בדפדפן או בכלי בדיקה אוטומטי. הבדיקה שנעשתה היא סקירת קוד.
        </li>
      </ul>
      <p style={legalP}>
        אם אחד מאלה מונע מכם להשתמש בשירות, כתבו לנו ונחפש יחד פתרון חלופי.
      </p>

      <h2 style={legalH2}>4. פנייה בנושא נגישות</h2>
      <p style={legalP}>
        נתקלתם בבעיית נגישות, או שאתם צריכים את המידע באתר בפורמט אחר? פנו
        אלינו ונשתדל להשיב תוך 14 ימי עסקים. כדאי לציין באיזה עמוד מדובר,
        מה ניסיתם לעשות ובאיזו טכנולוגיה מסייעת השתמשתם.
      </p>
      <ul style={legalUl}>
        <li style={legalLi}>
          אחראי נגישות: <Placeholder>שם</Placeholder>
        </li>
        <li style={legalLi}>
          דוא&quot;ל: <Mail address={F.contactEmail} />
        </li>
        <li style={legalLi}>
          טלפון: <Placeholder>מספר טלפון</Placeholder>{" "}
          <Verify>האם נדרש טלפון בנוסף לדוא&quot;ל</Verify>
        </li>
      </ul>
    </>
  );
}
