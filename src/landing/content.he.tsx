// The Hebrew copy for the done.design marketing page — the twin of
// `content.en.tsx`, which is the source this is translated FROM. A claim that
// changes belongs there first and here second.
//
// ── Register ────────────────────────────────────────────────────────────────
// Second-person PLURAL throughout ("שרטטו", "שלכם"), which is the neutral
// address in Israeli product copy and the one already set by the site metadata
// in messages/he.json. It is also the only choice that does not gender the
// reader, which the singular forms cannot avoid.
//
// The English voice rules carry over unchanged and are not restated here: no
// superlatives, no urgency, no exclamation marks, and none of the competitor
// vocabulary listed at the top of content.en.tsx. Hebrew has its own versions
// of those words ("בקלות", "תוך דקות", "מרהיב") and they are banned for the
// same reason.
//
// ── What is deliberately NOT translated ─────────────────────────────────────
// `done.` — the wordmark stays Latin in the Hebrew build (Dan's decision), so
// the product's name is never spelled as a Hebrew string here. It comes through
// `<Brand />` every time instead: inside an RTL sentence the trailing full stop
// is a neutral character and bidi resolves it toward the paragraph, landing it
// on the WRONG side of the word, and that component is the isolate that stops
// it. Never write the name as a literal in this file — a plain `"done."` here
// renders `.done` on the page. File formats (PDF, DXF, DWG, JPG, PNG, CAD) and
// the Google brand name also stay Latin, but need no isolate: they carry no
// trailing punctuation for bidi to move.
//
// ── Three choices worth a second opinion ────────────────────────────────────
// Flagged for Dan rather than buried:
//
//   1. **The ghost CTA loses its pun.** English "see how it's done." ends on
//      the product's name and means both "watch the process" and "watch it
//      finish". Hebrew cannot land both without code-switching mid-sentence
//      ("תראו איך זה done."), which reads as a gimmick rather than as the
//      quiet confidence the voice is built on. Translated to its function —
//      "תראו איך זה עובד." — because the button plays the hero animation, and
//      a working button beats a broken joke.
//   2. **"A rehearsal of yours" → "חזרה גנרלית".** Literally "dress
//      rehearsal", which is the live Hebrew idiom; the literal "חזרה" alone
//      reads as "a repeat" and loses the whole image.
//   3. **"a guess wearing nice lighting" → "ניחוש בתאורה טובה".** Kept
//      literal, because the image survives the crossing intact and it is the
//      single best line in the English.

import { Brand } from "@/brand/Brand";
import type { LandingContent } from "./content";

