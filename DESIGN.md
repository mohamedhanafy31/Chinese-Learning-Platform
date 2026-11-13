---
name: Mazen Chinese
description: Chinese lessons for Arabic speakers, painted on a blue-and-white porcelain plate. مازن للصينية · 马赞中文
colors:
  glaze: "#f4f7fa"
  glaze-bright: "#ffffff"
  glaze-shade: "#e3eaf3"
  wash: "#b9cae6"
  wash-strong: "#8fa9d6"
  unfired: "#9db0d3"
  unfired-ink: "#4a64a3"
  cobalt-mid: "#2a55b8"
  cobalt: "#1c3f94"
  deep: "#0e2366"
  abyss: "#08174a"
  seal: "#c8372d"
typography:
  display-ar:
    fontFamily: "Aref Ruqaa, Alexandria, serif"
    fontSize: "clamp(2.6rem, 7.4vw, 6rem)"
    fontWeight: 400
    lineHeight: 1.05
  display-en:
    fontFamily: "Aref Ruqaa, serif"
    fontSize: "clamp(2.6rem, 7.4vw, 6rem)"
    fontWeight: 700
    lineHeight: 1.05
  display-zh:
    fontFamily: "Ma Shan Zheng, Noto Sans SC, serif"
    fontSize: "clamp(2.6rem, 7.4vw, 6rem)"
    fontWeight: 400
    lineHeight: 1.05
  headline:
    fontFamily: "Aref Ruqaa, Alexandria, serif"
    fontSize: "clamp(2.25rem, 4.5vw, 3.75rem)"
    fontWeight: 400
    lineHeight: 1.1
  brush:
    fontFamily: "Ma Shan Zheng, Noto Sans SC, serif"
    fontSize: "clamp(1.4rem, 3.2vw, 2.75rem)"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "0.06em"
  title:
    fontFamily: "Alexandria, Noto Sans SC, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.33
  body:
    fontFamily: "Alexandria, Noto Sans SC, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.85
  body-zh:
    fontFamily: "Noto Sans SC, Alexandria, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.85
  label:
    fontFamily: "Alexandria, Noto Sans SC, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
rounded:
  row: "1rem"
  lobe: "40%"
  full: "9999px"
spacing:
  gutter-sm: "16px"
  gutter-md: "32px"
  gutter-lg: "72px"
  section-sm: "80px"
  section-md: "96px"
  section-lg: "112px"
  container: "1440px"
  container-narrow: "1100px"
  measure: "34rem"
components:
  button-primary-on-cobalt:
    backgroundColor: "{colors.glaze}"
    textColor: "{colors.deep}"
    rounded: "{rounded.full}"
    padding: "0 32px"
    height: "56px"
  button-primary-on-cobalt-hover:
    backgroundColor: "{colors.glaze-bright}"
  button-primary-on-glaze:
    backgroundColor: "{colors.deep}"
    textColor: "{colors.glaze}"
    rounded: "{rounded.full}"
    padding: "0 32px"
    height: "56px"
  button-primary-on-glaze-hover:
    backgroundColor: "{colors.cobalt}"
  button-primary-on-glaze-disabled:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.cobalt}"
  button-seal-start:
    backgroundColor: "{colors.seal}"
    textColor: "{colors.glaze}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
  path-node-fired:
    backgroundColor: "{colors.deep}"
    textColor: "{colors.glaze}"
    rounded: "{rounded.full}"
    size: "44px"
  path-node-next:
    backgroundColor: "{colors.seal}"
    textColor: "{colors.glaze}"
    rounded: "{rounded.full}"
    size: "44px"
  path-node-locked:
    backgroundColor: "{colors.glaze}"
    textColor: "{colors.unfired-ink}"
    rounded: "{rounded.full}"
    size: "44px"
  path-node-preview:
    backgroundColor: "{colors.glaze}"
    textColor: "{colors.cobalt}"
    rounded: "{rounded.full}"
    size: "44px"
  path-row-next:
    backgroundColor: "{colors.glaze-bright}"
    rounded: "{rounded.row}"
  sample-tag:
    textColor: "{colors.cobalt}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
  plate-panel:
    backgroundColor: "{colors.glaze}"
    textColor: "{colors.deep}"
    rounded: "{rounded.lobe}"
  plate-panel-active:
    backgroundColor: "{colors.seal}"
    textColor: "{colors.glaze}"
    rounded: "{rounded.lobe}"
