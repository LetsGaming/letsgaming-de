# Copy sheet for the production CMS

The seed only fills a fresh database. The live site keeps the text stored in its CMS, so the new wording must be pasted in by hand. Each row below says where it goes.

Rules used for every string: no em or en dashes, sentence case, no stock adverbs ("quietly", "genuinely"), one label per intent, and no new facts. Every fact comes from the old copy.

## Hero and about (CMS: Site content)

| Field | EN | DE |
|---|---|---|
| Headline, before | `I build websites. After hours I ` | `Ich baue Websites. Nach Feierabend ` |
| Headline, highlighted word | `tinker` | `bastle` |
| Headline, after | `.` | ` ich.` |
| Lede | `I'm a full-time web developer in Germany. Outside work I build plant sensors, LED strips and a home lab.` | `Ich bin Webentwickler in Vollzeit. Nach der Arbeit baue ich Pflanzensensoren, LED-Streifen und ein Home Lab.` |
| Bio, paragraph 1 | `I'm a full-time web developer in Germany who came up through a Fachinformatiker Anwendungsentwicklung apprenticeship. Most of my day goes into interfaces that are easy to use.` | `Ich bin Webentwickler in Vollzeit und über eine Ausbildung zum Fachinformatiker für Anwendungsentwicklung hierhergekommen. Den größten Teil des Tages baue ich Oberflächen, die sich leicht bedienen lassen.` |
| Bio, paragraph 2 | `Outside work I'm happiest with a soldering iron or a Raspberry Pi nearby, usually attached to a plant, an LED strip, or a corner of my home lab that did not need automating.` | `Nach der Arbeit bin ich am glücklichsten mit einem Lötkolben oder einem Raspberry Pi in Reichweite, meistens an einer Pflanze, einem LED-Streifen oder einer Ecke im Home Lab, die man nicht hätte automatisieren müssen.` |
| Bio, paragraph 3 | `This site is a project too. A small custom CMS holds the text, and a backend pulls data from GitHub (and whatever I connect next), so the pages stay current without me.` | `Diese Seite ist auch so ein Projekt. Ein kleines, selbstgebautes CMS hält die Texte, ein Backend holt Daten von GitHub (und was ich als Nächstes anschließe), damit die Seiten ohne mich aktuell bleiben.` |

## Lately ("Now" items)

| Item | EN value | DE value |
|---|---|---|
| building | `**plantcare-tracker** (watering schedules)` | `**plantcare-tracker** (Gießpläne)` |

The other three items had no tell and stay as they are.

## Links

| Link | EN label | DE label |
|---|---|---|
| Primary (contact) | `Contact` | `Kontakt` |

## Module headings (CMS: Layout, heading per module)

| Module | EN | DE |
|---|---|---|
| projects | `Projects` | `Projekte` |
| hobbies | `Hobbies` | `Hobbys` |
| gallery | `Photos` | `Fotos` |
| contact | `Contact` | `Kontakt` |

The Areas and At a glance modules were retired in the Home rebuild (see the section at the end). Other headings stay (Featured, Recent, This week, Right now, Time played, Listening, Wrapped, Lately, Guestbook, About, Blog).

## Not changed on purpose

- The four hobby blurbs ("where the name comes from", "more than I can count", "lights that do things", "automating the boring bits"). They carry no tell of their own, and a rewrite would risk inventing a claim (for example, "lights that react to things" says more than the original).
- Interface strings (empty states, form messages, error page, link text) are in the code catalog and need no CMS change.

## Owner to confirm (German UI wording, added in the hardening pass)

| Place | Before | Now |
|---|---|---|
| Wave button | Winken | Hallo sagen |
| Wave label | Hallo winken | Hallo sagen |
| Wave count | {n}-mal gewinkt | {n}-mal Hallo gesagt |
| Wave done | Gewinkt | Hallo gesagt |
| Coding range (7 days) | last 7 days (English in German) | letzte 7 Tage |
| Ages in German | vor 2d | vor 2 T (Min, Std, T, Wo, Mon, J) |

"Winken" is not idiomatic for a greeting button, so the default changed. Revert in `packages/core/src/ui-messages.ts` if you prefer it.

## Home rebuild (2026-11-19): owner to confirm

The lede above replaces the earlier one (the apprenticeship title stays in the About bio). Paste it into the CMS (Site content, Home). The module headings below arrive by themselves when the API boots, so nothing to paste, but check the wording.

| Place | English | German |
|---|---|---|
| Module heading `week` | This week | Diese Woche |
| Module heading `playing` | Games and music | Spiele und Musik |
| Module heading `recent` | Latest on GitHub | Neu auf GitHub |
| Sentence, both facts | I coded for {code}{share} and played for {games}. | Ich habe {code}{share} programmiert und {games} gespielt. |
| Sentence, code only | I coded for {code}{share}. | Ich habe {code}{share} programmiert. |
| Sentence, games only | I played for {games}. | Ich habe {games} gespielt. |
| Language share | ({pct}% {language}) | ({pct} % {language}) |
| Latest event | {event}, {age} ago. | {event}, vor {age}. |
| Hours | {n} hour, {n} hours | {n} Stunde, {n} Stunden |

Rules behind the sentence: only the last 7 days of coding time (never an older range), only fresh synced data, and a clause with no data is left out. "{age}" uses the short form the site already uses elsewhere (for example "2d", "vor 2 T").
