import { Brand } from "@/brand/Brand";
import { H, P } from "./prose";
import type { AboutContent } from "./content";

// The Hebrew About page — a translation of the ARGUMENT in `content.en.tsx`,
// not of its sentences one at a time. Same register as the rest of the Hebrew
// copy: second-person plural, no superlatives, no urgency (see the header of
// src/landing/content.he.tsx for the full rule).
//
// Two places where the Hebrew deliberately does not mirror the English:
//
//   • "beautiful AND load-bearing" leans on a construction term used
//     figuratively, which Hebrew does not carry the same way. "יפה וגם נושא
//     משקל" keeps the structural image, and the emphasis moves onto "נושא
//     משקל" rather than onto a conjunction, because an italicised "וגם" would
//     be emphasising the wrong word.
//   • "we would rather say so than sell the demo" — "למכור את ההדגמה" is the
//     literal form and reads as nonsense in Hebrew; "למכור לכם הדגמה" (sell you
//     A demo) is the idiom that carries the same accusation.

export const ABOUT_HE: AboutContent = {
  eyebrow: "אודות",
  title: "דמיון, בקנה מידה.",
  faqLink: "שאלות נפוצות",
  body: (
    <>
      <P lead>
        רוב כלי עיצוב הבית מתייחסים לתוכנית האמיתית שלכם כאל מכשול. הם מציגים
        בגאווה דווקא את החלק שבו מדלגים עליה — משרטטים משהו מלבני בערך, נותנים
        למערכת לנחש את השאר, ונהנים מחדר שדומה לשלכם בלי להיות הוא.
      </P>

      <P>
        <Brand /> בנויה הפוך. אתם מביאים את התוכנית שכבר יש לכם — צילום, קובץ
        PDF, השרטוט מהברושור של המתווך — ומשרטטים מעליה את הקירות שלכם. זה החלק
        האיטי ביותר בתהליך, והוא לא אוטומטי בכוונה, כי הוא הסיבה שאפשר לסמוך על
        כל מה שבא אחריו.
      </P>

      <H>מה הדיוק באמת קונה לכם</H>
      <P>
        חדר שנכון עד הסנטימטר מפסיק להיות תמונה ומתחיל להיות החלטה. הספה או
        נכנסת או לא. הדלת או עוברת מעל השטיח או נתקעת בו. הפינה שתכננתם להכניס
        אליה שולחן עבודה מתבררת כצרה ב-12 ס״מ מדי, ואתם מגלים את זה עכשיו ולא
        ביום ההובלה.
      </P>
      <P>
        זה כל הטיעון. לא שהרנדר יפה — אלא שהוא יפה וגם <em>נושא משקל</em>. כל מה
        שאתם מציבים מגיע מקטלוג אמיתי במידות אמיתיות, כך שמה שאתם מסתכלים עליו
        הוא תוכנית שאפשר לפעול לפיה, לא לוח השראה.
      </P>

      <H>משורטט ביד, בכוונה</H>
      <P>
        אתם משרטטים, אז זה שלכם. להגדיר אורך אחד שבאמת מדדתם ולשרטט את הקירות
        שלכם מעל התמונה שמתחת לוקח כמה דקות, ומעמיד בן אדם — אתכם — אחראי על
        האמת. אין מה לפקפק בשום דבר בהמשך, כי שום דבר לפני כן לא היה ניחוש.
      </P>
      <P>
        אנחנו עובדים על הבנה אוטומטית של תוכניות שמעלים, וזה קשה באמת: מוסכמות
        השרטוט משתנות ממשרד למשרד, ממדינה למדינה ומעשור לעשור, וכלי שבטוח בעצמו
        וטועה לגבי קיר גרוע יותר מכלי ששואל. עד שזה יעבור רף שהיינו מוכנים
        להמר עליו את הבית שלכם, שרטוט הוא התשובה הישרה, ואנחנו מעדיפים להגיד את
        זה מאשר למכור לכם הדגמה.
      </P>

      <H>שקט בתכנון</H>
      <P>
        אין אשף, אין עוזר, ואין שום דבר שמכריז על עצמו. הממשק אמור להיעלם אל תוך
        הדבר שאתם יוצרים. אם השימוש ב־
        <Brand /> אי פעם מרגיש כמו להפעיל תוכנה במקום להסתכל על חדר, זה באג
        שנשמח לשמוע עליו.
      </P>
    </>
  ),
};