---

# Design System: Mazen Chinese

## Overview

**Creative North Star: "The Qinghua Plate"**

Mazen's course is painted onto one blue-and-white porcelain object. Every surface is either glaze white or cobalt laid on in depth, from a pale wash to heaped, pooled dark; there are no greys and no other hues. The one exception is cinnabar, the colour of a cut seal, which marks Mazen himself and the single thing in focus right now. Red and gold, the usual "Chinese" shorthand, is deliberately absent.

Structure borrows the way qinghua ware divides itself into zones. Sections are separated by one painted border band each (sea-wave 海水纹 or lotus-panel 莲瓣纹). The landing hero is a drenched deep-cobalt field reverse-decorated in white, holding a large authored-SVG plate: a pooled cobalt rim, one continuous white-reserve scroll (缠枝莲) with tendrils, leaves and lotus blossoms, and lobed reserve panels (开光) that carry the levels. The teacher sits in the well at the centre. Progress uses the kiln as its metaphor: what is done is fired deep cobalt and sealed, what is locked is still a pale unfired underglaze line.

The interface is Arabic-first and RTL by default, with English and Chinese as first-class locales. Each locale gets its own calligraphic display voice (Ruqʿah for Arabic and English, brush kaishu for Chinese), over a single interface face, Alexandria. Density is calm and roomy: long line-height, generous section padding, one idea per band.

**Key Characteristics:**
- Two-material palette, glaze white and cobalt in depth, plus cinnabar used only sparingly.
- Painted border bands as section dividers, one per section.
- Plate, bands and seal are all authored inline SVG. There are no raster images.
- Calligraphic display per locale over one humanist UI face.
- Progress shown as fired, next (sealed in cinnabar), and unfired states.
- Logical (start/end) geometry throughout, and RTL-mirrored motion and keyboard order.

## Colors

The palette is a single cobalt pigment at every depth on a cool porcelain white, with one cinnabar seal.

### Primary
- **Qinghua Cobalt** (`cobalt`): the painted line. Body copy on glaze, rim of the plate, band ink, path spine, step glyphs, ledger rule. It reads at 8.9:1 on glaze.
- **Heaped Cobalt** (`deep`): pigment pooled thick. It is the hero and closing fields, headings and titles on glaze, fired lesson nodes, the primary button on glaze, and body text colour by default.
- **Abyss Cobalt** (`abyss`): the darkest pooling, used only for the footer ground.
- **Bright Cobalt** (`cobalt-mid`): the focus halo, dividers on deep fields, the preview segment of the progress bar, and the wave band on the closing section.

### Secondary
- **Cinnabar Seal** (`seal`): Mazen's 马 seal, the next lesson's node and "start" pill, the selected reserve panel on the plate, the next segment of the progress bar, the active-locale underline, and the input caret.

### Neutral
- **Glaze White** (`glaze`): the porcelain body. Default page ground, reverse-painted text on cobalt, the primary button on cobalt fields, and the seal's carved strokes. It is cool, never cream.
- **Bright Glaze** (`glaze-bright`): lifted glaze. The next-lesson row, hover grounds on the levels ledger and path rows, and hover on the glaze button.
- **Glaze Shade** (`glaze-shade`): recessed glaze. The ground for "how it works" and the level page's lesson section, and the scrollbar track.
- **Pale Wash** (`wash`): secondary text on cobalt fields (8.7:1 on deep), hairline dividers on glaze, and the disabled button ground.
- **Strong Wash** (`wash-strong`): tertiary text on deep (6.1:1), the Chinese line of the hero headline, link underlines, and the hero wave band.
- **Unfired Line** (`unfired`): the dashed underglaze line of locked nodes, locked progress segments, sample tags and empty states.
- **Unfired Ink** (`unfired-ink`): text and icons in locked rows (5.4:1 on glaze).

