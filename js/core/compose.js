/* ══════════════════════════════════════════════════════════════
   PRISM · compose — the local composers

   Every mission has a composer: input → a structured document.
   These are deterministic (seeded by the inputs), so the same
   brief gives the same artefact, and a "refine" re-seeds to give
   a genuinely different angle rather than random noise.

   Document blocks:
     {t:'note',  text}
     {t:'list',  h, items:[string | {b, text}], ordered}
     {t:'steps', h, items:[{b, text}]}
     {t:'quote', h, text}
     {t:'stats', h, items:[{k, v, n}]}
     {t:'tags',  h, items:[string]}
   ══════════════════════════════════════════════════════════════ */

P.compose = (function () {
  'use strict';

  const U = P.util;

  /* ── small helpers ────────────────────────────────────────── */

  const note  = text            => ({ t: 'note', text });
  const list  = (h, items, o)   => ({ t: 'list', h, items, ordered: !!o });
  const steps = (h, items)      => ({ t: 'steps', h, items });
  const quote = (h, text)       => ({ t: 'quote', h, text });
  const stats = (h, items)      => ({ t: 'stats', h, items });
  const tags  = (h, items)      => ({ t: 'tags', h, items });

  const n  = v => { const x = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(x) ? x : 0; };
  const pc = (a, b) => b > 0 ? U.round1((a / b) * 100) : 0;
  const money = v => (Math.round(v * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 });

  /** Nudge output when the reader asked to refine. */
  function applyTone(doc, mod) {
    if (!mod) return doc;
    const map = {
      shorter:  'Trimmed — every block cut to the part you would actually send.',
      bolder:   'Turned up — more opinion, fewer hedges.',
      specific: 'Tightened — vague nouns swapped for concrete ones.',
      angle:    'Different angle — same brief, rebuilt from another direction.'
    };
    if (map[mod]) doc.blocks.unshift(note(map[mod]));
    if (mod === 'shorter') {
      doc.blocks = doc.blocks.map(b => {
        if (b.items && b.items.length > 4) return { ...b, items: b.items.slice(0, 4) };
        return b;
      });
    }
    return doc;
  }

  /** A hook has to scan out loud, so trim a long brief to its subject. */
  function subject(topic) {
    const t = U.unpunct(topic);
    const cut = t.split(/\s+(?:for|when|if|that|which|about)\s+/i)[0];
    const words = cut.split(/\s+/);
    return (words.length > 4 ? words.slice(0, 4).join(' ') : cut) || t;
  }

  /* ══════════════════════════════════════════════════════════
     ATLAS · strategy
     ══════════════════════════════════════════════════════════ */

  const ATLAS = {
    arc90(i, r) {
      const goal = U.unpunct(i.goal) || 'grow the business';
      const now = U.unpunct(i.now) || 'where you are today';
      const hrs = i.hours || '5–8 hours';
      const light = /2–4/.test(hrs);

      const phases = [
        {
          name: 'Days 1–30 · Clear the deck',
          focus: light
            ? 'One channel, one offer, nothing else. You do not have the hours for a second front.'
            : 'Strip back to the one offer and the one channel that already works, then run them properly.',
          weekly: [
            'Write down the offer in a single sentence a stranger would understand.',
            'Pick the ONE place you will show up. Delete the rest from your week.',
            'Talk to five people who already know you before you talk to any stranger.'
          ],
          metric: 'Conversations started with a real human being.',
          risk: 'You add a second channel "just to test it". Do not.'
        },
        {
          name: 'Days 31–60 · Make it repeatable',
          focus: 'Stop inventing. Whatever worked in month one, turn it into a thing you do on a schedule.',
          weekly: [
            'Same offer, same channel, higher volume — double what you did in month one.',
            'Write down what you say when someone asks the price. Use it word for word.',
            'Book one call a week minimum. Put it in the calendar before you have the lead.'
          ],
          metric: 'Calls booked per week — the only number that predicts month three.',
          risk: 'Month one worked, so you get bored and change it. Boredom is not a signal.'
        },
        {
          name: 'Days 61–90 · Load it up',
          focus: 'Now you push volume through a machine you trust. This is the month that hits the goal.',
          weekly: [
            'Raise volume again, or raise the price. Pick one, not both.',
            'Ask every happy client one question: who else do you know?',
            'Cut the single lowest-return activity from your week entirely.'
          ],
          metric: 'Signed clients — and how many came from someone you already knew.',
          risk: 'You hit the number in week 10 and coast. Finish the block.'
        }
      ];

      return {
        title: '90-Day Arc',
        subtitle: goal,
        blocks: [
          note('Starting from: ' + now + '. Budget: ' + hrs + ' a week. Everything below assumes you will get roughly 70% of it done — that is normal and the plan still works.'),
          ...phases.map(p => steps(p.name, [
            { b: 'Focus', text: p.focus },
            { b: 'Every week', text: p.weekly.join(' · ') },
            { b: 'The number', text: p.metric },
            { b: 'The trap', text: p.risk }
          ])),
          quote('If you only do one thing',
            U.cap(phases[0].weekly[2].toLowerCase())  + ' Warm conversations close at several times the rate of cold ones, and you already have a list of them in your phone.'),
          tags('Ignore for 90 days', U.sample(
            ['a second social platform', 'a podcast', 'rebranding', 'a new website',
             'a course', 'a paid ad budget', 'a lead magnet redesign', 'a new booking system'], 4, r))
        ]
      };
    },

    week(i, r) {
      const focus = U.unpunct(i.focus) || 'the one thing';
      const load = i.load || 'Half full';
      const tight = /Packed|Overflowing/.test(load);

      const days = [
        { d: 'Monday',    b: 'Hardest thing first', t: 'The single task that moves "' + focus + '". Before email, before DMs. 45 minutes.' },
        { d: 'Tuesday',   b: 'Output day',          t: 'Make the thing. Do not polish it — a finished rough version beats a perfect unfinished one.' },
        { d: 'Wednesday', b: 'People day',          t: 'Every conversation you have been putting off. Batch them so they cost you one context switch, not five.' },
        { d: 'Thursday',  b: 'Second push',         t: 'Repeat Monday. This is the day most weeks quietly die — protect it.' },
        { d: 'Friday',    b: 'Close the loop',      t: 'Follow up everyone from Wednesday. Then write next week’s one thing while it is fresh.' }
      ];

      return {
        title: 'Week Shaper',
        subtitle: focus,
        blocks: [
          note(tight
            ? 'Your week is already ' + load.toLowerCase() + ', so this plan is deliberately thin. Three real blocks beat five imaginary ones.'
            : 'You have room this week. The risk is not lack of time, it is spreading it evenly across things that do not matter equally.'),
          steps('The shape', days.map(x => ({ b: x.d + ' — ' + x.b, text: x.t }))),
          list('Drop these without guilt', U.sample([
            'Anything that needs someone else to reply before it can start.',
            'The post you have rewritten more than twice.',
            'Admin that nobody will notice for another fortnight.',
            'Any "quick catch-up" with no decision attached to it.',
            'Reorganising your files, folders or app of choice.',
            'Reading one more thing before you begin.'
          ], tight ? 4 : 3, r)),
          quote('The test on Friday',
            'Did "' + focus + '" move? If yes, the week worked, even if everything else slipped. If no, nothing else you did counts.')
        ]
      };
    },

    cut(i, r) {
      const raw = String(i.doing || '');
      const items = raw.split(/[,\n;]+/).map(s => s.trim()).filter(Boolean);
      const pool = items.length ? items : ['daily posts', 'free consults', 'a newsletter', 'DMs', 'programme writing'];

      const verdicts = ['Keep', 'Keep', 'Halve', 'Halve', 'Batch it', 'Stop', 'Stop'];
      const reasons = {
        'Keep':    'This is load-bearing. Protect the time it needs.',
        'Halve':   'Doing this at half the volume costs you almost nothing and buys back a real block of hours.',
        'Batch it':'The work is fine, the switching cost is not. One session a week, same slot.',
        'Stop':    'This is a habit, not a strategy. Nobody will notice for a month, and you will get the time back this week.'
      };

      const ranked = U.shuffle(pool, r).map((item, idx) => {
        const v = verdicts[Math.min(idx, verdicts.length - 1)];
        return { b: v + ' — ' + item, text: reasons[v] };
      });

      const stops = ranked.filter(x => x.b.startsWith('Stop')).length;

      return {
        title: 'The Cut List',
        subtitle: pool.length + ' activities, ranked',
        blocks: [
          note('Sorted by what each one is quietly costing you against what it returns. The order matters more than the exact verdict — start at the bottom.'),
          steps('Verdicts', ranked),
          quote('Start here',
            stops
              ? 'Cut the bottom item today. Not next month — today, before you talk yourself into keeping it. One cut you actually make beats five you plan.'
              : 'Nothing here is pure waste, which means your problem is volume, not selection. Halve the bottom two rather than cutting them.'),
          list('Ask of anything you kept', [
            'If I stopped this for four weeks, who would notice?',
            'Has this ever produced a paying client, traceably?',
            'Am I doing this because it works, or because stopping feels like giving up?'
          ])
        ]
      };
    }
  };

  /* ══════════════════════════════════════════════════════════
     VERSE · content
     ══════════════════════════════════════════════════════════ */

  const VERSE = {
    hooks(i, r) {
      const topic = U.unpunct(i.topic) || 'the thing you know';
      const subj = subject(topic);
      const who = U.unpunct(i.who) || 'your people';
      const plat = i.platform || 'Instagram';

      const styles = [
        { n: 'Contrarian',  h: 'Everything you have been told about ' + subj + ' was written for someone who is not you.' },
        { n: 'The number',  h: 'Three things about ' + subj + ' that nobody tells ' + who + '.' },
        { n: 'Callout',     h: 'If you are ' + who.replace(/^(a|the)\s+/, '') + ', this one is for you.' },
        { n: 'Confession',  h: 'I got ' + subj + ' wrong for years. Here is what changed.' },
        { n: 'Myth-bust',   h: 'No, ' + subj + ' is not the reason it is not working.' },
        { n: 'Before/after',h: 'What ' + subj + ' looked like before I understood it — and after.' },
        { n: 'Question',    h: 'Why does ' + subj + ' work for everyone except you?' },
        { n: 'Warning',     h: 'Do not touch ' + subj + ' until you have sorted one thing first.' }
      ];

      const timings = plat === 'Email'
        ? ['Subject line', 'First line (the preview text does the work)', 'The body', 'One link, one ask']
        : plat === 'YouTube'
          ? ['0:00 hook', '0:08 the promise', '0:20 the meat', 'Last 15s the ask']
          : ['First 2 seconds', 'Seconds 3–8', 'The middle', 'The last line'];

      return {
        title: 'Hook Forge',
        subtitle: topic + ' → ' + who,
        blocks: [
          note('Eight angles on one idea. Read them out loud — the one you stumble over is usually the one that is trying too hard.'),
          steps('Eight hooks', styles.map(s => ({ b: s.n, text: s.h }))),
          steps('The body underneath', [
            { b: timings[0], text: 'The hook. No preamble, no "hey guys". Start mid-thought.' },
            { b: timings[1], text: 'Name the problem in their words, not yours. "' + who + '" should recognise themselves in one line.' },
            { b: timings[2], text: 'One idea. Not three. The thing you would say if you had thirty seconds in a lift.' },
            { b: timings[3], text: 'The ask — small, specific, and one of them only.' }
          ]),
          list('Closes that do not sound like closing', U.sample([
            'If that is you, say "' + subj.split(' ')[0].toUpperCase() + '" and I will send you the thing I use.',
            'Tell me which one you have tried — I will tell you why it stalled.',
            'Save this for the week it stops working.',
            'Not selling anything today. Just do the first one.',
            'Reply with where you are stuck and I will point you at the fix.'
          ], 3, r)),
          tags('Built for', [plat, who, topic])
        ]
      };
    },

    script(i, r) {
      const point = U.unpunct(i.point) || 'the one thing you want them to remember';
      const who = U.unpunct(i.who) || 'your audience';
      const tone = i.tone || 'Direct';

      const opens = {
        Warm:          'You are not doing it wrong. The plan was.',
        Direct:        'Stop. This is the bit everybody skips.',
        Playful:       'Right — mildly controversial opinion incoming.',
        Authoritative: 'Ten years of coaching, and this is the pattern that never changes.'
      };

      return {
        title: 'Sixty-Second Script',
        subtitle: point,
        blocks: [
          note('Tone: ' + tone.toLowerCase() + '. Written for ' + who + '. Read it aloud once before you film — if you run out of breath, the sentence is too long.'),
          steps('The script', [
            { b: '0:00–0:03 · Hook', text: '“' + opens[tone] + '” — on screen: ' + point.toUpperCase().slice(0, 42) },
            { b: '0:03–0:12 · The problem', text: '“Here is what happens. You start well. Week two you are still fine. Week three, life does the thing life does — and the plan has no room in it for that.”' },
            { b: '0:12–0:30 · The turn', text: '“' + U.cap(point) + '. That is the whole idea. Not more discipline. Less plan.”' },
            { b: '0:30–0:48 · The proof', text: 'One specific example. A real client, a real number, a real week it went wrong. Specifics are the only thing that makes this believable.' },
            { b: '0:48–0:60 · The close', text: '“If you have quit three times, you do not need a harder plan. You need one built for your worst week, not your best one.”' }
          ]),
          list('On-screen text, in order', [
            point.toUpperCase().slice(0, 42),
            'WEEK 3 IS WHERE IT DIES',
            'BUILD FOR YOUR WORST WEEK',
            'NOT YOUR BEST ONE'
          ], true),
          quote('Delivery note', U.pick([
            'Cut the first three seconds in the edit. Your real first line is usually the second one you said.',
            'Do not smile at the hook. Smile at the close. The contrast is what holds people.',
            'One take, no script in front of you. Say it four times off camera first.',
            'Film it standing up. It changes your voice more than you think.'
          ], r))
        ]
      };
    },

    repurpose(i, r) {
      const src = U.unpunct(i.source) || 'your original piece';
      const seed = src.split(/[.!?]/)[0].slice(0, 90);

      return {
        title: 'Repurpose Engine',
        subtitle: 'One idea → five channels',
        blocks: [
          note('The mistake is posting the same words everywhere. Same idea, different shape — each of these is doing a different job.'),
          steps('Five rebuilds', [
            { b: 'Short video', text: 'Lead with the sharpest sentence: “' + seed + '”. Then one example, then one line of advice. Sixty seconds, no intro.' },
            { b: 'Carousel', text: 'Slide 1 = the claim. Slides 2–5 = one reason each. Slide 6 = what to do on Monday. Slide 7 = the ask.' },
            { b: 'Email', text: 'Open with the story you did NOT tell in the video — the messy version. Then the same lesson. Emails earn the long way round.' },
            { b: 'A single post', text: 'Take the one line people replied to and post it on its own, with no explanation. Let the comments do the work.' },
            { b: 'Client asset', text: 'Turn it into a one-page note you send to clients in the week they need it. This is the version that actually gets used.' }
          ]),
          list('Change per channel', [
            'The opening line — always. Nothing else needs to change as much.',
            'The length of the example. Video wants one; email can hold three.',
            'The ask. A reply, a save, a click and a booking are four different requests.'
          ]),
          quote('Spacing', 'Leave four days between the video and the email. Same week is fine — same day makes it obvious.')
        ]
      };
    }
  };

  /* ══════════════════════════════════════════════════════════
     FORGE · programme design
     ══════════════════════════════════════════════════════════ */

  const FORGE = {
    block(i, r) {
      const goal = i.goal || 'Strength';
      const days = parseInt(i.days || '3', 10);
      const level = i.level || 'Some';
      const kit = U.unpunct(i.kit) || 'a commercial gym';
      const isNew = level === 'Brand new';

      const splits = {
        2: ['Full body A', 'Full body B'],
        3: ['Full body A', 'Full body B', 'Full body C'],
        4: ['Lower A', 'Upper A', 'Lower B', 'Upper B'],
        5: ['Lower A', 'Upper A', 'Full body', 'Lower B', 'Upper B']
      };
      const split = splits[days] || splits[3];

      const patterns = {
        'Full body A': ['Squat pattern', 'Horizontal push', 'Horizontal pull', 'Carry'],
        'Full body B': ['Hinge pattern', 'Vertical push', 'Vertical pull', 'Core'],
        'Full body C': ['Split-stance leg', 'Push variation', 'Pull variation', 'Conditioning finisher'],
        'Lower A':     ['Squat pattern', 'Hinge accessory', 'Single leg', 'Calves + core'],
        'Lower B':     ['Hinge pattern', 'Squat accessory', 'Single leg', 'Core'],
        'Upper A':     ['Horizontal push', 'Horizontal pull', 'Vertical pull', 'Arms'],
        'Upper B':     ['Vertical push', 'Horizontal pull', 'Rear delts', 'Arms'],
        'Full body':   ['Squat or hinge', 'Push', 'Pull', 'Conditioning']
      };

      const setsFor = {
        'Fat loss':          '3 × 8–12, 60s rest, keep the pace up',
        'Strength':          '4 × 4–6 on the main lift, 3 × 8 on the rest, 2–3 min rest',
        'Muscle':            '3–4 × 8–12, last two reps should be hard, 90s rest',
        'General fitness':   '3 × 10, comfortable, finish feeling better than you started',
        'Return from injury':'2–3 × 10–15, nothing above a 6/10 effort, stop early'
      };

      const prog = {
        'Fat loss':          'Week 1–3 add reps or shorten rest. Week 4 cut volume by a third and keep intensity.',
        'Strength':          'Add 2.5kg to the main lift when you hit the top of the rep range on every set. Week 4, drop to 2 sets and keep the weight.',
        'Muscle':            'Add one rep per set per week. When you hit the top of the range everywhere, add weight and drop back to the bottom.',
        'General fitness':   'Add one set per session per fortnight. Nothing else needs to change.',
        'Return from injury':'Only progress when the previous week was completely symptom-free. Repeat weeks freely — repeating is not failing.'
      };

      return {
        title: 'Four-Week Block',
        subtitle: goal + ' · ' + days + ' days · ' + level.toLowerCase() + ' · ' + kit,
        blocks: [
          note(isNew
            ? 'Built for someone brand new, which means fewer exercises repeated more often. Familiarity is the training effect in month one.'
            : 'Four weeks, then reassess. Do not change the exercises mid-block — you will not know what worked.'),
          steps('The week', split.map((s, idx) => ({
            b: 'Day ' + (idx + 1) + ' · ' + s,
            text: (patterns[s] || patterns['Full body A']).join(' → ') + '. ' + setsFor[goal]
          }))),
          steps('How it progresses', [
            { b: 'The rule', text: prog[goal] },
            { b: 'Week 4', text: 'Deload. Same movements, two-thirds of the sets. They will feel great in week 5 and think you are a genius.' },
            { b: 'Missed session', text: 'Never make it up. Slide the week along and carry on — chasing missed sessions is how four-week blocks become eight.' }
          ]),
          quote('The fallback session',
            'For the days it all falls apart: one squat or hinge, one push, one pull. Three sets each, twenty minutes, done. This session is not a compromise — it is the reason people stay for a year.'),
          tags('Equipment assumed', kit.split(/[,+]/).map(s => s.trim()).filter(Boolean).slice(0, 4))
        ]
      };
    },

    swap(i, r) {
      const planned = U.unpunct(i.planned) || 'the planned session';
      const problem = i.problem || 'No time';

      const fixes = {
        'No time':      { b: 'Compress, do not cut', t: 'Take the two hardest movements from “' + planned + '” and superset them. Three rounds. Fifteen minutes. You keep about 80% of the stimulus for a third of the time.' },
        'Gym is packed':{ b: 'One station, everything', t: 'Claim a single rack or one pair of dumbbells and do not move. Rebuild “' + planned + '” around what you can reach without giving up the spot.' },
        'Sore or tweaked':{ b: 'Same pattern, different angle', t: 'Keep the movement pattern, change the tool and the range. If it hurts, it is not the session — swap it. Nothing today is worth three days off.' },
        'No energy':    { b: 'Lower the bar, keep the appointment', t: 'Half the sets, two-thirds of the weight, full effort on technique. The point today is turning up, not the training effect.' },
        'Travelling':   { b: 'Bodyweight equivalent', t: 'Every movement in “' + planned + '” has a bodyweight cousin. Higher reps, slower tempo, shorter rest. Twenty-five minutes in a hotel room.' }
      };

      const f = fixes[problem] || fixes['No time'];

      return {
        title: 'Session Rescue',
        subtitle: problem + ' → still trained',
        blocks: [
          note('The goal is not to replicate the session. It is to keep the streak and the pattern, so next week starts from a full tank instead of a guilty one.'),
          steps('Do this instead', [
            { b: f.b, text: f.t },
            { b: 'Keep', text: 'The hardest compound movement, and the warm-up. Those two are the session.' },
            { b: 'Drop', text: 'Accessories, arms, anything you would describe as "finishing off". Nobody has ever regressed from skipping these once.' },
            { b: 'Log it honestly', text: 'Write down what actually happened, not what was planned. Future-you needs the real data.' }
          ]),
          quote('Say this to them', U.pick([
            'Half a session is not half a week. It is the whole week, protected.',
            'The plan is a servant, not a boss. Today it serves you by getting out of the way.',
            'You did not fall off. You adjusted. That is the actual skill.'
          ], r))
        ]
      };
    },

    onboard(i, r) {
      const who = U.unpunct(i.who) || 'a nervous beginner';

      return {
        title: 'First Four Weeks',
        subtitle: who,
        blocks: [
          note('Designed so it cannot be failed. Week one is deliberately too easy — the win we are chasing is "I did all of it", not "I am sore".'),
          steps('The four weeks', [
            { b: 'Week 1 · Prove it is possible', text: 'Two sessions. Six movements total, repeated. Twenty-five minutes each. They should leave thinking "was that it?" — that is the design working.' },
            { b: 'Week 2 · Same again, slightly more', text: 'Identical sessions, one extra set each. Familiarity is doing the heavy lifting. Do not add anything new.' },
            { b: 'Week 3 · The wobble week', text: 'This is where people vanish. Message them on day two, not day six. Add one new movement so it feels like progress without feeling like a new plan.' },
            { b: 'Week 4 · Show them the receipts', text: 'Repeat week one exactly. They will do it comfortably. Point that out explicitly — most people cannot see their own progress without being shown.' }
          ]),
          list('Rules for the block', [
            'Never more than six exercises. They cannot remember more, and remembering is confidence.',
            'Same day, same time, every week. Decision-making is the enemy in month one.',
            'No numbers on a scale before week four.',
            'Every session ends with something they can do well. Finish on competence.'
          ]),
          quote('The week-three message',
            'Send this on the Tuesday: “Week three is the one that catches everyone — it stops being novel and it is not yet a habit. Just get to Thursday. That is the whole job this week.”'),
          tags('Watch for', ['a missed Tuesday', 'apologising for being slow', 'asking about a harder plan', 'going quiet after a good week'])
        ]
      };
    }
  };

  /* ══════════════════════════════════════════════════════════
     ECHO · replies & front desk
     ══════════════════════════════════════════════════════════ */

  const ECHO = {
    reply(i, r) {
      const msg = U.unpunct(i.msg) || 'their message';
      const want = i.want || 'Book a call';
      const short = msg.length > 96 ? msg.slice(0, 93) + '…' : msg;

      const byWant = {
        'Book a call': {
          warm:   'Hey! Great to hear from you. Easiest thing is a quick 15-minute chat so I can actually answer that properly rather than guessing — are you free Tuesday or Thursday evening?',
          direct: 'Happy to help. Before I quote you anything I need to know what you are actually training for. Fifteen minutes on the phone — Tuesday 6pm or Thursday 7pm?',
          curious:'Before I answer that — what made you look into coaching now, rather than six months ago? That answer usually changes what I would recommend. Quick call this week?'
        },
        'Send the price': {
          warm:   'Of course. It is £X a month, which covers [what they get]. Most people find the first month is where the real shift happens. Want me to send over what the first fortnight looks like?',
          direct: 'It is £X a month. That includes [what they get]. If that works, I have space from the [date] — if it does not, tell me and I will point you at something that does.',
          curious:'£X a month for [what they get]. Can I ask — is the price the actual question, or is it more "will this work for me"? They need different answers and I would rather give you the right one.'
        },
        'Politely decline': {
          warm:   'Thank you for asking me — genuinely. I do not think I am the right coach for this one, and you deserve someone who is. Can I point you at someone who would be a better fit?',
          direct: 'I am going to pass on this one. It is not the work I do well, and you would get a worse result with me than with the right person. Happy to recommend someone.',
          curious:'Before I answer — is this something you need done a specific way, or are you open on the approach? I might be the wrong fit, and I would rather say so now than in week three.'
        },
        'Buy time': {
          warm:   'Give me until tomorrow evening and I will come back to you properly — you have asked a good question and I do not want to fire off a half answer.',
          direct: 'I will answer this properly tomorrow. Short version: probably yes, but I want to check one thing first.',
          curious:'Quick one before I reply properly — is there a date you are working towards? That changes my answer quite a lot.'
        }
      };

      const set = byWant[want] || byWant['Book a call'];

      return {
        title: 'Reply Engine',
        subtitle: want,
        blocks: [
          quote('They said', short),
          steps('Three ways to answer', [
            { b: 'Warm', text: set.warm },
            { b: 'Direct', text: set.direct },
            { b: 'Curious', text: set.curious }
          ]),
          list('Whichever you pick', [
            'Reply inside four hours if you possibly can. Speed converts better than wording.',
            'Give two specific times, never "when are you free?" — an open question is another job for them.',
            'One question mark per message. Two makes it a form.',
            'Do not apologise for your price in the same sentence you say it.'
          ]),
          quote('If they go quiet',
            'Wait three days, then send one line: “Still thinking about it, or has life got in the way? Either is fine — just tell me which and I will stop nudging.” It gets a reply roughly half the time because it gives them an easy exit.')
        ]
      };
    },

    faq(i, r) {
      const biz = U.unpunct(i.biz) || 'coaching';
      const price = U.unpunct(i.price) || 'my rate';

      return {
        title: 'Front Desk Script',
        subtitle: biz,
        blocks: [
          note('Say these out loud until they stop sounding like a script. The point is not the wording — it is never having to invent an answer while someone waits.'),
          steps('The five you get every week', [
            { b: '“What do you actually do?”', text: '“' + U.cap(biz) + '. In practice that means I work out what your week can realistically hold, then build the training around that instead of the other way round.”' },
            { b: '“How much is it?”', text: '“' + price + '. That covers everything — the programme, the check-ins and me being on the end of the phone when it goes sideways.” Then stop talking. Do not fill the silence.' },
            { b: '“Do you do anything cheaper?”', text: '“Not really, no — I keep numbers low so everyone gets proper attention. If the price is the blocker, tell me and I will point you at something that would suit you better.”' },
            { b: '“Will it work for me?”', text: '“Honestly, I do not know yet. That is what the first call is for. If I do not think I can help you, I will say so.”' },
            { b: '“Can I think about it?”', text: '“Of course. Can I ask what you are weighing up? If it is the money that is a different conversation to whether it will work.”' }
          ]),
          list('Rules of the desk', [
            'Answer the price question with the price. Every deflection costs you trust.',
            'Never discount on the first ask. It reprices everything you sell afterwards.',
            'End every reply with a question or a time. Never a full stop.',
            'Log every enquiry, even the ones that go nowhere. The pattern in the "no"s is the most useful data you own.'
          ]),
          tags('Have ready', ['two call times', 'a one-line description', 'the price, said plainly', 'one client story'])
        ]
      };
    },

    objection(i, r) {
      const offer = U.unpunct(i.offer) || 'your offer';

      return {
        title: 'Objection Ladder',
        subtitle: offer,
        blocks: [
          note('Almost nobody says no. They say one of these five instead. Each one means something different, and only two of them are really about money.'),
          steps('The five, and what they mean', [
            { b: '“It is too expensive.”', text: 'Usually means: I cannot see the return yet. Answer: “Compared to what?” then make the value concrete — what changes in twelve weeks, in their language.' },
            { b: '“I need to think about it.”', text: 'Means: there is an unspoken objection. Answer: “Totally fair — what is the bit you are unsure about?” Then be quiet.' },
            { b: '“I need to ask my partner.”', text: 'Often genuine. Answer: “Makes sense. What do you think they will ask?” — then arm them with the answer, because you will not be in that conversation.' },
            { b: '“Now is not a great time.”', text: 'Means: I do not believe I will manage it. Answer: “When would be? And what would be different then?” Usually nothing would be, and they know it.' },
            { b: '“I tried something like this before.”', text: 'The best objection you can get. Answer: “What happened?” Their answer is the exact brief for how to coach them.' }
          ]),
          quote('The one rule',
            'Never answer an objection with more features. They are not short of information — they are short of belief. Ask one more question before you say one more thing.'),
          list('Lines that buy you room', [
            '“Can I ask you something before I answer that?”',
            '“What would need to be true for this to be an easy yes?”',
            '“If money were not part of it, would you be in?” — separates the two objections cleanly.'
          ])
        ]
      };
    }
  };

  /* ══════════════════════════════════════════════════════════
     LEDGER · pricing
     ══════════════════════════════════════════════════════════ */

  const LEDGER = {
    stack(i, r) {
      const core = U.unpunct(i.core) || 'your main service';
      const who = U.unpunct(i.who) || 'your clients';
      const priceMatch = core.match(/[£$€]\s?([\d,]+)/);
      const base = priceMatch ? n(priceMatch[1]) : 180;

      const low = Math.round(base * 0.45 / 5) * 5;
      const high = Math.round(base * 2.2 / 5) * 5;

      return {
        title: 'Offer Stack',
        subtitle: core,
        blocks: [
          note('Three tiers, and each one has a job. The cheap one is not there to be bought — it is there to make the middle one look obvious.'),
          steps('The stack', [
            { b: 'Entry · around ' + money(low) + ' — “The Foundation”',
              text: 'Group or self-serve. Its job is to catch the people who are not ready for you yet, and to prove you are worth the middle tier. Deliberately does NOT include your direct time.' },
            { b: 'Core · ' + money(base) + ' — “The Programme” (this is the one)',
              text: 'What you already sell, described properly. Everything you do now, plus one thing the entry tier pointedly lacks — usually access to you. This is where 70% of ' + who + ' should land.' },
            { b: 'Premium · around ' + money(high) + ' — “Done With You”',
              text: 'Fewer places, more of you. Its job is to raise the ceiling and make the core price feel reasonable. If nobody ever buys it, it is still doing its job.' }
          ]),
          list('How to present it', [
            'Show the middle tier first, and longest. Order sets the anchor.',
            'Name the tiers after outcomes, not sizes. "Foundation" beats "Basic" — nobody wants to be basic.',
            'Put one thing in premium that money genuinely cannot buy in core: a cap on places, direct access, a response time.',
            'Never show more than three. A fourth option collapses conversion.'
          ]),
          stats('Rough shape of a healthy split', [
            { k: 'Entry', v: '20%', n: 'volume, low touch' },
            { k: 'Core', v: '70%', n: 'the business' },
            { k: 'Premium', v: '10%', n: 'the anchor' }
          ]),
          quote('The test',
            'If a stranger read the three tiers cold, could they tell you why the middle one costs more than the bottom one? If not, the difference is not clear enough yet.')
        ]
      };
    },

    truehourly(i) {
      const rev = n(i.revenue), clients = n(i.clients);
      const contact = n(i.contact), admin = n(i.admin);
      const total = contact + admin;
      const weekly = rev / 4.33;
      const trueRate = total > 0 ? weekly / total : 0;
      const contactRate = contact > 0 ? weekly / contact : 0;
      const perClient = clients > 0 ? rev / clients : 0;
      const adminShare = total > 0 ? pc(admin, total) : 0;

      const verdict = trueRate < 20
        ? 'This is below what you would earn managing a shop floor, with none of the security. The problem is not your price — it is that ' + adminShare + '% of your working time is unbilled.'
        : trueRate < 35
          ? 'Liveable, but fragile. You have no room for a quiet month, and every new client makes the admin worse rather than better.'
          : 'That is a healthy rate. Protect it — the usual way this number collapses is by adding clients without adding systems.';

      return {
        title: 'True Hourly',
        subtitle: money(rev) + ' a month across ' + clients + ' clients',
        blocks: [
          stats('The real numbers', [
            { k: 'True hourly', v: money(trueRate), n: 'across all ' + total + ' hours' },
            { k: 'Coaching only', v: money(contactRate), n: 'the number you thought you earned' },
            { k: 'Per client', v: money(perClient), n: 'a month' },
            { k: 'Unbilled', v: adminShare + '%', n: 'of your working time' }
          ]),
          note(verdict),
          steps('The three levers, in order of effort', [
            { b: '1. Cut the admin (easiest)', text: 'You have ' + admin + ' unbilled hours a week. Halving that takes you to ' + money(total > admin / 2 ? weekly / (contact + admin / 2) : trueRate) + ' an hour with no awkward conversations and no lost clients.' },
            { b: '2. Raise the price (fastest)', text: 'A 15% rise takes you to ' + money(trueRate * 1.15) + ' an hour. If you lose one client in ten, you are still ahead — and you got an hour back.' },
            { b: '3. Change the delivery (biggest)', text: 'Two clients in the same hour doubles the rate for that hour. Small group is the only lever here that scales without you working more.' }
          ]),
          quote('The uncomfortable one',
            'If you added five clients tomorrow at the current price, your true hourly would go ' + (adminShare > 35 ? 'down, not up — because admin grows faster than coaching time does.' : 'up modestly, but your admin load would become the binding constraint within a month.'))
        ]
      };
    },

    raise(i, r) {
      const from = U.unpunct(i.from) || 'your current price';
      const to = U.unpunct(i.to) || 'your new price';
      const fromN = n(from), toN = n(to);
      const jump = fromN > 0 ? U.round1(((toN - fromN) / fromN) * 100) : 0;

      return {
        title: 'Price Rise Kit',
        subtitle: from + ' → ' + to + (jump ? ' (' + jump + '%)' : ''),
        blocks: [
          note(jump > 40
            ? 'That is a big jump. Do it in two steps six months apart, or grandfather existing clients — a rise this size in one move reads as a different business.'
            : 'That is a normal, defensible rise. Announce it once, clearly, and do not re-open the conversation.'),
          steps('The timeline', [
            { b: 'Today', text: 'New enquiries get the new price. No announcement needed — this is just what it costs now.' },
            { b: 'Four weeks out', text: 'Tell existing clients. Four weeks is enough notice to be respectful and short enough that nobody has time to build a case against it.' },
            { b: 'The date', text: 'It changes. No exceptions, no negotiated middle prices — one exception and you are running two price lists forever.' },
            { b: 'Two weeks after', text: 'Do something visibly better. Not more — better. A new check-in format, a faster response time. The rise needs a reason it can point at.' }
          ]),
          quote('The email, more or less',
            'From the ' + '[date]' + ', coaching moves from ' + from + ' to ' + to + '. You have been with me a while so I wanted to tell you directly rather than let you find out from a payment. Nothing about how we work changes — I am putting the extra into [the specific thing]. If it does not work for you, tell me and we will sort something out. No hard feelings either way.'),
          list('What they will say, and what to say back', [
            '“Why?” → “Because I have kept it the same for [time] and the work has got better.” That is the whole answer.',
            '“Can I keep the old rate?” → “I am keeping everyone on the same price — it is the only way this stays fair.”',
            '“I will have to leave.” → “I understand. The door is open if that changes.” Then actually let them go.'
          ]),
          note('Expect to lose roughly one in ten. If you lose nobody, you were too cheap by more than this rise. If you lose a third, you raised too far too fast.')
        ]
      };
    }
  };

  /* ══════════════════════════════════════════════════════════
     PULSE · retention
     ══════════════════════════════════════════════════════════ */

  const PULSE = {
    checkin(i, r) {
      const name = U.unpunct(i.name) || 'them';
      const week = n(i.week) || 1;
      const notes = U.unpunct(i.notes) || '';
      const rocky = /miss|quiet|flat|stress|mad|busy|tired|not moved|struggl/i.test(notes);
      const risky = /obsess|scale|number|guilty|punish/i.test(notes);

      const opener = rocky
        ? 'Hey ' + name + ' — noticed this week has been a rough one. Not chasing you, just checking in properly.'
        : 'Hey ' + name + ' — week ' + week + ' done. Quick check-in before we set up next week.';

      return {
        title: 'Check-In · ' + name,
        subtitle: 'Week ' + week,
        blocks: [
          quote('Send this', opener + '\n\n' +
            (rocky
              ? 'Three questions, and be honest rather than encouraging: what actually got in the way? What is next week realistically going to look like? And what is the smallest version of the plan that you would definitely do?'
              : 'What felt easiest this week? What felt hardest? And is there anything coming up next week that we should plan around now rather than react to later?')),
          steps('Why this wording', [
            { b: 'It names it first', text: rocky ? 'Pretending you did not notice the missed sessions makes the next message harder to send. Naming it early removes the dread.' : 'Opening with the week completed puts a win on the table before you ask for anything.' },
            { b: 'Three questions, no more', text: 'Four gets ignored. Three gets answered on a phone, one-handed, on a bus.' },
            { b: 'It plans forward', text: 'The last question moves the conversation from what went wrong to what happens next, which is the only part you can coach.' }
          ]),
          list('Flags in what you wrote', flagsFrom(notes, rocky, risky)),
          note(week >= 3 && week <= 4
            ? 'Week ' + week + ' is statistically the danger zone — the novelty has gone and the results have not arrived. Front-load your attention here.'
            : week >= 10
              ? 'Week ' + week + ' — start the renewal conversation now, not in the last session. Ask what they want the next twelve weeks to be about.'
              : 'Week ' + week + ' is usually stable. Use the quiet to build the habit that carries the middle of the block.')
        ]
      };
    },

    winback(i, r) {
      const name = U.unpunct(i.name) || 'them';
      const gone = i.gone || 'About a month';

      const notes = {
        'A couple of weeks': 'Short enough that they are probably just embarrassed. Make it easy and light.',
        'About a month':     'Long enough that they have decided they have "fallen off". Your job is to delete that framing.',
        'Three months':      'They have written it off. Do not reference the gap at all — reference something else entirely.',
        'Over six months':   'This is a fresh conversation, not a continuation. Treat them like a warm lead, not a lapsed client.'
      };

      const msgs = {
        'A couple of weeks': 'Hey ' + name + ' — no agenda, just checking you are alright. If you fancy picking it back up, everything is exactly where you left it. If not, also completely fine.',
        'About a month':     'Hey ' + name + '. Quick one — I am not chasing, and there is nothing to feel bad about. Life does this. If you want back in, we start from where you are now, not where you were. Say the word.',
        'Three months':      'Hey ' + name + ' — thought of you today, I was writing something about [relevant thing] and it was basically your situation. Sending it over in case it is useful. No strings.',
        'Over six months':   'Hey ' + name + ' — long time. Genuinely no pitch: I am just curious how you got on. Did you find something that stuck?'
      };

      return {
        title: 'Win-Back · ' + name,
        subtitle: gone,
        blocks: [
          quote('Send this', msgs[gone] || msgs['About a month']),
          note(notes[gone] || notes['About a month']),
          list('Rules', [
            'No guilt. Not even gentle guilt — especially not "we miss you".',
            'No discount in the first message. It teaches people that leaving is how you get a better price.',
            'Give them an exit line. "Also completely fine" does more work than any offer.',
            'Send once. If nothing comes back, leave it three months and send something useful instead of something asking.'
          ]),
          quote('If they reply', 'Do not ask why they stopped. Ask what next month looks like. The first question is about the past and makes them defensive; the second is about the future and is the only one you can coach.')
        ]
      };
    },

    risk(i, r) {
      const lines = String(i.roster || '').split('\n').map(s => s.trim()).filter(Boolean);
      const rows = lines.map(line => {
        const parts = line.split(/[—\-–:]/);
        const name = (parts[0] || line).trim();
        const rest = parts.slice(1).join(' ').trim().toLowerCase();

        let score = 0;
        if (/miss|quiet|vanish|gone|no reply|ghost/.test(rest)) score += 3;
        if (/reschedul|cancel|late/.test(rest)) score += 2;
        if (/flat|tired|bored|meh|going through/.test(rest)) score += 2;
        if (/paus|stop|think|money|expensive/.test(rest)) score += 3;
        if (/lov|great|smash|consistent|every session|good/.test(rest)) score -= 3;

        const band = score >= 4 ? 'Call today' : score >= 2 ? 'Wobbling' : 'Safe';
        return { name, rest, score, band };
      }).sort((a, b) => b.score - a.score);

      const grouped = {
        'Call today': rows.filter(x => x.band === 'Call today'),
        'Wobbling':   rows.filter(x => x.band === 'Wobbling'),
        'Safe':       rows.filter(x => x.band === 'Safe')
      };

      const actions = {
        'Call today': 'A phone call, not a message. Text is how people leave quietly.',
        'Wobbling':   'One specific question this week about something they told you. Being remembered is most of retention.',
        'Safe':       'Ask them for a referral or a testimonial. This is the only group you should be asking.'
      };

      return {
        title: 'Churn Radar',
        subtitle: rows.length + ' clients',
        blocks: [
          stats('The split', [
            { k: 'Call today', v: String(grouped['Call today'].length), n: 'actively at risk' },
            { k: 'Wobbling', v: String(grouped['Wobbling'].length), n: 'watch this week' },
            { k: 'Safe', v: String(grouped['Safe'].length), n: 'ask these for referrals' }
          ]),
          ...Object.keys(grouped).filter(k => grouped[k].length).map(k =>
            steps(k, grouped[k].map(x => ({ b: x.name, text: (x.rest || 'no notes') + ' — ' + actions[k] })))
          ),
          quote('The pattern to watch',
            'Nobody quits in the week they stop paying. They quit about two weeks earlier, in the week they went quiet. The names at the top of this list already made their decision — the call is you asking them to reconsider it, and that works far more often than it feels like it should.')
        ]
      };
    }
  };

  function flagsFrom(notes, rocky, risky) {
    const out = [];
    if (/miss/i.test(notes))            out.push('Missed sessions — ask what the barrier was, not why they missed. One is about logistics, the other is about character.');
    if (/quiet|no reply/i.test(notes))  out.push('Going quiet is the single strongest predictor of quitting. Move to a phone call.');
    if (/scale|weight|number/i.test(notes)) out.push('Attention is on the scale. Give them a second measure this week — a lift, a distance, a photo — before the scale defines the whole thing.');
    if (/work|busy|mad|stress/i.test(notes)) out.push('External load is up. Cut the plan before they do — a smaller plan they complete beats a full one they abandon.');
    if (/sleep|tired/i.test(notes))     out.push('Sleep is down. Nothing else you change will outperform fixing this, and training harder will make it worse.');
    if (risky)                          out.push('Language is tipping towards obsessive. Worth naming gently now, while it is still small.');
    if (!out.length)                    out.push(rocky ? 'Nothing specific in the notes — ask an open question and listen for what they do not say.' : 'No flags. Good week. Say so explicitly — people rarely hear when things are going right.');
    return out;
  }

  /* ══════════════════════════════════════════════════════════
     SCOUT · finding clients
     ══════════════════════════════════════════════════════════ */

  const SCOUT = {
    sweep(i, r) {
      const who = U.unpunct(i.who) || 'your ideal client';
      const where = U.unpunct(i.where) || 'your area';
      const local = !/online only/i.test(where);

      return {
        title: 'Lead Sweep',
        subtitle: who + ' · ' + where,
        blocks: [
          note('The point is not to find more people. It is to find the places where these people are already standing next to each other.'),
          steps('Where they already gather', local ? [
            { b: 'Physical', text: 'Anywhere adjacent to the goal but not the gym: physio clinics, running shops, sports clubs, the good coffee place next to the park. Adjacent beats direct — the gym is full of people who already have a coach.' },
            { b: 'Local groups', text: 'Community Facebook groups for ' + where + '. Not to post ads — to answer questions properly, weekly, under your own name.' },
            { b: 'Referral partners', text: 'Two physios, one massage therapist, one running shop. They send people to somebody already. It may as well be you.' },
            { b: 'Existing clients', text: 'The highest-yield list you own, and the one nobody works. Everyone knows three people with the same problem they had.' }
          ] : [
            { b: 'Comment sections', text: 'Not yours — the accounts one size above you, serving the same people. Answer the questions their creator has not got time to answer.' },
            { b: 'Search, not scroll', text: 'Search the problem, not the solution. People post about "' + who.split(' ').slice(-2).join(' ') + '" long before they search for a coach.' },
            { b: 'Communities', text: 'Two forums or subreddits where your people describe the problem in their own words. Read for a fortnight before you say anything.' },
            { b: 'Existing clients', text: 'Still the highest-yield list you own. Online does not change that.' }
          ]),
          tags('Search these', [
            '"' + who.split(' ').slice(0, 3).join(' ') + '"',
            local ? where.split(',')[0] + ' + group' : 'beginner questions',
            'why did I stop', 'is it too late to start', 'nervous about the gym'
          ]),
          steps('The first message', [
            { b: 'Do not open with a pitch', text: 'Open with the specific thing you noticed. Specificity is the whole trick — it proves you are a person, not a script.' },
            { b: 'One question, no ask', text: 'End the first message with a genuine question you would like the answer to. If you would not care about the answer, do not send it.' },
            { b: 'Wait for two replies', text: 'Do not mention coaching until they have replied twice. Message three is when it stops being cold.' }
          ]),
          quote('Volume note', 'Ten of these a week, done properly, will beat a hundred copy-pasted ones — and it will not cost you your reputation in ' + (local ? where.split(',')[0] : 'the community') + ', which you only get to spend once.')
        ]
      };
    },

    opener(i, r) {
      const who = U.unpunct(i.who) || 'them';
      const hook = U.unpunct(i.hook) || 'something you noticed';

      return {
        title: 'Cold Open',
        subtitle: who,
        blocks: [
          note('Four messages, sent over about a week. If you compress this into one day it reads as a pitch, because it is one.'),
          steps('The ladder', [
            { b: '1 · Notice (day 1)', text: '“' + U.cap(hook) + ' — how long have you been at it?” No introduction, no credentials, no pitch. One question you actually want answered.' },
            { b: '2 · Give (day 2–3, after they reply)', text: 'Answer whatever they said with something genuinely useful and specific. Do not mention what you do. This is the message that earns the next one.' },
            { b: '3 · Ask (day 4–5)', text: '“Out of interest — what is the bit that has been hardest?” Their answer is either your opening or your exit. Both are fine.' },
            { b: '4 · Offer (day 6–7, only if 3 landed)', text: '“I do this for a living, and that exact thing is most of what I fix. Want me to send you what I would do about it? No charge, no pitch.”' }
          ]),
          list('Exit lines — use them early', [
            'If message 1 gets no reply: stop. One follow-up on a cold open costs more than it earns.',
            'If message 3 gets a one-word answer: stop, and leave the door open. “Fair enough — shout if it ever gets annoying.”',
            'If they ask what you do at any point: answer plainly and skip straight to 4. They have given you permission.'
          ]),
          quote('The honest bit', 'Roughly one in ten will get to message 4, and roughly a third of those will book. That is ten conversations for a client — which sounds bad until you compare it to how many posts it takes.')
        ]
      };
    },

    referral(i, r) {
      const best = U.unpunct(i.best) || 'your happiest client';

      return {
        title: 'Referral Loop',
        subtitle: best,
        blocks: [
          note('Referrals fail for one reason: people are asked at the wrong moment, in a way that makes them do the work.'),
          steps('The loop', [
            { b: 'When to ask', text: 'Within 48 hours of a win they told you about unprompted. Not at renewal, not at the end — renewal makes it transactional and the end makes it awkward.' },
            { b: 'How to ask', text: '“Do you know anyone stuck where you were in month one?” Naming the specific stage does the filtering for them. “Anyone who wants to get fit” gets you nothing.' },
            { b: 'Make it one click', text: 'Give them the message to forward. Written by you, in their voice, three lines long. Never ask someone to compose something on your behalf.' },
            { b: 'Close the loop', text: 'Tell them what happened, whether it worked out or not. People who hear back refer again. People who do not, never do.' }
          ]),
          quote('The forwardable message',
            'Hey — you know I have been training with [you]? Thought of you because you said the same thing I did about not knowing where to start. Might be worth a chat: [link]. No pressure either way.'),
          list('Do not', [
            'Offer a discount for referrals. It reprices the friendship and it converts worse.',
            'Ask everyone at once. Ask one person, well, in the right week.',
            'Ask by email. Ask in the conversation where they just told you something good.'
          ])
        ]
      };
    }
  };

  /* ══════════════════════════════════════════════════════════
     MUSE · mindset
     ══════════════════════════════════════════════════════════ */

  const MUSE = {
    reframe(i, r) {
      const thought = U.unpunct(i.thought) || 'the stuck thought';
      const whose = i.whose || 'A client’s';
      const mine = whose === 'Mine';

      return {
        title: 'Reframe',
        subtitle: mine ? 'Your thought' : 'Their thought',
        blocks: [
          quote('The thought', thought),
          note('None of these say the thought is wrong. It is not wrong — it is just incomplete, and the missing part is where the movement is.'),
          steps('Four reframes', [
            { b: 'The evidence one', text: '“That has been true. What was different about the times it was not?” There is always an exception, and the exception is the plan.' },
            { b: 'The design one', text: '“What if the problem was never you, it was that the plan needed you to be at your best every week?” Most failures are design failures wearing a character costume.' },
            { b: 'The timescale one', text: '“You are comparing the middle of your process to the end of someone else’s.” Almost every version of this thought is a timescale error.' },
            { b: 'The kindness one', text: '“Would you say that to somebody you were coaching?” ' + (mine ? 'You would not. Extend yourself the standard you extend everyone else.' : 'They would not — and hearing themselves say so does more than anything you could tell them.') }
          ]),
          quote('The one question to ask next',
            mine
              ? 'What would I do this week if I already believed the opposite? Do that thing, once, before you have finished deciding whether you believe it.'
              : '“What is the smallest thing that would make next week feel different?” Then shut up and let them answer, however long it takes.'),
          note(mine
            ? 'Worth writing down. Thoughts like this feel like conclusions when they stay in your head and look like hypotheses on paper.'
            : 'Do not rush to the reframe. Let them finish the thought completely first — a reframe delivered too early lands as dismissal.')
        ]
      };
    },

    hard(i, r) {
      const what = U.unpunct(i.what) || 'the thing you need to say';

      return {
        title: 'Hard Conversation',
        subtitle: what,
        blocks: [
          note('The dread is almost always about the opening. Get the first line right and the rest is much easier than you think.'),
          steps('The shape', [
            { b: 'Open — name it directly', text: '“There is something I want to raise, and I have been putting it off, which is my fault not yours.” Naming the delay disarms the defensiveness before it starts.' },
            { b: 'State it once, plainly', text: 'One sentence: ' + what + '. No preamble, no sandwiching it between compliments. People can hear hard things. They cannot hear buried ones.' },
            { b: 'Give the reason, not the case', text: 'One reason why it matters. You are not building a legal argument — a list of reasons reads as an ambush.' },
            { b: 'Hand it over', text: '“How does that land?” Then be quiet for as long as it takes. The silence is the conversation.' },
            { b: 'Close with what happens next', text: 'One concrete change, agreed out loud, with a date on it. Otherwise you will be having this conversation again in a month.' }
          ]),
          list('While you are in it', [
            'If your voice goes up, slow down instead of getting louder.',
            'Do not fill silence. The first person to fill it loses the point.',
            '“I understand” is not agreement, and it buys you a lot of room.',
            'If it goes badly, end it early and cleanly. “Let us both sit with it and pick it up Thursday.”'
          ]),
          quote('The thing to remember',
            'You are not delivering a verdict. You are opening a conversation you should have opened three weeks ago — and almost everyone, afterwards, says they wish it had happened sooner.')
        ]
      };
    },

    why(i, r) {
      const surface = U.unpunct(i.surface) || 'what they said they want';

      return {
        title: 'The Real Why',
        subtitle: surface,
        blocks: [
          note('Ask these in order, slowly. Do not move on until they have actually answered — the useful answer is usually at question four, and almost never at question one.'),
          steps('The ladder', [
            { b: '1', text: '“' + U.cap(surface) + ' — what would be different if that happened?” Moves them from the metric to the life.' },
            { b: '2', text: '“What can you not do right now that you would be able to do then?” Gets concrete. Vague goals cannot be coached.' },
            { b: '3', text: '“Why now, rather than last year?” There is always a trigger. The trigger is the real brief.' },
            { b: '4', text: '“What happens if nothing changes?” This is the question that gets the honest answer. Give it room.' },
            { b: '5', text: '“Who else would notice?” Almost nobody is doing this only for themselves, and the other person is your strongest ally.' }
          ]),
          quote('What to do with the answers',
            'Write down their exact words. Not your summary — theirs. Then read them back in week three, when the novelty has gone and they cannot remember why they started. That single act of playback retains more clients than any programme design.'),
          note('If they cannot answer question four, they are not ready, and no plan will fix that. Better to find out now than in week six.')
        ]
      };
    }
  };

  /* ══════════════════════════════════════════════════════════
     CIPHER · numbers
     ══════════════════════════════════════════════════════════ */

  const CIPHER = {
    funnel(i) {
      const reach = n(i.reach), leads = n(i.leads), calls = n(i.calls), sales = n(i.sales);
      const r1 = pc(leads, reach), r2 = pc(calls, leads), r3 = pc(sales, calls), overall = pc(sales, reach);

      // Rough healthy benchmarks for a small coaching business.
      const bench = [
        { name: 'Reach → enquiry', v: r1, good: 1.0,  fix: 'Your content is being seen but not acted on. The problem is almost always the call to action — or the absence of one.' },
        { name: 'Enquiry → call',  v: r2, good: 30.0, fix: 'People are asking and then evaporating. This is a speed and clarity problem: reply faster, and offer two specific times instead of asking when they are free.' },
        { name: 'Call → client',   v: r3, good: 30.0, fix: 'They are turning up and not buying. Either the wrong people are getting on calls, or the offer is not clear by the end of one.' }
      ];
      const weakest = bench.slice().sort((a, b) => (a.v / a.good) - (b.v / b.good))[0];

      return {
        title: 'Funnel Readout',
        subtitle: U.fmt(reach) + ' seen → ' + sales + ' signed',
        blocks: [
          stats('Every step', [
            { k: 'Reach → enquiry', v: r1 + '%', n: U.fmt(reach) + ' → ' + leads },
            { k: 'Enquiry → call', v: r2 + '%', n: leads + ' → ' + calls },
            { k: 'Call → client', v: r3 + '%', n: calls + ' → ' + sales },
            { k: 'End to end', v: overall + '%', n: 'reach → signed' }
          ]),
          quote('The weakest link', weakest.name + ' at ' + weakest.v + '%. ' + weakest.fix),
          steps('What each number should roughly be', bench.map(b => ({
            b: b.name,
            text: 'You: ' + b.v + '%. Healthy: around ' + b.good + '%. ' +
              (b.v >= b.good ? 'This step is fine — do not spend your effort here.' : 'This is where you are losing people.')
          }))),
          note(leads > 0 && calls === 0
            ? 'You have ' + leads + ' enquiries and zero calls. Nothing else on this page matters until that changes — the entire business is stuck at one step.'
            : 'Fix one step at a time. Improving the weakest step by half is worth more than improving all three by a tenth, and it is far easier to tell whether it worked.'),
          stats('If you fixed just the weak step', [
            { k: 'Clients now', v: String(sales), n: 'this month' },
            { k: 'At benchmark', v: String(Math.round(reach * (bench[0].v >= bench[0].good ? bench[0].v : bench[0].good) / 100 * (bench[1].v >= bench[1].good ? bench[1].v : bench[1].good) / 100 * (bench[2].v >= bench[2].good ? bench[2].v : bench[2].good) / 100)), n: 'same reach' }
          ])
        ]
      };
    },

    target(i) {
      const want = n(i.want), price = n(i.price), close = U.clamp(n(i.close), 0.1, 10);
      const clients = price > 0 ? Math.ceil(want / price) : 0;
      const closeRate = close / 10;
      const calls = closeRate > 0 ? Math.ceil(clients / closeRate) : 0;
      const enquiries = Math.ceil(calls / 0.35);   // ~35% of enquiries become calls
      const weekly = Math.ceil(calls / 4.33);

      return {
        title: 'Reverse the Target',
        subtitle: money(want) + ' a month at ' + money(price) + ' each',
        blocks: [
          stats('Working backwards', [
            { k: 'Clients needed', v: String(clients), n: 'paying ' + money(price) },
            { k: 'Calls needed', v: String(calls), n: 'at ' + (closeRate * 100) + '% close' },
            { k: 'Enquiries needed', v: String(enquiries), n: 'to fill those calls' },
            { k: 'Calls per week', v: String(weekly), n: 'the only number to track' }
          ]),
          note('The last number is the whole plan. ' + weekly + ' call' + (weekly === 1 ? '' : 's') + ' a week' +
            (weekly > 8 ? ' is a lot — realistically you need a higher price or a higher close rate, because that much calling will eat the time you need to deliver.'
                        : weekly > 4 ? ' is demanding but achievable if booking calls is a scheduled activity rather than something you hope happens.'
                        : ' is very manageable. This target is closer than it feels.')),
          steps('The three ways to make it easier', [
            { b: 'Raise the price', text: 'At ' + money(price * 1.25) + ' you would need ' + Math.ceil(want / (price * 1.25)) + ' clients instead of ' + clients + ' — ' + (clients - Math.ceil(want / (price * 1.25))) + ' fewer people to find, coach and retain.' },
            { b: 'Close better', text: 'Going from ' + close + '/10 to ' + Math.min(10, close + 1) + '/10 drops you from ' + calls + ' calls to ' + Math.ceil(clients / ((Math.min(10, close + 1)) / 10)) + '. This is usually the cheapest lever — it is a conversation, not a marketing budget.' },
            { b: 'Keep them longer', text: 'Every extra month of retention is a client you do not have to replace. Retention is the only lever that compounds.' }
          ]),
          quote('Put this on a wall', weekly + ' call' + (weekly === 1 ? '' : 's') + ' a week. Nothing else on your marketing to-do list matters if that number is not being hit.')
        ]
      };
    },

    retention(i) {
      const price = n(i.price), months = n(i.months), perMonth = n(i.clients);
      const ltv = price * months;
      const plus1 = price * (months + 1);
      const yearly = perMonth * 12 * ltv;
      const yearlyPlus = perMonth * 12 * plus1;
      const gain = yearlyPlus - yearly;
      const steady = perMonth * months;   // steady-state roster size

      return {
        title: 'Retention Maths',
        subtitle: money(price) + '/mo × ' + months + ' months',
        blocks: [
          stats('What a client is worth', [
            { k: 'Lifetime value', v: money(ltv), n: 'per client' },
            { k: 'Steady roster', v: String(Math.round(steady)), n: 'clients at any moment' },
            { k: 'Monthly revenue', v: money(steady * price), n: 'at steady state' },
            { k: 'Annual', v: money(yearly), n: 'at current retention' }
          ]),
          quote('One extra month',
            'Adding a single month to average retention takes you from ' + money(ltv) + ' to ' + money(plus1) + ' per client — ' + money(gain) + ' a year at your current intake, without finding a single extra person.'),
          steps('Where that month usually comes from', [
            { b: 'Week 3', text: 'The most common quit point. A phone call in week three is worth more than any content you will make that month.' },
            { b: 'The renewal conversation', text: 'Have it in week ' + Math.max(2, Math.round(months * 0.75) * 4 - 2) + ', not the last session. By the final week they have already decided.' },
            { b: 'The result they cannot see', text: 'People leave when they think it stopped working. Show them a measure that is still moving — a lift, a distance, a photo — before the obvious one stalls.' }
          ]),
          note(months < 4
            ? 'Under four months average is short. You are running to stand still: ' + perMonth + ' new clients a month just replaces the ones leaving. Retention, not marketing, is your constraint.'
            : months >= 9
              ? 'Nine months plus is genuinely good. Your growth lever is intake, not retention — and you can afford to raise prices.'
              : 'Around ' + months + ' months is normal. Every month you add here is worth more than a month of marketing.')
        ]
      };
    }
  };

  /* ══════════════════════════════════════════════════════════
     RELAY · systems
     ══════════════════════════════════════════════════════════ */

  const RELAY = {
    blueprint(i, r) {
      const chore = U.unpunct(i.chore) || 'the weekly chore';
      const stack = U.unpunct(i.stack) || 'the tools you already have';
      const tools = stack.split(/[,+]/).map(s => s.trim()).filter(Boolean);
      const hasSheet = /sheet|excel|airtable|notion/i.test(stack);
      const hasCal = /calendly|cal\.com|calendar|acuity/i.test(stack);

      return {
        title: 'Automation Blueprint',
        subtitle: chore,
        blocks: [
          note('Build it in this order. Most automations fail because someone starts with the tool instead of the trigger.'),
          steps('The machine', [
            { b: 'Trigger', text: 'What starts it? Be exact. Not "when someone enquires" but "when a form is submitted" or "when a booking is created". If you cannot name a precise event, it is not ready to automate.' },
            { b: 'Store', text: hasSheet ? 'You already have a spreadsheet — use it as the single source of truth. One row per person, one column per stage.' : 'You need one list, in one place. A spreadsheet is enough. Do not buy a CRM for this yet.' },
            { b: 'Act', text: 'The message or task that fires. Write the template first, by hand, and send it manually ten times before you automate it. You will change the wording — better to do that now.' },
            { b: 'Wait & check', text: 'A delay, then a condition. "Two days later, if the column still says booked-not-attended, send the follow-up." This branch is where the value actually is.' },
            { b: 'Escalate to a human', text: 'After two automated touches, hand it to you. Automation is for the first two contacts, never the third.' }
          ]),
          steps('Tools, honestly', [
            { b: 'Start with', text: tools.length ? tools.slice(0, 3).join(', ') + ' — you are already paying for these and you already know them.' : 'A spreadsheet, your calendar, and your existing inbox.' },
            { b: 'Add only if needed', text: hasCal ? 'Your booking tool probably already does reminders. Turn that on before you build anything.' : 'A booking link. It removes more back-and-forth than any automation you could build.' },
            { b: 'Do not add', text: 'A new CRM, a new all-in-one platform, or anything with a setup weekend. The chore takes an hour a week; the tool must cost less than that to run.' }
          ]),
          quote('The manual fallback',
            'Write down what you do when it breaks — because it will, usually silently, usually the week you stop checking. Put a recurring reminder on Friday to eyeball the list. An automation nobody audits is just a slower way to lose people.'),
          note('Rule of thumb: automate it only after you have done it manually ten times. Before that you do not know the shape of it, and you will build the wrong machine beautifully.')
        ]
      };
    },

    intake(i, r) {
      const service = U.unpunct(i.service) || 'your service';

      return {
        title: 'Intake Flow',
        subtitle: service,
        blocks: [
          note('Everything between "I am interested" and session one. Each step exists to remove one reason to drop out.'),
          steps('The flow', [
            { b: '1 · They say yes', text: 'Take payment or a deposit the same day. Enthusiasm has a half-life of about 48 hours, and a paid client turns up in a way an interested one does not.' },
            { b: '2 · Confirmation, within the hour', text: 'What they bought, what happens next, and when. Automate this one — it is the highest-anxiety moment in the whole process.' },
            { b: '3 · The form', text: 'Health, history, schedule, goal, and one open question: “What has not worked before?” That last answer is worth the other four combined.' },
            { b: '4 · Book session one before anything else', text: 'A date in a calendar is the single strongest predictor that someone starts. Do this before you write a programme.' },
            { b: '5 · The day-before message', text: 'Where to go, what to bring, what to expect, and that it is normal to feel nervous. This one message meaningfully reduces no-shows.' },
            { b: '6 · After session one', text: 'One line that night: something specific they did well. First impressions of a coach are set in the first 24 hours, not the first month.' }
          ]),
          list('Automate these three, leave the rest human', [
            'The confirmation (step 2) — speed matters more than warmth here.',
            'The form reminder if it is not back within 48 hours.',
            'The day-before message (step 5) — identical every time, and easy to forget.'
          ]),
          quote('The one to never automate',
            'Step 6. A generic "great first session!" is worse than nothing — it tells them you are not really paying attention, in the exact week they are deciding whether you do.')
        ]
      };
    },

    audit(i, r) {
      const raw = String(i.week || '');
      const items = raw.split(/[,\n;]+/).map(s => s.trim()).filter(Boolean);

      const parsed = items.map(s => {
        const m = s.match(/(\d+(?:\.\d+)?)\s*h/i);
        return { hours: m ? parseFloat(m[1]) : null, label: s.replace(/(\d+(?:\.\d+)?)\s*h\s*/i, '').trim() || s };
      });

      const known = parsed.filter(p => p.hours !== null);
      const total = known.reduce((a, b) => a + b.hours, 0);

      const billable = /coach|session|client|train/i;
      const billed = known.filter(p => billable.test(p.label)).reduce((a, b) => a + b.hours, 0);
      const unbilled = total - billed;

      const ranked = known.slice().sort((a, b) => b.hours - a.hours);
      const leaks = ranked.filter(p => !billable.test(p.label));

      const verdicts = {
        dm:      'DMs and messages — batch into two fixed windows a day. The cost is not the minutes, it is that they fragment every other block.',
        content: 'Content — batch a month in one session. Making one is expensive; making eight is barely more expensive than making one.',
        admin:   'Admin — most of this is a form or a template you have not written yet. One afternoon now buys back an hour a week forever.',
        program: 'Programme writing — build three templates and adapt them. Bespoke-from-blank for every client is the most common unpaid time sink in coaching.',
        chase:   'Chasing payments — this should be a direct debit, not a task. Automate it this week and it disappears entirely.',
        travel:  'Travel — the only real fix is geography: cluster sessions, or move some online.',
        other:   'Worth timing properly for a week before you decide. Estimates of unloved tasks are usually wrong in both directions.'
      };

      function verdictFor(label) {
        const l = label.toLowerCase();
        if (/dm|message|inbox|whatsapp/.test(l)) return verdicts.dm;
        if (/content|social|post|reel/.test(l))  return verdicts.content;
        if (/admin|email|invoice/.test(l))       return verdicts.admin;
        if (/program|writ|plan/.test(l))         return verdicts.program;
        if (/chas|payment|money/.test(l))        return verdicts.chase;
        if (/travel|driv|commut/.test(l))        return verdicts.travel;
        return verdicts.other;
      }

      return {
        title: 'Time Leak Audit',
        subtitle: total ? total + ' hours accounted for' : items.length + ' activities',
        blocks: [
          total ? stats('The split', [
            { k: 'Total', v: total + 'h', n: 'a week' },
            { k: 'Billable', v: billed + 'h', n: pc(billed, total) + '% of your week' },
            { k: 'Unbilled', v: unbilled + 'h', n: pc(unbilled, total) + '% of your week' },
            { k: 'Biggest leak', v: (leaks[0] ? leaks[0].hours + 'h' : '—'), n: leaks[0] ? leaks[0].label : 'none found' }
          ]) : note('No hours given, so this is ordered by how often each one turns out to be the problem rather than by your actual numbers. Add rough hours and re-run for a sharper read.'),
          steps('Leaks, biggest first', (leaks.length ? leaks : parsed).slice(0, 5).map(p => ({
            b: (p.hours ? p.hours + 'h · ' : '') + U.cap(p.label),
            text: verdictFor(p.label)
          }))),
          quote('Plug this one first',
            leaks[0]
              ? U.cap(leaks[0].label) + ', at ' + leaks[0].hours + ' hours a week — that is ' + Math.round(leaks[0].hours * 48) + ' hours a year. Fixing the biggest one badly beats fixing three small ones perfectly.'
              : 'Start with whatever you dreaded writing down. That is almost always the real leak.'),
          note(total && pc(unbilled, total) > 45
            ? 'Over 45% of your week is unbilled. That is not a time management problem — it is a business model problem, and no amount of getting up earlier will fix it.'
            : 'Re-run this in a month. The useful signal is the direction of travel, not the exact numbers.')
        ]
      };
    }
  };

  /* ── registry ─────────────────────────────────────────────── */

  const REGISTRY = {
    atlas: ATLAS, verse: VERSE, forge: FORGE, echo: ECHO, ledger: LEDGER,
    pulse: PULSE, scout: SCOUT, muse: MUSE, cipher: CIPHER, relay: RELAY
  };

  /**
   * Run a mission's composer.
   * @param {string} agentId
   * @param {string} missionId
   * @param {object} inputs
   * @param {string} [mod]  refine modifier
   */
  function run(agentId, missionId, inputs, mod) {
    const fn = (REGISTRY[agentId] || {})[missionId];
    if (!fn) {
      return {
        title: 'Not wired up',
        subtitle: agentId + '/' + missionId,
        blocks: [note('This mission has no composer. That is a bug, not your fault.')]
      };
    }
    const seed = agentId + missionId + JSON.stringify(inputs) + (mod || '');
    const doc = fn(inputs, U.rng(seed));
    return applyTone(doc, mod);
  }

  /** Flatten a document to plain text for the clipboard. */
  function toText(doc) {
    const out = [doc.title.toUpperCase()];
    if (doc.subtitle) out.push(doc.subtitle);
    out.push('');

    doc.blocks.forEach(b => {
      if (b.h) out.push('── ' + b.h.toUpperCase() + ' ──');
      if (b.t === 'note')  out.push(b.text);
      if (b.t === 'quote') out.push('  “' + b.text + '”');
      if (b.t === 'list')  (b.items || []).forEach((it, idx) =>
        out.push((b.ordered ? (idx + 1) + '. ' : '• ') + (typeof it === 'string' ? it : it.b + ' — ' + it.text)));
      if (b.t === 'steps') (b.items || []).forEach(it => out.push('• ' + it.b + ' — ' + it.text));
      if (b.t === 'stats') (b.items || []).forEach(it => out.push('• ' + it.k + ': ' + it.v + (it.n ? ' (' + it.n + ')' : '')));
      if (b.t === 'tags')  out.push((b.items || []).join(' · '));
      out.push('');
    });

    out.push('— composed in PRISM —');
    return out.join('\n');
  }

  return { run, toText, REGISTRY, note, list, steps, quote, stats, tags };
})();
