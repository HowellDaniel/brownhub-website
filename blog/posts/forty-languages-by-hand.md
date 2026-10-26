---
title: We rewrote this site into forty languages by hand
slug: forty-languages-by-hand
date: 2026-10-25
desc: Why the studio deleted a machine-translation proxy, what it cost, and what a hand-written dictionary actually holds.
tags: [Website, Translating]
---

The site offers forty languages. None of them came from a translate widget, and there is a
reason the number stopped at forty instead of ninety.

## What we had before

A proxy service that translated the page on the fly. It was one line of work, it covered
almost every language on earth, and it was wrong in a way that a design studio cannot afford:
it rewrote the words that carry a promise. A sentence about what happens after you send an
enquiry came back as a sentence about something else, in Turkish and in Portuguese and in
Twi, and the page had no way of telling you.

Machine translation is a good tool for reading a foreign manual at 2am. It is a bad tool for
putting your warranty in writing in a language you do not speak.

## What we replaced it with

Hand-written dictionaries, one JSON file per language, keyed by the English sentence itself.
Right now there are thirty-nine files: twelve of them are full dictionaries covering the
whole site, eleven hold the complete set of 1,109 strings, and the other twenty-seven carry a
196-string core — the nav, the hero, the prices, the enquiry form, the things a first-time
visitor actually reads. The twelfth full one, Twi, sits three keys short, and those three are
the journal's own byline words, so a Twi reader sees "Published" and "min read" in English.
That is the design working, not failing: any string absent from a dictionary falls back to
English rather than being invented on the spot by someone who does not speak it.

Eighteen thousand five hundred and ninety-seven translated strings, in total. Nobody
machine-checked them for meaning, because you cannot machine-check meaning.

## What the work is really like

The hard part is not the volume, it is that a key is a full English sentence, so the same
words have to land identically everywhere they appear. Change one heading in English and
thirty-nine files need to agree with the new one, or the page shows English in the middle of
French. So the discipline is: edit English, sweep the dictionaries, and let the fallback catch
what is not finished.

The other hard part is that some things must never be translated at all. A price is a price —
`GH₵` and digits. A WhatsApp number is a number. A product name someone searched for is a
proper noun. Those carry an explicit "do not translate" mark, because a translation layer that
is good enough to fix your sentences is also good enough to break your phone number.

And direction is its own job. Arabic and Hebrew flip the layout, which means a picture rail
that pans sideways has to pan the other way, a centred label has to stop leaning on the wrong
side of its neighbour, and every one of those bugs is invisible to anyone reading English.

## Why forty and not ninety

Forty covers every language a customer here is plausibly going to arrive with — English and
French across West Africa, Portuguese for Angola and Mozambique, Arabic for the north, Twi and
Ewe and Hausa and Swahili at home, and the big European and Asian set because the studio takes
work over the counter of the internet.

Each one of those is a page we would have to keep honest forever. Ninety would be ninety
languages we cannot check.

> A language nobody proofreads is worse than no language, because it says something you did
> not mean, confidently.

## What it costs per release

A new band on the site is roughly a dozen new strings. The pass each one takes is the same
four steps, every time:

1. Write the band in English and read it once as a customer would.
2. Add those lines to the twelve full dictionaries the same day.
3. Leave the other twenty-seven alone; the fallback shows English until someone who speaks
   them sends the words back.
4. Bump the dictionary's `?v=` number, or a returning visitor on a phone keeps reading the
   old file and none of the work lands.

That last step is the one that bites. The dictionaries are cached by a service worker, so a
translation that exists on the server and not in the reader's browser is a translation that
does not exist. The number lives in one line of one script rather than in thirty-nine places,
which is the only reason the step is survivable at all.

Twelve dictionaries get them the same day, and the other twenty-seven get them when someone
who speaks them sends the English line back with the words filled in — which has happened,
twice, unasked, and is the only review process worth having.