### Named Rules
**The One Seal Rule.** Cinnabar marks Mazen's seal and the single current item in a context: one next lesson, one selected plate panel, one active locale. It never decorates, never fills a section, and never appears twice for the same meaning on one view.

**The No-Grey Rule.** Every neutral is a cobalt tint or glaze. If a value would be a grey, use `wash`, `unfired` or `glaze-shade` instead.

**The Unfired-Is-Not-Alone Rule.** The `unfired` line (2.0:1 on glaze) is atmosphere, not information. A locked state always also carries a lock icon and label in `unfired-ink`.

## Typography

**Display Font (ar):** Aref Ruqaa (with Alexandria, serif)
**Display Font (en):** Aref Ruqaa 700 (with serif)
**Display Font (zh) / Brush:** Ma Shan Zheng (with Noto Sans SC, serif)
**Body Font:** Alexandria, variable (with Noto Sans SC, system-ui)
**Body Font (zh):** Noto Sans SC 400/500/700 (with Alexandria)

**Character:** Two brush hands answer each other. Ruqʿah calligraphy is the Arabic voice and brush kaishu the Chinese one, both over Alexandria, a calm Egyptian-designed Arabic and Latin sans. One `font-display` class switches the face by `lang`: Ruqaa for `ar`, Ruqaa 700 for `en`, Ma Shan Zheng 400 for `zh`. Any Chinese text inside other locales sets `lang="zh"` and uses the brush face.

### Hierarchy
- **Display** (clamp 2.6rem to 6rem, line-height 1.05): the hero headline only.
- **Headline** (clamp 2rem–2.25rem up to 3.25rem–4.25rem, line-height 1.05 to 1.1): section h2s and the level-page h1, always `font-display`, in `deep` on glaze or `glaze` on cobalt.
- **Brush hanzi** (Ma Shan Zheng): the Chinese headline line in the hero (clamp 1.4rem to 2.75rem, tracking 0.06em, `wash-strong`), step numerals 一二三 (3.75rem), ledger and level hanzi (3rem to 3.75rem; clamp 5rem to 8.5rem on the level page, line-height 0.9), and lesson hanzi (1.875rem).
- **Title** (600, 1.5rem; lesson rows 1.125rem to 1.25rem): level names, step titles, lesson titles.
- **Body** (400, 1.125rem, line-height 1.8 to 1.85): ledes and section copy, capped at 32rem to 40rem (`measure` is 34rem).
- **Label** (400, 0.875rem): level numbers, path meta, locale switcher, and captions. Sample tags use 0.75rem.

### Named Rules
**The Locale Voice Rule.** Display text never uses Alexandria. It always goes through `font-display` so each locale gets its own brush.

**The Eastern Digits Rule.** All numbers go through `Intl.NumberFormat`, with `ar-EG` for Arabic so Egyptian readers see Eastern Arabic digits (١٢٣). Counts and progress use the `tabular` utility (tabular-nums). Body text keeps proportional figures (`tnum` off).

## Layout

Full-bleed colour bands with a centred content container: 1440px max on marketing surfaces and 1100px on the level page. Gutters are logical inline padding of 16px, 32px (sm) and 72px (lg). Sections breathe at 80px vertical padding on mobile and 96px to 112px on desktop.

- **Hero:** two columns at lg (copy 1fr, plate 1.05fr). The copy sits on the reading-start side and the plate on the reading-end side. On mobile the plate comes first and the copy follows. The plate is sized `min(80vw, 46vw + 12rem, 720px)` and uses container-query units (`cqw`) for its labels.
- **Path section:** two columns at lg (0.9fr text, 1.1fr path).
- **Steps:** three columns at md, divided by `wash` hairlines on the inline-start edge.
- **Levels ledger:** a ruled list (2px `cobalt` top rule, `wash` row hairlines) with a hanzi column of 6.5rem, or 9rem at sm.
- **Breakpoints:** Tailwind defaults (sm 640, md 768, lg 1024).

