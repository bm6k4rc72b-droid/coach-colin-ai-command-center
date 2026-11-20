# Writing the narration

A film that speaks is a person explaining something to one other person. It is written as one piece of talk, said
aloud, and only then given pictures. The first version of this skill got this wrong: it wrote one short sentence
to fit each shot, and the result was captions read aloud by a machine. This page is the method that replaced it,
built from how working explainer makers write (sources at the end).

`voice.md` covers the other half: who says it, and how it is performed and cut.

## The order of work

1. **Write the script first, whole**, as continuous talk, with no shot list in mind. Beside each sentence note what
   the viewer is looking at while it is said (a two-column script).
2. **Say it aloud and time it.** If you would not say a sentence that way to a friend, rewrite it.
3. **Only then cut it into shots.** A shot's `voice` is a run of the script, in order: usually a sentence, sometimes
   a clause when the picture changes mid-sentence. Read one after another, the shots' lines are the script.
4. **Perform it as one take, and cut the picture to the voice** (`voice.md`). The storyboard's times come from the
   take, never the other way round.

Kurzgesagt works script first, a dozen drafts, and the recorded voice "provides the timing for the animation
team". Nobody whose work is admired writes a line per finished shot.

## Shape

- **One question.** Raise it in the first sentence, answer it by the last. One question, not several.
- **Open on the viewer's world**: an everyday question, a thing they have seen, a belief they hold that is wrong.
  No greeting, no "in this video", no "to understand X we must first".
- **Start from the wrong belief when there is one.** A clear, correct explanation that ignores what the viewer
  already believes teaches measurably less than one that names the belief and breaks it.
- **Every join is "but" or "therefore"**, never "and then". If two sentences could swap places, one of them is not
  doing work.
- **End on the payoff**: the answer in one line the viewer can repeat, or the one thing they can now do. In a
  short that loops, the payoff comes second to last and the last line bridges into the first ("The loop", below).

| Length | Words (English, 130 to 150 a minute) | Shape |
| --- | --- | --- |
| 20 to 40 s short | 45 to 90 | one question, one mechanism, one takeaway; the hook is the first clause; at most two numbers |
| 45 to 60 s | 100 to 145 | hook, the turn ("but"), mechanism in two or three steps, payoff |
| 90 to 120 s | 200 to 290 | room for the wrong belief, an analogy, the objection, a recap |

Indonesian words run longer, so the same time holds fewer of them: plan on 105 to 150 words a minute, and trust
the timed read over the count.

## The loop (shorts)

A short is replayed: the app jumps from the last frame straight back to the first. Make that jump invisible, so the
end runs into the start and a second viewing feels like the same film carrying on. Set `"loop"` in the storyboard
(a portrait short has it by default) and write the script as a circle:

- **The last line is the first half of a sentence whose second half is the first line.** Read the last line and
  then the first: they must make one natural sentence. Read the first line alone: it must still be a strong cold
  open for someone who has never seen the film.
- **The payoff comes just before the bridge**, so the answer has landed before the film turns back on itself.
- **End open.** No full stop, no "see you", no "follow for more", no silent poster after the last word. The take
  ends mid-thought and the first word of the film finishes it. Put no closing punctuation on the last line, so the
  voice does not fall into a final cadence.
- **The seam is a breath long**: about 0.2 to 0.6 s from the last word to the end of the film plus the silence
  before the first word. `mix.py` measures it.

Examples (last line → first line):

- Indonesian: "...jadi kalau udah bunyi klik, berarti" → "Nozzle SPBU bisa berhenti sendiri pas tangkinya penuh. Kok bisa?"
- Indonesian: "...dan itu sebabnya kamu" → "Nangis tiap motong bawang. Padahal bawangnya nggak ngapa-ngapain."
- English: "...and that is exactly why" → "Noise-cancelling headphones make noise disappear by adding more sound."

The picture loops with the words: the last shot ends on the first shot's picture (the same camera, the same things
in the same places, a moment before frame 0), so the cut back is a continuous move, not a jump. `check.mjs` compares
the two frames. The music runs on past the last frame and `mix.py` lays that run-on over the opening, so the sound
carries straight through too.

## Sentences for the ear

The listener cannot look back. Everything follows from that.

- **Each sentence leans on the one before it**: a pronoun, "that", a repeated noun, a connector, an answer to a
  question just asked. Short sentences are fine; orphaned ones are not. This is the difference between talk and
  captions.
- **One idea a sentence.** Subject next to its verb. No clause tucked in the middle.
- **Vary the length.** A long sentence that builds, then a short one that lands. All short is clipped; all long is
  a drone.
