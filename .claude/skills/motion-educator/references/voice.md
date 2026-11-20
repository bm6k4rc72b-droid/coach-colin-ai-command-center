# The voice: performing the narration and cutting to it

`narration.md` is about what is said. This page is about who says it and how: choosing the voice, performing the
script as one take, cutting the film to that take, and making the voice sit in the mix.

The rule that everything else follows from: **the narration is one continuous performance, and the picture is cut
to it.** A voice generated one sentence at a time restarts its intonation on every line, and trimming its pauses
and re-spacing the pieces finishes the job of making it sound like a machine. ElevenLabs' own documentation says
chunked generation causes "abrupt changes in prosody from one chunk to another".

## In the storyboard

```json
{
  "language": "id",
  "voice": { "voice_id": "...", "name": "Jefri", "model": "eleven_v4", "language": "id", "direction": "[warmly]" },
  "shots": [
    { "id": "s01", "voice": "Kenapa sih kilat selalu kelihatan duluan, baru gunturnya nyusul?" },
    { "id": "s02", "voice": "Padahal dua-duanya muncul barengan, lho.", "caption": "muncul *barengan*" },
    { "id": "s09", "start": 0, "end": 2.5 }
  ]
}
```

- A speaking shot's `voice` is its run of the script, in order. Read one after another, they are the script.
- A shot with no `voice` is a silent beat and keeps the length it is given (a poster, a picture that needs a
  moment). `"hold": 0.6` on a speaking shot adds that much silence after its line.
- `caption` in a narrated film is a key phrase for the screen, not the spoken line again (`narration.md`).
  `*stars*` mark the accent word, in a caption or in a `voice` line (they are not spoken). Punctuation can sit
  inside or outside the stars.
- `direction` is one delivery tag placed before the whole take. Tags can also sit inside a line where the delivery
  changes: `"voice": "[short pause] Makanya, habis lihat kilat, coba hitung detiknya."`

## Choosing the voice

The docs call this "the most significant decision", and it is the one an agent is worst placed to make: you cannot
hear. So:

1. **Native to the language.** Filter the voice library by language and take professional voices recorded in it.
   Pre-made and generated voices are English voices speaking other languages with an accent.
2. **Match the register of the script**: a warm, conversational voice for everyday talk; not an announcer, a news
   reader or a voice whose own description says "formal" or "stiff".
3. **Shortlist two or three, and let a person choose.** Every library voice has a preview recording. Better: perform
   the film's first two sentences in each shortlisted voice and send those, so the person hears their own script.
   It costs a few hundred characters and saves a film in the wrong voice.
4. One voice a film; the same voice across a series.

If nobody can listen before the film is made, say which voice you chose and why, and that it is a guess.

## Performing the script: one take

```sh
node kit/audio/voice.mjs films/NAME --script      # the take to perform, and each shot's part of it
```

**Model.** `eleven_v4` first: ElevenLabs' current model, recommended by them for narration, Indonesian among its
languages, and it takes delivery tags. `eleven_multilingual_v2` is the steadier fallback (no tags, but `speed` and
`<break time="0.6s" />`). Do not use a model because it is the one you used last time.

**Length.** A 20 to 60 second film is 300 to 900 characters: one request. Past about 900 characters quality can
drift; split longer scripts at paragraphs (acts) and keep continuity with request stitching
(`previous_request_ids`) when you have the API.

**Preparing the text** (what is performed, not what is shown):

- Numbers, units, years and percentages as words, in the script's language. The tool warns about digits.
- Acronyms and foreign names the way they should sound; on v4 a word can be replaced by its IPA between slashes.
- Punctuation is the performance: commas and full stops are pauses, a dash is a short beat, a question mark lifts.
  An ellipsis reads as hesitation: keep it out of confident explaining.
- Capitals for emphasis, at most once or twice a film.
- Tags (v4, v3 only), sparingly: one calm direction at the top (`[warmly]`), `[short pause]` before the turn or the
  payoff. A tag holds until the next one. Tags describe how a line is spoken, not what happens.
- Leave voice settings at their defaults (stability about 0.5, similarity about 0.75, style 0) unless a listener
  asks for a change: steadier is higher stability, livelier is lower. Style above zero makes pace and pronunciation
  unstable.

**With an API key** (`ELEVENLABS_API_KEY`):

```sh
node kit/audio/voice.mjs films/NAME --generate    # the take and the time of every word, in one request
```

