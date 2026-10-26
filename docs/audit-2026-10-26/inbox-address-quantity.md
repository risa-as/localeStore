# Inbox draft extraction: six customer examples

Changes are local; no orders, customer messages, Meta settings, or production data
were changed by this work.

## Addresses and province suggestions

- Normalize Kurdish Kaf and Yeh variants for matching while retaining the original
  address text. Recognize `سليماني`, `سلیمانی`, and `سلێمانی` as Sulaymaniyah.
- Recognize `کلار صمود` as an address and suggest the store's Sulaymaniyah delivery
  category. Kalar/Garmian is not a separate category in the store's existing list.
  This is explicitly presented as an inferred value requiring operator review.
- Extend the existing Baghdad area suggestions to standalone `الاعظمية`,
  `نفق الشرطة`, and the compound `اليرموك اربع شوارع`.
- Keep `اليرموك` alone ambiguous, and preserve an explicitly supplied province.
- Infer only from the selected address, excluding older question messages.
- Append an immediately adjacent business landmark such as `خدمات زيوت بترومين`
  only when an address has already been identified. Do not treat that line alone
  as a full delivery address.

Geographic references consulted:

- [University of Garmian contact address](https://younis.garmian.edu.krd/contact)
  names Kalar and Sulaymaniyah Province.
- [KRG Kalar project announcement](https://gov.krd/dmi-en/activities/news-and-press-releases/2025/october/kalar-s-corniche-project-poised-to-drive-tourism-and-economic-revival/)
  identifies Kalar in Garmian Administration.
- [Amanat Baghdad street list](https://api.amanatbaghdad.gov.iq/files/684a9c5f-f43b-4389-825f-986228860cab.pdf)
  includes the Police Tunnel (`نفق الشرطة`).

## Quantity

Use the latest explicit customer quantity without adding repeated mentions:
`العدد 2`, `العدد ٢`, `العدد 2 قطعتين`, `قطعتين اريد`, and a phone number directly
followed by `قطعتين اريد` all yield 2. Later explicit corrections override earlier
quantities. Reject price questions, prices, date references, address numbers, and
unlabelled bare numbers as quantity evidence. Outgoing staff messages remain
excluded. The existing approval/stock/duplicate checks still run at submission.

## Validation

- 195 tests passed across inbox-order, inbox-quantity, inbox-actions, and
  inbox-workflow. Test customer names/numbers are synthetic.
- TypeScript `--noEmit` and focused ESLint passed.
- Tests cover all six supplied examples plus ambiguity, latest-quantity changes,
  price/phone exclusions, Arabic/Persian digits, and business-line continuation.