**The Logical Geometry Rule.** Spacing, borders and positioning use only start/end properties (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `border-s`, `text-end`, `inset-x`). Physical left/right never appears. Directional icons mirror under `rtl:` (the play triangle flips).

## Elevation & Depth

Depth comes mostly from pigment, through tonal layering: abyss under deep under cobalt under glaze-shade under glaze under bright glaze. Shadows are soft, cobalt-tinted and ambient, and only lift the objects that matter: the plate, the next lesson, and the open menu.

### Shadow Vocabulary
- **Plate lift** (`drop-shadow(0 34px 40px rgb(3 10 40 / 0.55))`): the porcelain plate sitting on the cobalt field.
- **Next-lesson lift** (`box-shadow: 0 18px 40px -24px rgb(14 35 102 / 0.45)`): the single next row on the path, with `glaze-bright` ground.
- **Menu drop** (`box-shadow: 0 24px 40px -20px rgb(3 10 40 / 0.6)`): the mobile disclosure panel.

### Named Rules
**The Pigment-Not-Plastic Rule.** Inside the plate, depth is painted: a radial glaze body and turbulence-pooled cobalt in the rim. Do not add bevels, glossy highlights or hard offset shadows.

## Shapes

Round and lobed, like thrown and painted ware. Buttons, pills, path nodes, tags and the portrait well are fully round (9999px). Path rows and empty states have gently rounded 1rem corners. Plate cartouches are lobed reserve panels (`lobe`, 40%) with a double inner line. The about-portrait frame is an arch (round top, 4px `glaze` border). Topic bullets are small cobalt lozenges (a square rotated 45°). Dashed borders mean unfired: locked, sample or empty.

## Components

### Buttons
- **Shape:** full pill (9999px), minimum height 56px, 32px inline padding, 1.125rem semibold.
- **Primary on cobalt:** `glaze` ground with `deep` text. Hover goes to `glaze-bright` and lifts 2px over 300ms `ease-glaze`.
- **Primary on glaze:** `deep` ground with `glaze` text, hovering to `cobalt`. Disabled is `wash` ground with `cobalt` text and a not-allowed cursor.
- **Secondary:** a text link on the same baseline with a `wash-strong` underline at 8px offset, and the same 56px hit area.
- **Seal start pill:** `seal` ground, `glaze` text, 8px by 16px, 0.875rem semibold. Used only on the next lesson.

### Forms
- **Input:** min-height 56px, 1rem radius, `glaze-bright` ground, 1.5px `wash-strong` border hovering to `cobalt`, `deep` text at 1.125rem, `unfired-ink` placeholder. Focus uses the global focus ring; the caret is `seal`.
- **Label:** 0.875rem semibold `deep`, 8px above its input and always visible. Helper text is 0.875rem `cobalt`.
- **Error (no cinnabar):** errors never use `seal`, because of the One Seal Rule. An invalid input gets a 2px `deep` border with `aria-invalid`. Its message sits below in 0.875rem semibold `deep`, led by a `CircleAlert` icon and linked by `aria-describedby`. A form-level error is a 1rem-rounded `glaze-shade` block with a 4px `deep` inline-start border and `role="alert"`.
- **Numbers and phone:** the phone input is `dir="ltr"` with Western-digit placeholders, even in Arabic. Eastern digits typed by the user are accepted and normalised.
- **Submit:** the "Primary on glaze" pill, full width below `sm`, with a disabled `aria-busy` pending state and no double submit.
- **Auth layout:** at `lg`, the form sits on the reading-start side and a `deep` panel on the reading-end side holds a 120px seal, one brush-hanzi line in `wash-strong` and the brand line, with a wave band at its foot. Below `lg`, the hanzi line becomes the second line of the `h1`.