export const HE: LandingContent = {
  openApp: (
    <span>
      {"פתחו את "}
      <Brand />
    </span>
  ),

  /**
   * The rotating lines around the fixed `done.` wordmark. See `Slogan` in
   * content.ts for the lead/tail geometry.
   *
   * Which slot each line uses is a Hebrew decision, not a copy of the English
   * one — and two of them move. "upload, then it's done." keeps its lead
   * because Hebrew builds the same way ("מעלים, וזה כבר" → done.), but a
   * Hebrew line that has to end on the mark cannot simply be flipped into a
   * tail, so those stay leads too. `id` is what pairs a Hebrew line with its
   * English original; the order is the English order, because the first entry
   * is the primary lockup and has to stay first.
   */
  slogans: [
    { id: "beforeYouStart", tail: "עוד לפני שהתחלתם." },
    { id: "uploadThenIts", lead: "מעלים, וזה כבר" },
    { id: "beforeYouGuess", tail: "עוד לפני שניחשתם." },
    { id: "yourOwnWalls", tail: "עם הקירות שלכם." },
    { id: "drawItOnce", lead: "משרטטים פעם אחת, וזה" },
    { id: "sofaThatFits", tail: "עם ספה שנכנסת." },
    { id: "paintYouCanBuy", tail: "עם צבע שאפשר לקנות." },
    { id: "roomThatsYours", tail: "עם חדר שהוא באמת שלכם." },
  ],

  hero: {
    subhead:
      "העלו את תוכנית הדירה שלכם כרקע לעבודה. שרטטו מעליה את הקירות שלכם, לפי קנה מידה, ומה שיוצא בצד השני הוא החדר האמיתי שלכם — ספה שנכנסת, צבע שאפשר לקנות, וסיור בבית שהוא שלכם.",
    note: "אפשר להתחיל בלי חשבון.",
    // See note 1 at the top of this file — the pun does not cross.
    ctaGhostLabel: "תראו איך זה עובד.",
    ctaGhostLabelRunning: "דלגו לחדר",
    ctaGhostLabelDone: "צפו שוב",
  },

  howItWorks: {
    eyebrow: "איך זה עובד",
    title: "מתוכנית הדירה שלכם לבית שאפשר להיכנס אליו.",
    steps: [
      {
        n: "01",
        title: "העלו את התוכנית",
        body: "הביאו את מה שיש לכם — צילום של התוכנית, קובץ PDF, או קובץ DXF או DWG. הוא יושב מתחת לשולחן העבודה שלכם כרקע, בקנה מידה ומוכן לשרטוט מעליו.",
      },
      {
        n: "02",
        title: "שרטטו את הקירות שלכם",
        body: "שרטטו את הקירות, הדלתות והחלונות האמיתיים שלכם מעל הרקע, במידות האמיתיות שלהם — תוכנית שרק אתם יכולתם לשרטט, כי זו התוכנית שאתם גרים בה.",
      },
      {
        n: "03",
        title: "רהטו, ואז טיילו בפנים",
        body: "הציבו רהיטים מקטלוג אמיתי, במידות שמתאימות לחדרים האמיתיים שלכם, ובחרו צבע שאפשר באמת לקנות. ואז טיילו בפנים בגוף ראשון — הקירות הם אלה ששרטטתם.",
      },
    ],
  },

  different: {
    eyebrow: "מה שונה",
    title: "יפה כי זה מדויק.",
    intro:
      "כל כלי אחר מתייחס לתוכנית האמיתית שלכם כאל מכשול — משהו לעקוף כדי להתחיל לעצב מוקדם יותר. אנחנו מתייחסים אליה כאל היסוד: הדבר האחד שכל השאר בעיצוב חייב לתת עליו את הדין, כי תוכנית שלא אתם שרטטתם היא ניחוש בתאורה טובה.",
    points: [
      {
        id: "furnitureFits",
        title: "רהיטים שנכנסים, כי הם אמיתיים",
        body: "לכל פריט בקטלוג יש את המידות האמיתיות שלו, לקוחות מהמוצר האמיתי. גם החדר שלכם משורטט בקנה מידה — כך שספה שנראית נכון כאן היא ספה שנכונה לחלל שאתם עומדים בו.",
      },
      {
        id: "paintYouCanBuy",
        title: "צבע שאפשר באמת לקנות",
        body: "הצבעים בקטלוג הם צבעים אמיתיים עם שם — לא הקירוב של רנדר לצבע כזה. מה שאתם בוחרים על המסך הוא משהו שאפשר ללכת ולקנות.",
      },
      {
        id: "yourOwnWalkthrough",
        title: "סיור בבית שלכם",
        body: "ברגע שהקירות שלכם קיימים, אפשר לטייל ביניהם בגוף ראשון — החדרים שלכם, הפרופורציות שלכם, האור שלכם. לא הדגמה של בית. חזרה גנרלית על שלכם.",
      },
      {
        id: "nothingToAccept",
        title: "אין מה לבדוק, אין מה לאשר",
        body: "אתם משרטטים קיר, וזה קיר — בלי מסך זיהוי באמצע, בלי לאשר או לתקן לפני שאפשר לראות את הבית. מה ששרטטתם כבר הוכרע.",
      },
    ],
  },

  faqIntro: {
    eyebrow: "שאלות",
    title: "תשובות ישירות.",
  },

  /** Same ids, same order, same answers as content.en.tsx — the source comments
   *  citing the code behind each answer live there and are not duplicated here,
   *  because an answer that drifts from its source should be fixed in one
   *  place. Every claim below was checked against the English, not rewritten. */
  faq: [
    {
      id: "needFloorplan",
      q: "צריך תוכנית דירה כדי להתחיל?",
      a: (
        <>
          {"צריך משהו לשרטט מעליו — צילום של תוכנית, קובץ PDF, ייצוא מ-CAD, אפילו סקיצה שמדדתם ביד. "}
          <Brand />
          {" לא מייצרת תוכנית יש מאין; אתם משרטטים את הקירות שלכם מעל כל רקע שתביאו, במידות האמיתיות שלהם. זה הצעד הידני האחד, והוא זה שהופך כל מה שבא אחריו לראוי לאמון."}
        </>
      ),
    },
    {
      id: "fileTypes",
      q: "אילו סוגי קבצים אפשר להעלות?",
      a: "צילום או סריקה של התוכנית (JPG, PNG), קובץ PDF, או קובץ CAD — DXF ישירות, או DWG מקורי, שאנחנו ממירים עבורכם אוטומטית. מה שתביאו הופך לתמונת הרקע מתחת לשולחן העבודה; את הקירות אתם עדיין משרטטים בעצמכם.",
    },
    {
      id: "draftingExperience",
      q: "צריך ניסיון בשרטוט כדי לשרטט את הקירות?",
      a: "לא נדרשת מיומנות מיוחדת — אתם מקליקים קווים באורכים אמיתיים, בדיוק כמו לסמן חדר עם סרט מדידה ועיפרון. מה שחשוב הוא שהקירות הם שלכם, במידות של החדר שבאמת יש לכם, ולא שהשרטוט עצמו ברמה מקצועית.",
    },
    {
      id: "needAccount",
      q: "צריך חשבון?",
      a: (
        <>
          {"לא. "}
          <Brand />
          {" עובדת במלואה בלי התחברות — התוכנית שלכם נשמרת בדפדפן הזה תוך כדי עבודה. התחברות עם Google רק אומרת שהיא גם עוברת אתכם למכשירים האחרים שלכם; זו הצעה, לא דרישה."}
        </>
      ),
    },
    {
      id: "dataPrivate",
      q: "המידע שלי פרטי?",
      a: "אם אתם לא מחוברים, התוכנית שלכם לא עוזבת את הדפדפן הזה — אין שום דבר על שרת שמישהו, כולל אנחנו, יכול לראות. אם תתחברו כדי לסנכרן בין מכשירים, התוכנית והתמונה שלה נשמרות באופן פרטי תחת החשבון שלכם, ושום דבר לא משותף או פומבי בלי שתבחרו לשתף אותו.",
    },
    {
      id: "deleteAccount",
      q: "מה קורה לתוכנית שלי אם אמחק את החשבון?",
      a: "מחיקת החשבון מוחקת את התוכניות שלכם ואת התמונות שהעליתם, סופית — אין עותק גיבוי ששוכב איפשהו. תוכנית שחיה רק בדפדפן של אורח לא נגעת, כי מעולם לא היתה אצלנו מלכתחילה.",
    },
    {
      id: "canIShare",
      q: "אפשר לשתף את מה שיצרתי?",
      a: "כן — קישור שיתוף נותן למישהו לצפות בפרויקט שלכם, או לעצב לצדכם בזמן אמת, לפי מה שתבחרו. אתם מחליטים מי רק מסתכל ומי יכול לערוך.",
    },
    {
      id: "worksOnPhone",
      q: "זה עובד בטלפון?",
      a: "לטייל בחדר מוכן — כן: צביטה לזום, גרירה לסיבוב, כמו בכל אפליקציית מפות. שרטוט הקירות דורש יד יציבה יותר ממה שמסך טלפון נותן, אז את החלק הזה עדיף לעשות במחשב או בטאבלט, בינתיים.",
    },
    {
      id: "buyTheFurniture",
      q: "אפשר לקנות את הרהיטים שאני מציב?",
      a: (
        <>
          {"הקטלוג הוא רהיטים אמיתיים — מוצרים ממשיים, במידות האמיתיות שלהם ותחת השמות האמיתיים שלהם. מה שאתם מציבים הוא משהו שאפשר ללכת ולמצוא ולקנות היום. עדיין אין קופה בתוך "}
          <Brand />
          {", אז תחשבו על זה כעל רשימת קניות מדויקת מאוד."}
        </>
      ),
    },
    {
      id: "isItFree",
      q: (
        <>
          <Brand />
          {" בחינם?"}
        </>
      ),
      a: "כן, בינתיים. לשרטט תוכנית, לרהט אותה ולטייל בתוכה לא עולה כלום היום. אם זה ישתנה, נגיד את זה כאן לפני שזה קורה.",
    },
  ],

  faqPage: {
    eyebrow: "שאלות",
    title: "כל מה שכדאי לשאול לפני.",
    aboutLink: (
      <span>
        {"מה זה "}
        <Brand />
      </span>
    ),
  },

  ctaBand: {
    title: "שרטטו את הקירות שבאמת יש לכם.",
    subhead:
      "הביאו תוכנית דירה, או צילום שלה, ושרטטו מעליה ביד — בגודל של החדר שאתם באמת נמצאים בו. אפשר להתחיל בלי חשבון, ואין מה לשלם היום.",
    ctaGhostLabel: "לשאלות הנפוצות",
  },

  footer: {
    tagline:
      "שרטטו את הבית שבאמת יש לכם, רהטו אותו מקטלוג אמיתי, וטיילו בו לפני שאתם מוציאים שקל.",
  },
};
