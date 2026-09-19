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
// Every claim below comes from docs/ACCESSIBILITY.md: the code audit
// (2026-08-24), the axe + keyboard pass and the rendered-pixel contrast
// measurements (both 2026-09-18). Nothing has been tested with a screen reader,
// so this statement does NOT claim conformance — claiming it untested is the
// one thing worse than having no statement. When a screen-reader pass happens,
// update both this file and that doc, and move items out of "not yet
// accessible".

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
          כולל כפתורים שמוצג בהם אייקון בלבד — ובעברית באתר העברי.
        </li>
        <li style={legalLi}>
          כל מה שמסביב לתצוגת התלת-ממד — גלריית הפרויקטים, תפריטי הניווט
          המאוירים, הלוחות, החלונות, השיתוף ועמוד החשבון — ניתן להפעלה
          מהמקלדת, מציג סימון פוקוס גלוי, ולעולם לא &quot;לוכד&quot; את
          המקלדת.
        </li>
        <li style={legalLi}>
          אפשר להגיע לתצוגת התלת-ממד מהמקלדת. היא מזוהה בשם לקוראי מסך ומכריזה
          על מקשי השליטה שלה: הזזה וסיבוב של המצלמה, מבט מלמעלה, מיקוד, וסיבוב,
          מחיקה וביטול בחירה של פריט נבחר.
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
          הטקסט בלוחות העורך עומד ביחס ניגודיות של 4.5:1 בערכת הנושא הכהה
          ובבהירה, גם מעל החלקים הבהירים ביותר של התמונה התלת-ממדית. הדבר נמדד
          על המסך כפי שהוא מוצג בפועל.
        </li>
        <li style={legalLi}>
          אפשר להגדיל את האתר ואת העורך עד 200% בלי שפקדים יחפפו זה לזה או
          ייעלמו.
        </li>
        <li style={legalLi}>
          אצל מי שביקשו במערכת ההפעלה להפחית תנועה, האנימציות בממשק מבוטלות,
          תנועות המצלמה בתצוגת התלת-ממד קופצות ישירות ליעד במקום לגלוש, והדגמה
          בעמוד הבית מציגה את החדר המוגמר בלי אנימציה. אפשר גם לעצור את סיבוב
          ההדגמה.
        </li>
        <li style={legalLi}>
          ההדגמה בעמוד הבית מתחילה לבד כשגוללים אליה. כל עוד היא פועלת, מוצג
          כפתור &quot;דלגו לחדר&quot; שעוצר אותה.
        </li>
        <li style={legalLi}>
          אפשר לסגור חלוניות עזרה (tooltips) במקש Escape.
        </li>
        <li style={legalLi}>
          השירות זמין בעברית, בכיוון מימין לשמאל, ובאנגלית, ומידות מוצגות בסדר
          הנכון בשתי השפות.
        </li>
      </ul>

      <h2 style={legalH2}>3. מה עדיין לא נגיש</h2>
      <ul style={legalUl}>
        <li style={legalLi}>
          <b>עריכת מודל התלת-ממד.</b> שרטוט קירות, בחירה, גרירה וסיבוב של
          פריטים והסיור הווירטואלי מתבצעים באמצעות עכבר או מגע על גבי תצוגה
          גרפית. אין להם כרגע חלופה שמתאימה לקורא מסך או להפעלה מלאה מהמקלדת.
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
          הסיור הווירטואלי, הגשם והאנימציה של שעות היום בתצוגת התלת-ממד עדיין
          לא מצטמצמים לפי הגדרת הפחתת התנועה.
        </li>
        <li style={legalLi}>
          השירות טרם נבדק עם קוראי מסך (NVDA,&rlm; JAWS,&rlm; VoiceOver). הוא
          נבדק בכלי בדיקה אוטומטי (axe, לפי WCAG 2.0 ו-2.1 ברמות A ו-AA)
          ובמעבר מלא במקלדת על כל העמודים הציבוריים, בעברית ובאנגלית.
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
