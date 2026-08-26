/* ══════════════════════════════════════════════════════════════
   PRISM · agents — the spectrum

   One beam of intent, ten facets. Each agent owns a hue, a plain
   -English brief, and a set of MISSIONS. A mission is a tiny form
   that returns a finished artefact — never a blank chat box.

   Mission field types: text | area | select | pills | number
   Every field carries `ex` (examples) so "surprise me" can fill it.
   ══════════════════════════════════════════════════════════════ */

P.agents = (function () {
  'use strict';

  /* ── sigils: 24×24 line marks ─────────────────────────────── */
  const SIGIL = {
    atlas:  '<path d="M12 2 L21 20 H3 Z"/><path d="M7 14h10"/><circle cx="12" cy="9" r="1.4"/>',
    verse:  '<path d="M4 18c4-1 5-12 9-12s3 7 7 6"/><circle cx="5" cy="19" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    forge:  '<rect x="3" y="9" width="4" height="6" rx="1"/><rect x="17" y="9" width="4" height="6" rx="1"/><path d="M7 12h10"/>',
    echo:   '<path d="M4 12a8 8 0 0 1 16 0v4a3 3 0 0 1-3 3h-3"/><rect x="2" y="11" width="4" height="6" rx="1.6"/><rect x="18" y="11" width="4" height="6" rx="1.6"/>',
    ledger: '<path d="M12 3v18"/><path d="M17 7H9.5a2.5 2.5 0 0 0 0 5h5a2.5 2.5 0 0 1 0 5H6"/>',
    pulse:  '<path d="M2 12h5l2.5-6 4 12 2.5-6H22"/>',
    scout:  '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/><path d="M11 8v6M8 11h6"/>',
    muse:   '<path d="M12 3l2.3 5.6L20 10l-4.3 3.9L17 20l-5-3-5 3 1.3-6.1L4 10l5.7-1.4Z"/>',
    cipher: '<path d="M4 19V9M9.3 19V4M14.7 19v-7M20 19v-11"/>',
    relay:  '<circle cx="5" cy="6" r="2.4"/><circle cx="19" cy="18" r="2.4"/><path d="M7.4 6H14a4 4 0 0 1 0 8H10a4 4 0 0 0 0 8h.5" transform="translate(0,-2)"/>'
  };

  /* ── shared option banks ──────────────────────────────────── */
  const PLATFORMS = ['Instagram', 'TikTok', 'YouTube', 'Email', 'LinkedIn'];
  const TONES     = ['Warm', 'Direct', 'Playful', 'Authoritative'];

  const AUDIENCES = [
    'busy mums in their 30s', 'desk-bound men over 40', 'first-time gym goers',
    'post-natal women returning to training', 'shift workers with broken sleep',
    'weekend runners chasing a PB', 'people who have quit three times before'
  ];
  const GOALS = [
    'fill six 1:1 coaching slots', 'launch a small-group programme',
    'get 30 people onto a free challenge', 'double my email list',
    'raise my prices without losing clients', 'stop trading hours for money'
  ];
  const TOPICS = [
    'protein for people who hate cooking', 'why the scale lies',
    'training around a bad back', 'strength after 40',
    'the 10-minute session that actually works', 'walking as real training'
  ];

  /* ── the roster ───────────────────────────────────────────── */

  const LIST = [
    /* ═══════════════════════════ ATLAS ═══════════════════════ */
    {
      id: 'atlas', name: 'ATLAS', hue: 200,
      role: 'Strategy & sequencing',
      sigil: SIGIL.atlas,
      unlock: { level: 1 },
      line: 'Turns a vague ambition into a dated plan you could hand to somebody else.',
      goodAt: [
        'Breaking a big goal into phases with real dates',
        'Telling you what to ignore this month',
        'Naming the one number that proves it is working'
      ],
      missions: [
        {
          id: 'arc90', title: '90-Day Arc',
          gives: 'Three phases, weekly actions, and the metric that proves each one.',
          xp: 46,
          fields: [
            { k: 'goal', type: 'text', label: 'What do you want in 90 days?',
              ph: 'fill six 1:1 coaching slots', ex: GOALS },
            { k: 'now', type: 'text', label: 'Where are you right now?',
              ph: '2 clients, 400 followers, no email list',
              ex: ['2 clients, 400 followers, no email list', 'busy but underpriced',
                   '30 clients, no time left', 'starting from zero this month'] },
            { k: 'hours', type: 'select', label: 'Hours a week you can spend on this',
              options: ['2–4 hours', '5–8 hours', '9–15 hours', '15+ hours'] }
          ]
        },
        {
          id: 'week', title: 'Week Shaper',
          gives: 'A realistic week: what goes where, and what gets dropped.',
          xp: 38,
          fields: [
            { k: 'focus', type: 'text', label: 'The one thing this week must move',
              ph: 'book 5 consult calls',
              ex: ['book 5 consult calls', 'finish the programme outline',
                   'post every weekday', 're-engage 10 old clients'] },
            { k: 'load', type: 'select', label: 'How full is the week already?',
              options: ['Wide open', 'Half full', 'Packed', 'Overflowing'] }
          ]
        },
        {
          id: 'cut', title: 'The Cut List', tier: 1,
          gives: 'What to stop doing, ranked by what it is quietly costing you.',
          xp: 52,
          fields: [
            { k: 'doing', type: 'area', label: 'List everything you are currently doing',
              ph: 'daily posts, free consults, a newsletter, two challenges, DMs, programme writing',
              ex: ['daily posts, free consults, a newsletter, two challenges, DMs, programme writing',
                   'reels, stories, a podcast, 1:1s, small group, a course I never finished'] }
          ]
        }
      ]
    },

    /* ═══════════════════════════ VERSE ═══════════════════════ */
    {
      id: 'verse', name: 'VERSE', hue: 315,
      role: 'Hooks, scripts & captions',
      sigil: SIGIL.verse,
      unlock: { level: 1 },
      line: 'Writes the first three seconds — the part that decides whether anyone hears the rest.',
      goodAt: [
        'Eight different angles on one idea, so you can pick',
        'Turning a rambling thought into a tight script',
        'Captions that sound like you, not like marketing'
      ],
      missions: [
        {
          id: 'hooks', title: 'Hook Forge',
          gives: 'Eight hooks in eight named styles, plus the body and close underneath.',
          xp: 44,
          fields: [
            { k: 'topic', type: 'text', label: 'What is the post about?',
              ph: 'protein for people who hate cooking', ex: TOPICS },
            { k: 'who', type: 'text', label: 'Who is it for?', ph: 'busy mums in their 30s', ex: AUDIENCES },
            { k: 'platform', type: 'pills', label: 'Where is it going?', options: PLATFORMS, def: 'Instagram' }
          ]
        },
        {
          id: 'script', title: 'Sixty-Second Script',
          gives: 'A shot-by-shot script with timings, spoken lines and on-screen text.',
          xp: 48,
          fields: [
            { k: 'point', type: 'text', label: 'The single point you want to land',
              ph: 'you are not lazy, your plan was too big',
              ex: ['you are not lazy, your plan was too big', 'soreness is not a scoreboard',
                   'you cannot out-train four hours of sleep', 'consistency beats intensity every time'] },
            { k: 'who', type: 'text', label: 'Who is watching?', ph: 'first-time gym goers', ex: AUDIENCES },
            { k: 'tone', type: 'pills', label: 'Tone', options: TONES, def: 'Direct' }
          ]
        },
        {
          id: 'repurpose', title: 'Repurpose Engine', tier: 1,
          gives: 'One idea, rebuilt for five channels without sounding copy-pasted.',
          xp: 54,
          fields: [
            { k: 'source', type: 'area', label: 'Paste the thing you already made',
              ph: 'A post about why your clients keep quitting in week three…',
              ex: ['A post about why clients quit in week three: the plan was built for their best week, not their average one.',
                   'A reel about eating enough protein when you work nights.'] }
          ]
        }
      ]
    },

    /* ═══════════════════════════ FORGE ═══════════════════════ */
    {
      id: 'forge', name: 'FORGE', hue: 28,
      role: 'Programme design',
      sigil: SIGIL.forge,
      unlock: { level: 2 },
      line: 'Builds the actual training block — sets, progression, and what to do when life gets in the way.',
      goodAt: [
        'A week that fits the days they actually have',
        'Progression rules so you are not rewriting it every week',
        'A fallback session for the days everything falls apart'
      ],
      missions: [
        {
          id: 'block', title: 'Block Builder',
          gives: 'A four-week block: the split, the sessions, and how it progresses.',
          xp: 50,
          fields: [
            { k: 'goal', type: 'pills', label: 'Main goal',
              options: ['Fat loss', 'Strength', 'Muscle', 'General fitness', 'Return from injury'], def: 'Strength' },
            { k: 'days', type: 'select', label: 'Training days a week', options: ['2', '3', '4', '5'], def: '3' },
            { k: 'level', type: 'pills', label: 'Experience', options: ['Brand new', 'Some', 'Experienced'], def: 'Some' },
            { k: 'kit', type: 'text', label: 'What equipment do they have?',
              ph: 'a commercial gym', ex: ['a commercial gym', 'dumbbells and a bench at home',
                                           'bands and bodyweight only', 'a garage rack and barbell'] }
          ]
        },
        {
          id: 'swap', title: 'Session Rescue',
          gives: 'A same-stimulus swap for when the plan meets reality.',
          xp: 34,
          fields: [
            { k: 'planned', type: 'text', label: 'What was planned?',
              ph: 'heavy back squats and RDLs',
              ex: ['heavy back squats and RDLs', 'a 45-minute upper body session',
                   'a long run', 'bench press and rows'] },
            { k: 'problem', type: 'pills', label: 'What went wrong?',
              options: ['No time', 'Gym is packed', 'Sore or tweaked', 'No energy', 'Travelling'], def: 'No time' }
          ]
        },
        {
          id: 'onboard', title: 'First Four Weeks', tier: 1,
          gives: 'An onboarding block designed so a nervous beginner cannot fail it.',
          xp: 56,
          fields: [
            { k: 'who', type: 'text', label: 'Tell me about them',
              ph: 'never trained, works nights, wants to feel less breathless on stairs',
              ex: ['never trained, works nights, wants to feel less breathless on stairs',
                   'trained years ago, had a baby 9 months ago, nervous about weights',
                   'runs a lot, never lifted, keeps getting shin pain'] }
          ]
        }
      ]
    },

    /* ═══════════════════════════ ECHO ════════════════════════ */
    {
      id: 'echo', name: 'ECHO', hue: 172,
      role: 'Front desk & replies',
      sigil: SIGIL.echo,
      unlock: { level: 1 },
      line: 'Answers the message you have been avoiding — three ways, so you can pick your nerve level.',
      goodAt: [
        'Replies to price questions that do not apologise',
        'Turning a vague enquiry into a booked call',
        'Saying no, kindly, without a paragraph of guilt'
      ],
      missions: [
        {
          id: 'reply', title: 'Reply Engine',
          gives: 'Three replies — warm, direct and curious — plus the line that books the call.',
          xp: 40,
          fields: [
            { k: 'msg', type: 'area', label: 'Paste what they sent you',
              ph: 'Hi! Just wondering how much your coaching is?',
              ex: ['Hi! Just wondering how much your coaching is?',
                   'I would love to but money is really tight right now.',
                   'I need to think about it and speak to my partner.',
                   'Do you do anything cheaper than the 1:1?'] },
            { k: 'want', type: 'pills', label: 'What do you want to happen?',
              options: ['Book a call', 'Send the price', 'Politely decline', 'Buy time'], def: 'Book a call' }
          ]
        },
        {
          id: 'faq', title: 'Front Desk Script',
          gives: 'A phone and DM script for the questions you answer every single week.',
          xp: 42,
          fields: [
            { k: 'biz', type: 'text', label: 'What do you sell, in one line?',
              ph: '12-week 1:1 strength coaching, in person and online',
              ex: ['12-week 1:1 strength coaching, in person and online',
                   'small-group sessions, three mornings a week',
                   'online coaching with weekly check-ins'] },
            { k: 'price', type: 'text', label: 'Your price', ph: '£180 a month', ex: ['£180 a month', '$249/mo', '£65 a session', '£1,200 for 12 weeks'] }
          ]
        },
        {
          id: 'objection', title: 'Objection Ladder', tier: 1,
          gives: 'The five things they say instead of no — and what to say back.',
          xp: 52,
          fields: [
            { k: 'offer', type: 'text', label: 'What are you selling?',
              ph: '12-week transformation programme, £900',
              ex: ['12-week transformation programme, £900', 'online coaching at £150/month',
                   'a small group at £75 a month'] }
          ]
        }
      ]
    },

    /* ═══════════════════════════ LEDGER ══════════════════════ */
    {
      id: 'ledger', name: 'LEDGER', hue: 142,
      role: 'Pricing & offers',
      sigil: SIGIL.ledger,
      unlock: { level: 3 },
      line: 'Prices the work properly and shows you the maths you have been avoiding.',
      goodAt: [
        'Turning one service into a three-tier stack',
        'Working out what you actually earn per hour',
        'Scripting a price rise that keeps the good clients'
      ],
      missions: [
        {
          id: 'stack', title: 'Offer Stack',
          gives: 'Three tiers with names, contents and the reason each one exists.',
          xp: 48,
          fields: [
            { k: 'core', type: 'text', label: 'Your main service',
              ph: '1:1 coaching, £180 a month',
              ex: ['1:1 coaching, £180 a month', 'online programme, £99 a month', 'in-person sessions, £60 each'] },
            { k: 'who', type: 'text', label: 'Who buys it?', ph: 'desk-bound men over 40', ex: AUDIENCES }
          ]
        },
        {
          id: 'truehourly', title: 'True Hourly',
          gives: 'What you really earn per hour once admin and unpaid time is counted.',
          xp: 44,
          fields: [
            { k: 'revenue', type: 'number', label: 'Monthly revenue', ph: '3200', ex: ['3200', '5400', '1800', '9000'] },
            { k: 'clients', type: 'number', label: 'Number of clients', ph: '14', ex: ['14', '22', '8', '40'] },
            { k: 'contact', type: 'number', label: 'Coaching hours a week', ph: '18', ex: ['18', '25', '10', '32'] },
            { k: 'admin', type: 'number', label: 'Unpaid hours a week (admin, DMs, programming)', ph: '12', ex: ['12', '8', '20', '6'] }
          ]
        },
        {
          id: 'raise', title: 'Price Rise Kit', tier: 1,
          gives: 'The email, the timeline and the answers to what they will say back.',
          xp: 56,
          fields: [
            { k: 'from', type: 'text', label: 'Current price', ph: '£150 a month', ex: ['£150 a month', '£60 a session', '$199/mo'] },
            { k: 'to', type: 'text', label: 'New price', ph: '£195 a month', ex: ['£195 a month', '£75 a session', '$260/mo'] }
          ]
        }
      ]
    },

    /* ═══════════════════════════ PULSE ═══════════════════════ */
    {
      id: 'pulse', name: 'PULSE', hue: 345,
      role: 'Retention & check-ins',
      sigil: SIGIL.pulse,
      unlock: { level: 5 },
      line: 'Spots the client who is about to quit — usually two weeks before they tell you.',
      goodAt: [
        'Check-in messages that get an actual reply',
        'Naming the early warning signs in plain language',
        'Win-back notes that do not sound desperate'
      ],
      missions: [
        {
          id: 'checkin', title: 'Check-In Composer',
          gives: 'A weekly check-in built around what they told you, plus the flags to watch.',
          xp: 40,
          fields: [
            { k: 'name', type: 'text', label: 'Client name', ph: 'Sarah', ex: ['Sarah', 'Marcus', 'Priya', 'Tom', 'Dee'] },
            { k: 'week', type: 'number', label: 'Which week are they in?', ph: '3', ex: ['3', '7', '11', '1'] },
            { k: 'notes', type: 'area', label: 'What has been going on?',
              ph: 'missed two sessions, said work is mad, scale has not moved',
              ex: ['missed two sessions, said work is mad, scale has not moved',
                   'smashing every session but sleeping badly',
                   'lost 3kg but getting obsessive about the numbers',
                   'went quiet after a great first fortnight'] }
          ]
        },
        {
          id: 'winback', title: 'Win-Back Note',
          gives: 'A message to someone who drifted, written without a shred of guilt-trip.',
          xp: 42,
          fields: [
            { k: 'name', type: 'text', label: 'Who drifted?', ph: 'Marcus', ex: ['Marcus', 'Sarah', 'Jen', 'Ollie'] },
            { k: 'gone', type: 'select', label: 'How long since you heard from them?',
              options: ['A couple of weeks', 'About a month', 'Three months', 'Over six months'] }
          ]
        },
        {
          id: 'risk', title: 'Churn Radar', tier: 1,
          gives: 'Your roster sorted into who is safe, who is wobbling and who needs a call today.',
          xp: 58,
          fields: [
            { k: 'roster', type: 'area', label: 'One client per line — name, then how it is going',
              ph: 'Sarah — missed 2 sessions, quiet\nMarcus — every session, loving it\nPriya — turning up but flat',
              ex: ['Sarah — missed 2 sessions, quiet\nMarcus — every session, loving it\nPriya — turning up but flat\nTom — asked about pausing',
                   'Dee — great start then vanished\nJen — consistent, no complaints\nOllie — keeps rescheduling'] }
          ]
        }
      ]
    },

    /* ═══════════════════════════ SCOUT ═══════════════════════ */
    {
      id: 'scout', name: 'SCOUT', hue: 265,
      role: 'Finding the next client',
      sigil: SIGIL.scout,
      unlock: { level: 7 },
      line: 'Works out where your people already gather, and what to say when you get there.',
      goodAt: [
        'Naming the exact places your buyers already are',
        'An opener that does not read like a pitch',
        'Questions that qualify someone in four messages'
      ],
      missions: [
        {
          id: 'sweep', title: 'Lead Sweep',
          gives: 'Where to look, what to search, and the first message to send.',
          xp: 46,
          fields: [
            { k: 'who', type: 'text', label: 'Who are you looking for?', ph: 'post-natal women returning to training', ex: AUDIENCES },
            { k: 'where', type: 'text', label: 'Where do you work?', ph: 'Leeds, and online', ex: ['Leeds, and online', 'online only', 'Manchester city centre', 'a small town, everyone knows everyone'] }
          ]
        },
        {
          id: 'opener', title: 'Cold Open',
          gives: 'A four-message ladder from hello to booked, with exit lines.',
          xp: 44,
          fields: [
            { k: 'who', type: 'text', label: 'Who are you messaging?', ph: 'weekend runners chasing a PB', ex: AUDIENCES },
            { k: 'hook', type: 'text', label: 'What have you noticed about them?',
              ph: 'they post their Sunday long run every week',
              ex: ['they post their Sunday long run every week', 'they keep asking about knee pain in the comments',
                   'they just signed up for their first half marathon'] }
          ]
        },
        {
          id: 'referral', title: 'Referral Loop', tier: 1,
          gives: 'A referral ask that does not make it weird, plus when to send it.',
          xp: 54,
          fields: [
            { k: 'best', type: 'text', label: 'Describe your happiest client',
              ph: 'Dee — down 8kg, tells everyone, been with me a year',
              ex: ['Dee — down 8kg, tells everyone, been with me a year',
                   'Tom — deadlifted double bodyweight, quiet but loyal'] }
          ]
        }
      ]
    },

    /* ═══════════════════════════ MUSE ════════════════════════ */
    {
      id: 'muse', name: 'MUSE', hue: 45,
      role: 'Mindset & the hard conversations',
      sigil: SIGIL.muse,
      unlock: { level: 9 },
      line: 'For the part of coaching that has nothing to do with sets and reps.',
      goodAt: [
        'Reframing a stuck thought without dismissing it',
        'Scripting the conversation you are dreading',
        'Finding the real reason behind "I have no motivation"'
      ],
      missions: [
        {
          id: 'reframe', title: 'Reframe',
          gives: 'Four honest reframes and the one question to ask next.',
          xp: 40,
          fields: [
            { k: 'thought', type: 'area', label: 'What is the stuck thought?',
              ph: 'I have failed at this so many times, why would this be different',
              ex: ['I have failed at this so many times, why would this be different',
                   'I do not have the discipline other people have',
                   'I always do well for two weeks then fall apart',
                   'I hate how I look in the gym mirror'] },
            { k: 'whose', type: 'pills', label: 'Whose thought is it?', options: ['A client’s', 'Mine'], def: 'A client’s' }
          ]
        },
        {
          id: 'hard', title: 'Hard Conversation',
          gives: 'The opening line, the middle, and how to end it well.',
          xp: 48,
          fields: [
            { k: 'what', type: 'text', label: 'What do you need to say?',
              ph: 'they keep cancelling last minute and I need it to stop',
              ex: ['they keep cancelling last minute and I need it to stop',
                   'I do not think I am the right coach for them any more',
                   'their goal is not realistic in the time they have given me',
                   'I need to let a client go'] }
          ]
        },
        {
          id: 'why', title: 'The Real Why', tier: 1,
          gives: 'A five-question ladder that gets under the surface answer.',
          xp: 52,
          fields: [
            { k: 'surface', type: 'text', label: 'What did they say they want?',
              ph: 'I just want to lose a stone',
              ex: ['I just want to lose a stone', 'I want to get toned',
                   'I want to be fit again', 'I want to feel like myself'] }
          ]
        }
      ]
    },

    /* ═══════════════════════════ CIPHER ══════════════════════ */
    {
      id: 'cipher', name: 'CIPHER', hue: 190,
      role: 'Numbers, read plainly',
      sigil: SIGIL.cipher,
      unlock: { level: 12 },
      line: 'Does the arithmetic and then tells you, in one sentence, what is actually broken.',
      goodAt: [
        'Finding the leaky step in your funnel',
        'Telling you what a number needs to be, not just what it is',
        'Ignoring the metrics that do not pay you'
      ],
      missions: [
        {
          id: 'funnel', title: 'Funnel Readout',
          gives: 'Conversion at every step, the weakest link, and the fix.',
          xp: 50,
          fields: [
            { k: 'reach', type: 'number', label: 'People who saw you last month', ph: '8000', ex: ['8000', '2400', '31000', '900'] },
            { k: 'leads', type: 'number', label: 'Enquiries / DMs', ph: '46', ex: ['46', '12', '180', '7'] },
            { k: 'calls', type: 'number', label: 'Calls or consults held', ph: '11', ex: ['11', '5', '38', '3'] },
            { k: 'sales', type: 'number', label: 'New clients signed', ph: '3', ex: ['3', '1', '14', '0'] }
          ]
        },
        {
          id: 'target', title: 'Reverse the Target',
          gives: 'Works backwards from the income you want to the calls you need.',
          xp: 46,
          fields: [
            { k: 'want', type: 'number', label: 'Monthly income you want', ph: '5000', ex: ['5000', '3000', '8000', '12000'] },
            { k: 'price', type: 'number', label: 'Price per client per month', ph: '180', ex: ['180', '99', '250', '450'] },
            { k: 'close', type: 'number', label: 'Out of 10 calls, how many say yes?', ph: '3', ex: ['3', '2', '5', '4'] }
          ]
        },
        {
          id: 'retention', title: 'Retention Maths', tier: 1,
          gives: 'What a client is worth, and what one extra month does to your year.',
          xp: 54,
          fields: [
            { k: 'price', type: 'number', label: 'Monthly price', ph: '180', ex: ['180', '99', '250'] },
            { k: 'months', type: 'number', label: 'Average months a client stays', ph: '5', ex: ['5', '3', '9', '12'] },
            { k: 'clients', type: 'number', label: 'New clients a month', ph: '4', ex: ['4', '2', '8'] }
          ]
        }
      ]
    },

    /* ═══════════════════════════ RELAY ═══════════════════════ */
    {
      id: 'relay', name: 'RELAY', hue: 15,
      role: 'Automation & systems',
      sigil: SIGIL.relay,
      unlock: { level: 15 },
      line: 'Takes the thing you do by hand every week and describes the machine that should do it.',
      goodAt: [
        'Mapping a manual chore into steps you can automate',
        'Choosing tools you will actually keep using',
        'Writing the templates the system needs to run'
      ],
      missions: [
        {
          id: 'blueprint', title: 'Automation Blueprint',
          gives: 'Trigger, steps, tools, and the manual fallback for when it breaks.',
          xp: 52,
          fields: [
            { k: 'chore', type: 'text', label: 'What do you do by hand every week?',
              ph: 'chase people who booked a call but did not show',
              ex: ['chase people who booked a call but did not show',
                   'send weekly check-in forms to every client',
                   'move new enquiries into my spreadsheet',
                   'remind clients to log their sessions'] },
            { k: 'stack', type: 'text', label: 'What tools do you already pay for?',
              ph: 'Instagram, Google Sheets, Calendly, Stripe',
              ex: ['Instagram, Google Sheets, Calendly, Stripe', 'just email and a notebook',
                   'Trainerize, WhatsApp, Google Calendar'] }
          ]
        },
        {
          id: 'intake', title: 'Intake Flow',
          gives: 'Everything between "I am interested" and session one, in order.',
          xp: 48,
          fields: [
            { k: 'service', type: 'text', label: 'What are they signing up to?',
              ph: '12-week 1:1 coaching',
              ex: ['12-week 1:1 coaching', 'online programme', 'small group sessions'] }
          ]
        },
        {
          id: 'audit', title: 'Time Leak Audit', tier: 1,
          gives: 'Where your week disappears, and which leak to plug first.',
          xp: 56,
          fields: [
            { k: 'week', type: 'area', label: 'Roughly, where does your week go?',
              ph: '20h coaching, 6h DMs, 5h programme writing, 4h admin, 3h content',
              ex: ['20h coaching, 6h DMs, 5h programme writing, 4h admin, 3h content',
                   '12h sessions, 10h social media, 6h chasing payments, 4h travel'] }
          ]
        }
      ]
    }
  ];

  /* ── indexes & helpers ────────────────────────────────────── */

  const BY_ID = Object.fromEntries(LIST.map(a => [a.id, a]));

  /** Mastery: 0–5, earned from runs with that agent. */
  const MASTERY_STEPS = [0, 3, 8, 16, 28, 45];
  const MASTERY_NAMES = ['Unproven', 'Tuned', 'Calibrated', 'Attuned', 'Resonant', 'Harmonic'];

  function masteryOf(runs) {
    let m = 0;
    for (let i = 1; i < MASTERY_STEPS.length; i++) if (runs >= MASTERY_STEPS[i]) m = i;
    return m;
  }

  /** Progress toward the next mastery tier, 0..1. */
  function masteryProgress(runs) {
    const m = masteryOf(runs);
    if (m >= 5) return 1;
    const lo = MASTERY_STEPS[m], hi = MASTERY_STEPS[m + 1];
    return Math.min(1, (runs - lo) / (hi - lo));
  }

  /** Tier-1 missions stay dark until mastery 2 with that agent. */
  const TIER1_MASTERY = 2;

  function missionsFor(agent, runs) {
    const m = masteryOf(runs);
    return agent.missions.map(mi => ({
      ...mi,
      locked: (mi.tier || 0) >= 1 && m < TIER1_MASTERY,
      lockNote: 'Mastery ' + TIER1_MASTERY + ' with ' + agent.name
    }));
  }

  function findMission(agentId, missionId) {
    const a = BY_ID[agentId];
    if (!a) return null;
    return a.missions.find(m => m.id === missionId) || null;
  }

  return {
    list: LIST,
    byId: BY_ID,
    SIGIL,
    masteryOf, masteryProgress, missionsFor, findMission,
    MASTERY_NAMES, MASTERY_STEPS, TIER1_MASTERY
  };
})();