### Lesson Path (signature)
The level's lessons as one unbroken cobalt band: a 4px `cobalt` spine on the inline-start side, with 44px nodes (52px at sm).
- **Fired / done:** `deep` node with a glaze check, the title in `deep`, and a 30px 马 seal at the row end with accessible name "sealed by Mazen".
- **Next:** `seal` node with a 4px `glaze` ring and a play icon, the row lifted on `glaze-bright` with the next-lesson shadow, and the cinnabar start pill.
- **Unfired / locked:** a 2px dashed `unfired` node on glaze with a lock icon, title, meta and state label in `unfired-ink`, and hanzi at `unfired` 70%. Not a link.
- **Preview:** a 2px solid `cobalt` node on glaze with a play icon, and the text label in `cobalt`.
- **Open:** for an enrolled learner, the same node as preview (2px solid `cobalt`, play icon), labelled "Open" (متاح, 可学习). Sequential unlocking (M12) later turns these into fired, next and unfired.
- Every row carries a screen-reader state label. Rows that are links get a `glaze-bright`/70% hover.
- **Progress bar (level page):** one 10px pill segment per lesson. Fired is `deep`, next is `seal`, preview is `cobalt-mid`, and locked is a dashed `unfired` outline. Above it is a tabular count ("أكملت ٢ من ٥").

### Quiz (lesson check)
Quizzes are a calm exam sheet on glaze. They are built from the ledger, the forms and the seal, with no new colours.
- **Quiz list (lesson page, under the description):** a ruled list like the levels ledger: a 2px `cobalt` top rule and `wash` row hairlines. Each row shows the title (Title, `deep`) and a Label meta line in `cobalt` ("٥ أسئلة · النجاح ٧٠٪"). The result is one of:
  - Passed: a `deep` check with "Passed · ٨٠٪".
  - Not yet passed: "Best ٤٠٪" in `cobalt`.
  - Never taken: "Not taken" in `unfired-ink`.

  The action is the "Primary on glaze" pill ("Start", or "Try again"), never the seal pill, because the seal is the next lesson's.
- **Sheet:** one page per quiz. It opens with a `font-display` heading through `<WriteOn>` and the pass mark, then each question as a `fieldset` in a vertical stack with 48px between questions. The `legend` carries a Label "Question ٣ of ٨" in `cobalt`, then the prompt in Title `deep`. If the question has hanzi, it sits on its own line in brush hanzi (3rem, `lang="zh"`), and an image sits in a 1rem-rounded frame at most 28rem wide.
- **Option:** the whole row is the `label` of a visually hidden native radio or checkbox, which stays focusable and uses the global focus ring. Rows are min-height 56px with 1rem radius on a `glaze-bright` ground, with a 1.5px `wash-strong` border that hovers to `cobalt`. The indicator is a 22px round dot for single and true/false, and a 22px 6px-rounded square for multiple. Unselected is a `cobalt` 2px outline. Selected is a 2px `deep` border on the row, with the indicator filled `deep` and a glaze dot or check. Multiple-answer questions say "Choose all that apply" in helper text. Selection is never shown by colour alone.
- **Submit bar:** at the end of the sheet, with a tabular count "Answered ٣ of ٥" and the "Primary on glaze" submit pill. The pill is disabled (`wash`) until every question is answered, with the `aria-busy` pending state and no double submit. A 429 or network failure shows the form-level error block.
- **Result:** the score in Headline `font-display` with tabular locale digits ("٨٠٪"), and the line "Passed (pass mark ٧٠٪)" or "Not yet: the pass mark is ٧٠٪".
  - Passing stamps Mazen's seal at 72px (`data-reveal="seal"`, accessible name "sealed by Mazen"). It means the same as the fired-lesson seal, so it is the only cinnabar on the view.
  - Not passing shows no seal and no cinnabar, only the "Try again" pill.