- **Plain words and contractions.** "Car", not "vehicle"; "it's", not "it is".
- **Repeat the key noun.** Do not swap in a synonym to avoid repetition: the listener hears a new thing.
- **Signpost aloud.** There are no headings: "Here's the catch.", "So what does that mean?", "Now look at this."
  Phrases an editor would cut from an article give a viewer the second they need.
- **Few numbers, rounded, compared to something.** "Almost a million times faster", not "874,030 times". One
  number a sentence. The exact figure can sit on screen.
- **A beat after the big idea.** Let the turn and the payoff breathe; do not fill every gap.

## The voice and the picture

- **Say the words when their picture is on screen**, not before and not after.
- **The voice adds the why, or points the eye.** A sentence that only names what is visible ("Here we see a
  prism") is dead air.
- **Do not put the narration on screen as text.** In sixteen of sixteen tests, people learned more without
  on-screen text that repeats the voice. What helps is a key word or a short phrase beside the part of the picture
  it belongs to. So in a narrated landscape film a shot's `caption` is its key phrase (three or four words) or is
  left out, and numbers appear as figures in the picture.
- **Shorts are the exception by convention**: many are watched with the sound off, so portrait films show the
  spoken words, a few at a time, in step with the voice. That is a trade against the research, made knowingly.
- A film still has to make sense on mute: the picture and the key phrases carry it. Subtitles for the whole
  narration are written beside the take (`voice/subtitles.srt`) for the platform's own caption track.

## What makes it sound written, or machine-made

Cut these on sight:

- Openers that announce: "In this video", "Let's dive in", "To understand why, we need to", "Have you ever
  wondered" used as filler before the real question.
- "Not just X, but Y." Lists of three for rhythm. "It's worth noting." "Stands as a testament." Trailing "-ing"
  phrases that explain the significance of what was just said.
- Announced tension ("but what happened next would change everything") in place of the specific thing.
- Words nobody says: "individuals", "utilise", "numerous", "furthermore", "however" at the start of a sentence.
- A fact in every sentence and no sentence that reacts to one.

## Indonesian (bahasa Indonesia)

The register that works now is a standard sentence skeleton with everyday words dropped in: how a smart friend
explains, not how a textbook reads and not how a streamer talks. Kok Bisa?'s own formula is curiosity and
simplicity: answers "disederhanakan dengan bahasa manusia".

- **Pronouns: `kamu` for the viewer, `kita` for what we share, `kalian` for an audience.** Never `Anda`. `Gue` and
  `lo` are Jakarta-marked and belong to a creator with a face and a persona, not to a narrator.
- **Everyday forms** for the words that mark the register:

| Written (kaku) | Said (luwes) |
| --- | --- |
| tidak | nggak |
| hanya | cuma |
| mengapa | kenapa |
| bagaimana | gimana |
| sangat cepat | cepat banget |
| lalu, kemudian | terus, habis itu |
| oleh karena itu | makanya |
| namun, akan tetapi | tapi |
| X merupakan Y | X itu Y |
| apakah kamu tahu | tahu nggak |
| terlihat, terdengar | kelihatan, kedengaran |
| keduanya | dua-duanya |
| bersamaan | barengan |
| ketika, saat | waktu, pas |
| agar | biar, supaya |
| telah | udah, sudah |
| dapat | bisa |
| hal ini, hal tersebut | ini, itu |

- **Particles carry the warmth, in small doses**: `nah` to open a turn, `lho` or `kan` to share a surprise, `sih`
  and `kok` in a question, `deh` and `dong` rarely. At most one a sentence, and not in every sentence. A script
  with a particle on every line sounds like it is trying.
- **Connectors that pull the next sentence**: "Padahal...", "Masalahnya,...", "Ternyata,...", "Nah,...",
  "Makanya,...", "Artinya,...", "Jadi,...", "Terus, kenapa...?".
- **No "di mana" or "yang mana" as a relative** (that is English "where/which" in disguise): make it two sentences.
- **English only where Indonesians really say it** ("online", "update", "data"). No "which is", "literally",
  "basically". No trend slang: it dates in a year, and some of it is already old ("mantul", "santuy", "kuy").
- **Numbers the way they are said, in words, rounded and hedged**: "sekitar tiga ratus empat puluh meter per
  detik", "hampir sejuta kali", "dua ribu lebih". Years, percentages and decimals in words too ("tujuh puluh
  persen", "tiga koma lima"). Digits in the script are for the screen, not the voice.
- **Sentences of eighteen words or fewer**, one idea each ("sekali ucap langsung dimengerti").
- **Watch the letter e.** Indonesian spells two different vowels with it, and a speech model can pick the wrong
  one ("apel", "serang", "mental"). If a word like that carries meaning, ask the listener to check it, or choose
  another word.

### The same explanation, before and after

Before (what this skill first wrote: a caption a shot):

> Kenapa petir terlihat dulu, baru guntur terdengar? Padahal keduanya lahir bersamaan. Cahayanya sampai nyaris
> seketika. Suara cuma tiga ratus empat puluh tiga meter per detik. Cahaya hampir sejuta kali lebih cepat. Jadi,
> lihat kilat, lalu hitung detiknya.

After (about 25 seconds):

> Kenapa sih kilat selalu kelihatan duluan, baru gunturnya nyusul? Padahal dua-duanya muncul barengan, lho. Bedanya
> cuma di kecepatan. Cahaya itu ngebut banget, hampir sejuta kali lebih cepat dari suara, jadi kilatnya langsung
> sampai ke mata kamu. Suaranya? Cuma sekitar tiga ratus empat puluh meter per detik. Makanya, habis lihat kilat,
> coba hitung detiknya. Tiap tiga detik, artinya petirnya kira-kira satu kilometer dari kamu.

What changed: the fragments are joined by spoken connectors and a direct "kamu"; everyday forms replace the
written ones; the number is rounded and hedged; and the ending pays off with something the viewer can do.

## English

The same method. Contractions throughout; "you" and "we"; the plain word; one idea a sentence; a question to open
and the answer to close. International English: no idiom that needs a culture to decode, no sports metaphors,
units a viewer anywhere can picture.

## Before the script is recorded

`node kit/tools/storyboard.mjs` reads the script as a listener would and warns about what it can see: a sentence
too long for the ear, three clipped sentences in a row, a script that does not open on a question, digits in a
spoken line, written-register Indonesian words and persona pronouns, phrases that mark a script as machine-made, a
caption that repeats its spoken line. Clear the warnings or know why each one stands.

Then this, which no tool can do:

1. One question, raised in the first sentence and answered in the last.
2. It opens on the viewer's world; no greeting, no announcement.
3. Every join is "but" or "therefore".
4. Every sentence after the first leans on the one before.
5. One idea a sentence; nothing you would not say to a friend.
6. Read aloud, by a person if at all possible, and timed.
7. At most a few numbers, rounded, each compared to something.
8. No sentence only names the picture.
9. The register is right for the language and the audience (the Indonesian list above).
10. It ends on the payoff.

When the stakes justify it, give the script alone to a reviewer who did not write it, with this page, and ask only:
"would a person say this, in this language, to this audience? Mark every line that sounds written."

## Sources

- Kurzgesagt on its process: https://kurzgesagt.org/youtube/
- Vox's Joss Fong on writing for pictures: https://www.theopennotebook.com/2020/01/07/videogram-how-a-vox-video-explains-the-science-behind-the-first-photo-of-a-black-hole/ and https://www.nasw.org/article/show-not-tell-art-writing-science-videos
- NPR Training on writing for the ear: https://www.npr.org/sections/npr-training/2025/05/30/g-s1-65814/the-journey-from-print-to-radio-storytelling-a-guide-for-navigating-a-new-landscape and https://www.npr.org/sections/npr-training/2025/05/31/g-s1-66074/would-you-say-it-that-way-tips-on-writing-for-your-voice
- Mayer's multimedia principles (redundancy, coherence, contiguity, personalization): https://ugc.futurelearn.com/uploads/files/7d/d6/7dd6188d-c343-4311-b064-ac98d2c95abc/Multimedia_Principles._R._E._Mayer__2020.pdf
- Derek Muller's research on misconceptions: https://www.scientificamerican.com/article/how-youtube-star-derek-muller-of-veritasium-is-challenging-scientific/
- Pace for educational video: https://ctl.columbia.edu/resources-and-technology/teaching-with-technology/diy-video/effective-videos/script-writing/
- Signs of machine writing: https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing
- Kok Bisa?'s register, studied: https://teewanjournal.com/index.php/juragan/article/view/3521 ; its founder's formula: https://kumparan.com/kumparannews/belajar-asyik-via-youtube-dengan-kok-bisa
- Indonesian radio writing ("sekali ucap langsung dimengerti", rounding numbers): https://repository.unikom.ac.id/63328/1/Teknik%20Penulisan%20Berita%20Radio.pdf and https://ejournal.undip.ac.id/index.php/interaksi/article/download/13824/10470
- Colloquial Indonesian particles and forms (Sneddon): https://core.ac.uk/download/160609532.pdf
- "Di mana / yang mana" as interference from English: https://journal.ugm.ac.id/jurnal-humaniora/article/download/881/728

What this rests on, honestly: the Indonesian sources were read as search summaries, not in full; no forum or
community thread could be opened; and the particle and slang limits are the researcher's judgement, not a
measured rule. The test that counts is an Indonesian speaker listening.