**With a speech connector and no key** (an agent that has ElevenLabs tools):

0. Price it first: the same call with `estimate_only: true` returns the credits it will cost without spending any.
   A take on `eleven_v4` costs roughly one credit a character (about 530 for a 35 second script). If the account
   cannot cover it, stop and tell the person: never shorten the script to fit the balance.
1. Take the `take` text from `--script`. Generate it once: the storyboard's `voice_id`, model `eleven_v4`, one
   variation. Poll until it completes and keep the audio URL.
2. Transcribe that same audio with word times (the connector's speech-to-text on the generated node) and keep the
   URL of the word list.
3. Hand both back:

```sh
node kit/audio/voice.mjs films/NAME --take AUDIO_URL --words WORDS_URL
```

Each generation spends the owner's credits. Do not generate again unless the script changed or a listener asked.

Either way, the word times come from the speech service (or a transcription of its own audio), so "100% of the
script aligned" only means the alignment worked. It cannot tell you a word was mispronounced: Indonesian's two
sounds of *e* are the usual trap. A person has to listen.

## What the tool does with the take

It lines the heard words up with the written ones, and reports how much of the script was heard as written and
which words were not. Those words are the places to listen to: a number read differently, a name, a word the model
got wrong. Then it cuts the film to the take:

- A shot starts a tenth of a second before its first word. The film's first word comes 0.15 s in.
- The take plays through unbroken wherever one line follows another: the performer's own pauses are kept.
- It is opened only at a silent shot, a `hold`, or a pause held longer than 0.75 s (shortened to that).
- Every shot's `start` and `end` in `storyboard.json`, and the film's `duration`, are rewritten from the take.

```sh
node kit/audio/voice.mjs films/NAME               # the script, the take, the agreement, every shot's time
node kit/audio/voice.mjs films/NAME --retime      # again, after storyboard.json was regenerated
```

If the storyboard is written by a script of your own (a `storyboard.build.py`), run `--retime` after it each time:
the build writes the plan, the take sets the times. Build the film only after the take exists; a shot's length is
a guess until then.

**After the take, look at the cut.** A shot under a second and a half is a line too short to carry a picture: join
it to its neighbour. A shot over six seconds needs a second picture: split the line at a clause. Then fix the
script, not the audio, and perform it again.

The cuts follow the voice, so they no longer sit on the music's beat. That is how narrated explainers are cut. Put
the big hits on the cuts that matter and let the bed run under.

## In the mix

The mixer plays the take in the stretches the cut made, through a voice chain, and makes room for it:

| Step | Default | Why |
| --- | --- | --- |
| High-pass | 85 Hz | rumble a voice does not need |
| Low-mid dip, presence lift | -1.5 dB at 220 Hz, +2 dB at 2.4 kHz | clarity on a phone speaker |
| De-esser | light | generated voices hiss on s and c |
| Compression | 3:1, soft knee | even level without pumping |
| Level | -16 LUFS before the master | the voice is the loudest thing in the film |
| Music under speech | 11 dB lower while someone speaks | with a bed at -22 LUFS, that is about 18 dB under the voice |
| Effects under speech | 4 dB lower | they go between the words anyway |

Change any of it in `cues.json`:

```json
{ "music": { "file": "lib/music/xceed_thru_johann.mp3", "lufs": -22 }, "voice": { "lufs": -16, "duck_db": -11, "sfx_db": -4 } }
```

- Choose a bed without a lead melody, and keep it low: under a voice, music is felt more than heard.
- Effects go between the words. A hit lands on a cut, before the line starts.
- `mix.py --no-voice` makes the version without narration, for tracing a complaint to the right layer.
- A stretch of the take that came out quieter than the rest: `"voice": { "gain": [{ "from": 56.2, "to": 59.1, "db": 2 }] }`
  lifts it (film seconds, 60 ms ramps). The mix is trimmed to the picture and limited oversampled, so its true peak
  holds under -1 dBTP. An AAC re-encode for delivery can add a decibel back: limit again (oversampled) when you make one.

## What to say when you deliver

That nobody has listened. Name the voice and the model. Give the measured pace (words a minute) and the words the
tool did not hear as written. Ask the person to listen for: the voice itself (is it the right person for this?),
pronunciation of names and numbers, any place the tone restarts or a pause feels wrong, and whether the music
crowds the voice. Offer the same film in a second voice if they hesitate about the first.