- **Review:** each question repeats with its options read-only.
  - The learner's choice keeps the selected styling.
  - The correct option gets a `deep` check icon and the label "Correct answer".
  - A wrong choice gets a `CircleAlert` and the label "Your answer". It is styled in `deep`, never red and never seal.
  - The question gets a status line, "Correct" or "Not quite", with the same icons.
  - The explanation sits below in a 1rem-rounded `glaze-shade` block.
- **History:** a ruled list of past attempts, newest first, each with the date (`Intl.DateTimeFormat`), the tabular score and a passed label. A row links to that attempt's review.

### Porcelain Plate (signature)
An authored SVG on a 1000-unit viewBox. It has a glaze radial body, a cobalt rim pooled with turbulence pigment, one continuous swelling-and-tapering 缠枝莲 scroll stem with tendrils, leaves and a lotus blossom between each pair of panels, and painted double rings (heavy outer, fine inner). Each level gets one lobed reserve panel. The selected panel washes to `seal` (600ms fill) and its lines invert to glaze. The panels form a `radiogroup` of `radio` buttons. Choosing one rotates the whole rim so that level sits at the top, over 1100ms `ease-glaze`. Levels advance clockwise in LTR and counter-clockwise in RTL. The well stays upright and holds Mazen, and an `aria-live="polite"` readout under the hero copy shows the selected level's title, hanzi, number, summary and topics.

### Seal
Mazen's cinnabar 印章, an authored SVG: an irregular octagon with a chipped-stone displacement edge and seal-script 马 cut in three heavy glaze strokes. It appears at 38px in the header, 32px in the footer, 34px as the path legend, and 30px on fired lessons. It is decorative unless it is given a label.

### Bands
Painted border bands, one per section boundary, always decorative (`aria-hidden`).
- **Wave band** (海水纹, 28px tall, 48px repeat): curling crests over a baseline. Drawn in `wash-strong` on `deep` under the hero, and in `cobalt-mid` atop the closing section.
- **Lotus band** (莲瓣纹, 34px tall, 30px repeat): double-lined lotus petals. Drawn in `cobalt` atop "how it works" and under the level header.

### Navigation
- **Header:** two tones. On cobalt it is a `deep` ground with links in `wash` hovering to `glaze`. On glaze it is a `glaze` ground with links in `cobalt` hovering to `deep`. The seal plus wordmark (1.125rem semibold) sits at the reading start. Links have a 44px minimum hit area.
- **Mobile:** from below md, a 44px round menu button opens a disclosure panel full-width beneath the header. It has `aria-expanded` and `aria-controls`, Escape closes it, and it holds the same links at 48px plus the locale switcher.
- **Locale switcher:** native names (العربية, English, 中文), each with its own `lang`. The current locale is a non-link `aria-current="page"` with a 2px `seal` underline at 8px offset. It is repeated in the footer on `abyss`.

### Sample Tag / Placeholders
Pending content is labelled honestly. A 0.75rem pill with a dashed `unfired` border and `cobalt` text marks sample data (the levels ledger, the example path, level topics). A solid `wash-strong` pill on cobalt marks pending biography. Mazen's portrait slot shows a brush 马 on a `wash-strong`-to-`cobalt` radial ground with a "photo to come" line.

**Pending assets:** the portrait of Mazen (the plate well and the about-section arch frame) and the real syllabus (all levels and lessons are sample content). When the portrait arrives, it renders in the well as a cobalt duotone (luminosity blend at 90% over `cobalt`).

### Motion
- **`ease-glaze`** (`cubic-bezier(0.16, 1, 0.3, 1)`): the only custom easing, a slow glaze-like settle.
- Plate rotation and panel counter-rotation take 1100ms, panel fill 600ms, and the button lift 300ms. Colour hovers use the default 150ms.
- **Reduced motion:** under `prefers-reduced-motion: reduce`, all transitions and animations collapse to 0.01ms, so the plate turns instantly.

**Entrance language: ink, glaze and kiln** (`app/motion.css`, `components/motion/*`). Every entrance plays once, the first time its element scrolls into view.
- **Write-on (the unseen pen):** display headings and brush hanzi use `<WriteOn>`. The text stays real and inline. Each word, or each hanzi in `mode="char"`, is uncovered by a soft, feathered ink edge over 760ms with a slight blur settling to sharp. The edge travels in the reading direction: right to left in Arabic, left to right in Latin script, and top to bottom per character for Chinese, like a brush stroke. Words follow each other at about 120ms and hanzi at about 140ms. No pen or cursor is ever drawn. Strokes must stay `display: inline`, because inline-blocks are reordered by the bidi algorithm and would reverse hanzi or Latin runs inside Arabic lines.
- **Glaze settle (`data-reveal`):** body copy and blocks rise 18px and fade in over 900ms. `data-reveal="stagger"` staggers its `data-reveal-item` children by 110ms, for the steps and the levels ledger.
- **Painted bands (`data-reveal="band"`):** borders are painted along the reading direction with a clip over 1400ms.
- **Kiln path (`data-reveal="path"`):** the spine draws downward and each row then fires in turn, with the node scaling in about 160ms after the previous one.
- **Plate:** settles onto the field from a 28° turn against the reading direction at 94% scale (1600ms).
- **Seal (`data-reveal="seal"`):** stamps down from 135% with a slight overshoot.
- **Boot:** the client observer opts in (`html[data-motion="ready"]`) only after hydration yields and only when motion is allowed. It watches both the initial document and later App Router streamed nodes, so client navigation cannot leave new lesson content transparent. Before opt-in, without JavaScript, and under reduced motion, everything remains visibly in its final state.

### Accessibility
- **Focus ring:** 2px `glaze` outline at 2px offset plus a 5px `cobalt-mid` halo. The outline carries on cobalt fields and the halo on glaze.
- **Contrast:** `deep` on glaze is 13.5:1, `cobalt` on glaze 8.9:1, `unfired-ink` on glaze 5.4:1, `wash` on deep 8.7:1, `wash-strong` on deep 6.1:1, and glaze on `seal` 4.8:1. `wash-strong` on `cobalt` is 4.0:1, so keep it to large or decorative text there.
- **Plate keyboard:** roving tabindex, so only the selected radio is tabbable. Arrow keys move in reading direction (in RTL, ArrowLeft is forward) and wrap around.
- **Language:** correct `lang` and `dir` per locale, and `lang="zh"` on every inline Chinese run.

## Do's and Don'ts

### Do:
- **Do** build every surface from glaze and the cobalt depths. Pick `deep` or `cobalt` for fields and `glaze` or `glaze-shade` for reading grounds.
- **Do** separate major sections with one painted band (wave or lotus), never two stacked.
- **Do** reserve `seal` for Mazen's seal and the one current item in a context.
- **Do** set display text with `font-display` so it switches by locale, and mark inline Chinese with `lang="zh"` in the brush face.
- **Do** format every number with `ar-EG` digits in Arabic, and tabular figures for counts and progress.
- **Do** use only logical start/end properties, and mirror directional icons and motion under RTL.
- **Do** author motifs, plate and seal as inline SVG using token colours.
- **Do** label sample and pending content with the dashed sample tag until real assets exist.

### Don't:
- **Don't** use red and gold together, or any gold, yellow or warm accent. Cinnabar is a seal, not a theme colour.
- **Don't** introduce greys or hues outside the cobalt family, glaze and seal.
- **Don't** put eyebrows or kickers (small uppercase or tracked labels) above headings. The hero's Chinese line is part of the bilingual headline, not a kicker.
- **Don't** use gradient text. Gradients belong only to the painted glaze of the plate and the portrait placeholder.
- **Don't** use physical `left`/`right`, `ml-`/`mr-`/`pl-`/`pr-` or `text-left`/`text-right`.
- **Don't** let the `unfired` line be the only signal of a state.
- **Don't** replace the authored plate, seal or bands with raster images, stock porcelain or icon fonts.
- **Don't** invent testimonials, learner counts or ratings to fill placeholders.
