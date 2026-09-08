/**
 * The peptide corpus.
 *
 * This is the platform's single source of truth: compounds, the mechanisms
 * proposed for them, the claims people make about them, and the studies those
 * claims lean on. Every claim carries an evidence tier and points at the
 * studies behind it, which is what makes "Show me the science" possible —
 * there is nothing on screen that cannot be expanded into its sources.
 *
 * Two editorial rules govern this file:
 *
 * 1. **Nothing is a recommendation.** Dosing appears only as `reported`
 *    context — what the literature and the market describe — never as
 *    guidance, and always with its own caveat. The platform teaches research
 *    literacy; it does not practise medicine.
 * 2. **Weak evidence is labelled weak.** Where a compound is popular and the
 *    human evidence is absent, the corpus says so plainly rather than
 *    borrowing confidence from a mouse.
 *
 * Studies carry a `search` string rather than a fabricated link: the UI opens
 * a real PubMed query so a reader lands on the literature itself. Verify every
 * citation against the source before reusing it in published material.
 *
 * @module astra/data/peptides
 */

/** Body systems used by the knowledge graph and the interest dashboard. */
export const SYSTEMS = [
  { id: 'musculoskeletal', label: 'Muscle, tendon & joint', icon: '⌁' },
  { id: 'gastrointestinal', label: 'Gut & digestion', icon: '◍' },
  { id: 'integumentary', label: 'Skin & hair', icon: '❋' },
  { id: 'nervous', label: 'Brain & nervous system', icon: '⁂' },
  { id: 'endocrine', label: 'Hormonal axis', icon: '◈' },
  { id: 'metabolic', label: 'Metabolism & body composition', icon: '⧗' },
  { id: 'immune', label: 'Immune & inflammation', icon: '❖' },
  { id: 'cardiovascular', label: 'Heart & vessels', icon: '♥' },
];

/** Reader interests. The dashboard reorders the whole platform around these. */
export const GOALS = [
  { id: 'recovery', label: 'Recovery & injury', blurb: 'Tendon, muscle, wound and post-surgical repair research.' },
  { id: 'metabolic', label: 'Metabolic health', blurb: 'Glucose handling, insulin sensitivity, visceral fat.' },
  { id: 'longevity', label: 'Longevity', blurb: 'Ageing biology, tissue maintenance, senescence.' },
  { id: 'performance', label: 'Performance', blurb: 'Output, work capacity and the regulatory reality of sport.' },
  { id: 'cognition', label: 'Cognition & focus', blurb: 'Attention, memory, neuroprotection, BDNF.' },
  { id: 'gut-health', label: 'Gut health', blurb: 'Barrier integrity, colitis models, mucosal inflammation.' },
  { id: 'skin-hair', label: 'Skin & hair', blurb: 'Collagen, elastin, wound healing, cosmetic endpoints.' },
  { id: 'mood', label: 'Mood & stress', blurb: 'Anxiolytic and stress-resilience research.' },
  { id: 'immune', label: 'Immune balance', blurb: 'Inflammatory signalling and immune modulation.' },
];

/**
 * The compounds.
 *
 * @type {Array<object>}
 */
export const PEPTIDES = [
  {
    id: 'bpc-157',
    name: 'BPC-157',
    full: 'Body Protection Compound-157',
    aka: ['PL 14736', 'Pentadecapeptide BPC 157'],
    klass: 'Synthetic pentadecapeptide',
    tagline: 'The most-discussed repair peptide, and the widest gap between talk and human data.',
    accent: '#35d07f',
    accent2: '#0d7a4a',
    systems: ['gastrointestinal', 'musculoskeletal', 'nervous'],
    goals: ['recovery', 'gut-health'],
    summary: 'A 15-amino-acid sequence derived from a protein fragment found in human gastric juice. It has been studied for three decades, almost entirely in rodents, across an unusually broad set of injury models — tendon, ligament, muscle, gut, and nerve.',
    mechanisms: [
      { id: 'vegf', title: 'Angiogenic signalling', detail: 'Upregulation of VEGFR2 and downstream nitric oxide signalling is the most frequently proposed route, driving new vessel growth into damaged tissue.', tier: 'animal' },
      { id: 'fibroblast', title: 'Fibroblast migration', detail: 'Cell work reports faster tendon fibroblast migration and increased FAK–paxillin activation in the presence of the peptide.', tier: 'invitro' },
      { id: 'no-system', title: 'Nitric oxide system interaction', detail: 'Counteracts both L-NAME-induced and L-arginine-induced effects in rodent models, which the original investigators read as a stabilising interaction with NO signalling.', tier: 'animal' },
      { id: 'gut-brain', title: 'Gut–brain axis modulation', detail: 'Rodent work reports effects on dopaminergic and serotonergic systems after gut administration, proposed as a gut–brain route.', tier: 'animal' },
    ],
    claims: [
      { id: 'tendon', text: 'Accelerates tendon and ligament healing', tier: 'animal', studies: ['bpc-krivic', 'bpc-chang'], note: 'Consistent and repeated — in rats. No published human trial in tendon injury.' },
      { id: 'gut', text: 'Protects the gut lining and reduces intestinal inflammation', tier: 'animal', studies: ['bpc-sikiric-gi', 'bpc-uc'], note: 'The gut is the one indication that reached human testing, and the published detail is thin.' },
      { id: 'systemic', text: 'Heals almost any tissue in the body', tier: 'anecdotal', studies: [], note: 'This is a marketing claim. The breadth comes from the number of rodent models tried, not from breadth of proof.' },
    ],
    studies: [
      {
        id: 'bpc-krivic', title: 'BPC 157 and Achilles tendon-to-bone healing in rats', year: 2006,
        journal: 'Journal of Orthopaedic Research', design: 'Controlled animal experiment', tier: 'animal',
        n: 72, population: 'Male Wistar rats, transected Achilles tendon',
        finding: 'Treated animals showed faster functional recovery and greater load-to-failure at the tendon–bone junction than controls.',
        limitation: 'Rodent tendon healing differs from human tendinopathy, which is usually degenerative rather than a clean transection.',
        direction: 1, independent: true, search: 'BPC 157 Achilles tendon rat Krivic',
      },
      {
        id: 'bpc-chang', title: 'BPC 157 and tendon fibroblast outgrowth and migration', year: 2011,
        journal: 'Journal of Applied Physiology', design: 'In vitro cell study', tier: 'invitro',
        n: 0, population: 'Cultured rat Achilles tendon fibroblasts',
        finding: 'Increased fibroblast outgrowth, migration and F-actin formation, with FAK and paxillin activation proposed as the pathway.',
        limitation: 'Cells in a dish see a concentration and a duration nothing in a body would experience.',
        direction: 1, independent: true, search: 'BPC 157 tendon fibroblast FAK paxillin Chang',
      },
      {
        id: 'bpc-sikiric-gi', title: 'Stable gastric pentadecapeptide BPC 157 in gastrointestinal lesion models', year: 2018,
        journal: 'Current Pharmaceutical Design', design: 'Narrative review of the authors’ own animal programme', tier: 'animal',
        n: 0, population: 'Multiple rodent GI injury models',
        finding: 'Reports protective and healing effects across ulcer, fistula, colitis and short-bowel models.',
        limitation: 'A review by the group that produced most of the underlying work. Independent replication outside that group is limited.',
        direction: 1, independent: false, search: 'Sikiric BPC 157 gastrointestinal review',
      },
      {
        id: 'bpc-uc', title: 'PL 14736 (BPC 157) in ulcerative colitis — early-phase human testing', year: 2010,
        journal: 'Reported in review literature', design: 'Phase II clinical work, limited published detail', tier: 'human-trial',
        n: 0, population: 'Adults with ulcerative colitis',
        finding: 'Described in secondary literature as showing tolerability and signals of benefit.',
        limitation: 'This is the pivotal weakness of the whole BPC-157 story: the human trial is cited far more often than it is read, and full peer-reviewed primary results are not readily available. Treat the human tier here as provisional.',
        relevance: 0.5, direction: 1, independent: false, search: 'PL 14736 ulcerative colitis BPC 157 clinical',
      },
    ],
    uncertainties: [
      'There is no published, adequately powered, peer-reviewed randomised human trial for any musculoskeletal indication.',
      'A large share of the literature comes from one research group, so independent replication is the open question.',
      'Oral versus injected bioavailability in humans is not characterised in the public literature.',
      'Long-term safety data in humans does not exist. Angiogenesis-promoting effects have not been studied against tumour risk in people.',
    ],
    regulatory: {
      status: 'not-approved',
      headline: 'Not approved as a drug in the US, UK or EU.',
      detail: 'In 2023 the FDA placed BPC-157 in Category 2 of its compounding bulk-substances review — substances raising significant safety concerns — which effectively closed the compounding-pharmacy route in the US. Sold widely as a "research chemical", which is a legal framing, not a quality assurance.',
      sport: 'Prohibited at all times in sport under the WADA S0 category (non-approved substances).',
    },
    reported: {
      route: 'Subcutaneous injection or oral, depending on the protocol described',
      range: 'Marketing material commonly cites 200–500 mcg once or twice daily',
      note: 'Reported for context only. These figures come from vendor and community sources, not from a dose-finding trial in humans — no such trial has been published.',
    },
    timeline: [
      { year: 1991, label: 'Sequence described', detail: 'Identified as a fragment of a protein in human gastric juice by the Zagreb group.', kind: 'discovery' },
      { year: 2006, label: 'Tendon model published', detail: 'Rat Achilles work becomes the most-cited musculoskeletal result.', kind: 'preclinical' },
      { year: 2011, label: 'Cell mechanism proposed', detail: 'Fibroblast migration and FAK–paxillin pathway reported.', kind: 'preclinical' },
      { year: 2016, label: 'Popular adoption', detail: 'Enters mainstream fitness and biohacking discussion far ahead of the human evidence.', kind: 'culture' },
      { year: 2023, label: 'FDA Category 2', detail: 'Placed in the compounding category reserved for significant safety concerns.', kind: 'regulatory' },
    ],
    related: ['tb-500', 'kpv', 'ghk-cu', 'klow'],
  },

  {
    id: 'tb-500',
    name: 'TB-500',
    full: 'Thymosin Beta-4 fragment (Ac-LKKTETQ)',
    aka: ['Tβ4 fragment', 'Thymosin beta-4 active region'],
    klass: 'Synthetic peptide fragment',
    tagline: 'Often sold as thymosin beta-4. It is a fragment of it, and the distinction changes what the evidence applies to.',
    accent: '#8b5cf6',
    accent2: '#4c1d95',
    systems: ['musculoskeletal', 'cardiovascular', 'integumentary'],
    goals: ['recovery', 'performance'],
    summary: 'A short synthetic sequence corresponding to the actin-binding region of thymosin beta-4, a 43-amino-acid protein present throughout human tissue. Most published clinical work used full-length Tβ4, not the fragment sold as TB-500.',
    mechanisms: [
      { id: 'actin', title: 'Actin sequestration', detail: 'The LKKTETQ motif binds G-actin, influencing cytoskeletal assembly and therefore cell migration into a wound.', tier: 'invitro' },
      { id: 'angiogenesis', title: 'Angiogenesis and endothelial migration', detail: 'Full-length Tβ4 promotes endothelial cell migration and vessel formation in preclinical models.', tier: 'animal' },
      { id: 'inflammation', title: 'Downregulation of inflammatory mediators', detail: 'Animal work reports reduced NF-κB-driven inflammatory signalling after injury.', tier: 'animal' },
    ],
    claims: [
      { id: 'wound', text: 'Speeds wound and corneal healing', tier: 'human-trial', studies: ['tb-rgn259', 'tb-guarnera'], note: 'The human evidence is for full-length Tβ4 applied topically to the eye or a skin ulcer — not the injected fragment.' },
      { id: 'cardiac', text: 'Repairs heart tissue after injury', tier: 'animal', studies: ['tb-bock'], note: 'A striking mouse result that has not translated into an approved human therapy in twenty years.' },
      { id: 'muscle', text: 'Accelerates muscle and tendon recovery in athletes', tier: 'anecdotal', studies: [], note: 'No human trial supports this use. It is also a banned substance in sport.' },
    ],
    studies: [
      {
        id: 'tb-bock', title: 'Thymosin β4 activates integrin-linked kinase and promotes cardiac repair', year: 2004,
        journal: 'Nature', design: 'Animal experiment with mechanistic work', tier: 'animal',
        n: 0, population: 'Mice, coronary artery ligation model',
        finding: 'Tβ4 improved cardiac function and myocyte survival after infarction, via integrin-linked kinase and Akt.',
        limitation: 'A high-profile mouse finding. Human cardiac translation has not followed despite two decades of interest.',
        relevance: 0.5, direction: 1, independent: true, search: 'Bock-Marquette thymosin beta 4 cardiac repair Nature 2004',
      },
      {
        id: 'tb-rgn259', title: 'Thymosin β4 eye drops (RGN-259) for dry eye disease', year: 2018,
        journal: 'Clinical trial programme', design: 'Randomised, double-masked, vehicle-controlled trials', tier: 'human-rct',
        n: 700, population: 'Adults with dry eye disease, multiple trials',
        finding: 'Improvements in ocular discomfort and corneal staining were reported in some trials; the programme has had mixed results across endpoints.',
        limitation: 'Topical ocular use of the full-length protein. This tells you almost nothing about an injected fragment used for tendon pain.',
        relevance: 0.25, direction: 1, independent: true, search: 'RGN-259 thymosin beta 4 dry eye randomized trial',
      },
      {
        id: 'tb-guarnera', title: 'Thymosin β4 in venous stasis and pressure ulcers', year: 2010,
        journal: 'Annals of the New York Academy of Sciences', design: 'Phase II randomised trial', tier: 'human-trial',
        n: 72, population: 'Adults with chronic venous stasis ulcers',
        finding: 'Trend toward faster healing at some concentrations; the trial was exploratory and not definitive.',
        limitation: 'Small, exploratory, topical, and in a specific wound population.',
        relevance: 0.3, direction: 1, independent: true, search: 'Guarnera thymosin beta 4 venous stasis ulcer phase 2',
      },
    ],
    uncertainties: [
      'The gap between full-length Tβ4 (what the trials used) and the LKKTETQ fragment (what is sold) is rarely acknowledged in marketing.',
      'No human trial has tested the injected fragment for musculoskeletal recovery.',
      'Promoting angiogenesis and cell migration is a double-edged mechanism; oncological safety in humans is unstudied.',
      'Product identity and purity in the grey market are unverified — independent testing of research peptides frequently finds content deviating from label.',
    ],
    regulatory: {
      status: 'not-approved',
      headline: 'Not an approved drug. Full-length Tβ4 remains investigational.',
      detail: 'RGN-259 (topical Tβ4) has been through clinical trials without reaching approval. The injectable fragment sold as TB-500 has no approved status anywhere.',
      sport: 'Explicitly prohibited at all times by WADA (S2, growth factors affecting tissue repair).',
    },
    reported: {
      route: 'Subcutaneous injection in the protocols described online',
      range: 'Community sources commonly describe 2–5 mg once or twice weekly',
      note: 'Reported for context only. No human dose-finding study exists for this fragment by this route.',
    },
    timeline: [
      { year: 1981, label: 'Tβ4 characterised', detail: 'The parent protein is isolated and sequenced.', kind: 'discovery' },
      { year: 2004, label: 'Nature cardiac paper', detail: 'The mouse heart-repair result draws major attention.', kind: 'preclinical' },
      { year: 2010, label: 'Ulcer trial', detail: 'Phase II topical wound trial reports exploratory signals.', kind: 'clinical' },
      { year: 2018, label: 'Ocular programme matures', detail: 'Dry-eye trials report mixed endpoint results.', kind: 'clinical' },
      { year: 2020, label: 'Grey-market growth', detail: 'The fragment becomes a fixture of recovery stacks with no supporting human data.', kind: 'culture' },
    ],
    related: ['bpc-157', 'ghk-cu', 'klow'],
  },

  {
    id: 'kpv',
    name: 'KPV',
    full: 'Lysine-Proline-Valine',
    aka: ['α-MSH (11-13)', 'Alpha-MSH C-terminal tripeptide'],
    klass: 'Tripeptide',
    tagline: 'The smallest active piece of a hormone your body already makes, studied as an anti-inflammatory.',
    accent: '#4fb8ff',
    accent2: '#0e4a80',
    systems: ['immune', 'gastrointestinal', 'integumentary'],
    goals: ['gut-health', 'immune', 'skin-hair'],
    summary: 'The three C-terminal amino acids of alpha-melanocyte-stimulating hormone. The parent hormone is strongly anti-inflammatory but also drives pigmentation; the tripeptide retains much of the anti-inflammatory activity in models without the pigmentary effect.',
    mechanisms: [
      { id: 'nfkb', title: 'NF-κB pathway suppression', detail: 'Cell work reports inhibition of NF-κB nuclear translocation, reducing transcription of inflammatory cytokines.', tier: 'invitro' },
      { id: 'pept1', title: 'PepT1-mediated uptake by colonocytes', detail: 'The tripeptide is taken up through the PepT1 transporter, which is upregulated in inflamed intestinal epithelium — a targeting mechanism rather than a systemic one.', tier: 'animal' },
      { id: 'mast', title: 'Mast cell and cytokine modulation', detail: 'Reduces pro-inflammatory cytokine release in several immune cell models.', tier: 'invitro' },
    ],
    claims: [
      { id: 'colitis', text: 'Reduces intestinal inflammation', tier: 'animal', studies: ['kpv-dalmasso', 'kpv-kannengiesser'], note: 'A clean, mechanistically coherent mouse result with an identified transporter. Still mice.' },
      { id: 'skin', text: 'Calms inflammatory skin conditions', tier: 'invitro', studies: ['kpv-skin'], note: 'Cell and small model work only.' },
      { id: 'human-gut', text: 'Treats IBD in people', tier: 'anecdotal', studies: [], note: 'No human trial. The mechanism is attractive; that is not the same thing.' },
    ],
    studies: [
      {
        id: 'kpv-dalmasso', title: 'PepT1-mediated tripeptide KPV uptake reduces intestinal inflammation', year: 2008,
        journal: 'Gastroenterology', design: 'Animal and cell study', tier: 'animal',
        n: 0, population: 'Mouse colitis models and human intestinal epithelial cell lines',
        finding: 'KPV entered epithelial cells through PepT1 and reduced inflammatory signalling and colitis severity at very low concentrations.',
        limitation: 'Mouse colitis models respond to many things that fail in human IBD trials.',
        direction: 1, independent: true, search: 'Dalmasso PepT1 KPV intestinal inflammation Gastroenterology 2008',
      },
      {
        id: 'kpv-kannengiesser', title: 'Melanocortin-derived tripeptide KPV has anti-inflammatory potential in murine colitis', year: 2008,
        journal: 'Inflammatory Bowel Diseases', design: 'Animal experiment', tier: 'animal',
        n: 0, population: 'Mice, DSS and TNBS colitis',
        finding: 'Reduced weight loss, histological damage and inflammatory markers versus control.',
        limitation: 'Chemically induced colitis is a model of inflammation, not of Crohn’s or ulcerative colitis biology.',
        direction: 1, independent: true, search: 'Kannengiesser KPV murine colitis melanocortin',
      },
      {
        id: 'kpv-skin', title: 'Anti-inflammatory activity of α-MSH C-terminal fragments in skin models', year: 2011,
        journal: 'Experimental Dermatology and related literature', design: 'In vitro and small animal models', tier: 'invitro',
        n: 0, population: 'Keratinocyte and dermatitis models',
        finding: 'Reduced cytokine release and inflammatory markers.',
        limitation: 'No controlled human skin trial for the isolated tripeptide.',
        direction: 1, independent: true, search: 'alpha-MSH KPV tripeptide skin inflammation keratinocyte',
      },
    ],
    uncertainties: [
      'No human clinical trial has been published for KPV in any indication.',
      'Systemic exposure and half-life in humans are uncharacterised — a tripeptide is a short-lived molecule.',
      'The PepT1 targeting story explains gut delivery specifically; it does not support systemic anti-inflammatory claims.',
    ],
    regulatory: {
      status: 'not-approved',
      headline: 'No approved medicinal use anywhere.',
      detail: 'Available as a research chemical and in compounded preparations in some jurisdictions. Regulatory scrutiny of compounded peptides has tightened considerably since 2023.',
      sport: 'Falls under WADA S0 as a non-approved substance.',
    },
    reported: {
      route: 'Subcutaneous, oral or topical depending on the described protocol',
      range: 'Marketing material commonly cites 200–500 mcg daily',
      note: 'Reported for context only — no human dose-finding data exists.',
    },
    timeline: [
      { year: 1990, label: 'α-MSH anti-inflammatory activity mapped', detail: 'The C-terminal tripeptide is identified as carrying much of the activity.', kind: 'discovery' },
      { year: 2008, label: 'Two colitis papers land', detail: 'PepT1 uptake and murine colitis benefit published in the same year.', kind: 'preclinical' },
      { year: 2019, label: 'Enters wellness market', detail: 'Adopted into gut-health and skin stacks well ahead of human testing.', kind: 'culture' },
    ],
    related: ['bpc-157', 'ghk-cu', 'klow'],
  },

  {
    id: 'ghk-cu',
    name: 'GHK-Cu',
    full: 'Glycyl-L-histidyl-L-lysine copper complex',
    aka: ['Copper peptide', 'GHK'],
    klass: 'Copper-binding tripeptide',
    tagline: 'The one on this list with a genuine human cosmetic evidence base — and a much longer list of claims than that base supports.',
    accent: '#2fe0c0',
    accent2: '#0b6b5c',
    systems: ['integumentary', 'immune', 'nervous'],
    goals: ['skin-hair', 'longevity', 'recovery'],
    summary: 'A naturally occurring tripeptide found in human plasma that binds copper(II) with high affinity. Plasma levels fall substantially with age, which is the origin of most of the longevity framing around it. Widely used in cosmetic formulation.',
    mechanisms: [
      { id: 'collagen', title: 'Collagen and glycosaminoglycan synthesis', detail: 'Stimulates fibroblast production of collagen, elastin and proteoglycans in cell and tissue models.', tier: 'invitro' },
      { id: 'gene', title: 'Broad gene expression modulation', detail: 'Transcriptome work reports the peptide shifting expression of thousands of genes toward a tissue-repair profile.', tier: 'invitro' },
      { id: 'copper', title: 'Copper delivery', detail: 'Acts as a physiological copper carrier, and copper is a required cofactor for lysyl oxidase in collagen cross-linking.', tier: 'mechanistic' },
      { id: 'antioxidant', title: 'Antioxidant and anti-inflammatory signalling', detail: 'Reduces markers of oxidative damage and pro-inflammatory cytokine expression in several animal and tissue models, which is the route proposed for its effects on chronic wounds and on skin exposed to ultraviolet damage.', tier: 'animal' },
    ],
    claims: [
      { id: 'skin', text: 'Improves skin firmness, wrinkles and photodamage when applied topically', tier: 'human-trial', studies: ['ghk-cosmetic', 'ghk-leyden'], note: 'The best-supported claim on this page, from small cosmetic trials with visible-appearance endpoints.' },
      { id: 'wound', text: 'Accelerates wound healing', tier: 'animal', studies: ['ghk-wound'], note: 'Consistent animal work; human wound-healing trials are limited.' },
      { id: 'hair', text: 'Stimulates hair growth', tier: 'animal', studies: ['ghk-wound'], note: 'Follicle and animal data, plus formulation use. Not a controlled human hair-count trial.' },
      { id: 'longevity', text: 'Reverses ageing at the gene expression level', tier: 'invitro', studies: ['ghk-pickart'], note: 'A cell-culture transcriptome finding stretched into a systemic anti-ageing claim. That leap is not supported.' },
    ],
    studies: [
      {
        id: 'ghk-pickart', title: 'GHK peptide as a natural modulator of multiple cellular pathways in skin regeneration', year: 2018,
        journal: 'International Journal of Molecular Sciences', design: 'Review with transcriptome analysis', tier: 'invitro',
        n: 0, population: 'Cell lines and published datasets',
        finding: 'GHK resets expression of a large number of genes toward a repair-associated profile, and plasma GHK declines with age.',
        limitation: 'Written by the peptide’s principal advocate, drawing on cell data. Gene expression shifts in culture are not clinical outcomes.',
        direction: 1, independent: false, search: 'Pickart GHK-Cu skin regeneration review molecular pathways',
      },
      {
        id: 'ghk-cosmetic', title: 'Copper tripeptide facial creams in photoaged skin', year: 2005,
        journal: 'Cosmetic dermatology trial literature', design: 'Controlled cosmetic trials, small', tier: 'human-trial',
        n: 71, population: 'Women with mild to advanced photodamage, 12 weeks',
        finding: 'Improvements in skin density, thickness and appearance of fine lines versus vehicle and versus comparator creams.',
        limitation: 'Small, short, cosmetic endpoints, and largely industry-sponsored. Appearance measures are subjective and easily flattered by hydration.',
        relevance: 0.9, direction: 1, independent: true, search: 'copper tripeptide GHK-Cu facial cream photoaged skin clinical trial',
      },
      {
        id: 'ghk-leyden', title: 'Comparative evaluation of copper peptide versus retinol and vitamin C creams', year: 2002,
        journal: 'Cosmetic dermatology conference literature', design: 'Comparator trial', tier: 'human-trial',
        n: 67, population: 'Adults, facial photoaging',
        finding: 'Copper peptide cream performed comparably or favourably against active comparators on several visual endpoints.',
        limitation: 'Conference-level reporting, small sample, cosmetic endpoints.',
        relevance: 0.85, direction: 1, independent: true, search: 'Leyden copper peptide retinol vitamin C comparison photoaging',
      },
      {
        id: 'ghk-wound', title: 'GHK-Cu in experimental wound healing and hair follicle models', year: 2015,
        journal: 'Multiple preclinical reports', design: 'Animal experiments', tier: 'animal',
        n: 0, population: 'Rodent and rabbit wound models; follicle explants',
        finding: 'Faster closure, better tensile strength and increased follicle size relative to control.',
        limitation: 'Animal wound models heal differently from chronic human wounds.',
        direction: 1, independent: true, search: 'GHK-Cu wound healing animal model hair follicle',
      },
    ],
    uncertainties: [
      'Topical cosmetic evidence does not transfer to injected systemic use, which is how it is increasingly sold.',
      'Copper is not benign in excess; systemic copper loading has no safety characterisation in this context.',
      'The "reverses ageing" framing rests on cell transcriptomics, not on any clinical ageing endpoint.',
      'Much of the foundational literature comes from one advocate-investigator.',
    ],
    regulatory: {
      status: 'cosmetic',
      headline: 'Legal and common as a cosmetic ingredient. Not approved as an injectable drug.',
      detail: 'Topical GHK-Cu is a mainstream cosmetic ingredient sold openly. Injectable preparations sit in the same unapproved grey market as the rest of this list.',
      sport: 'Not specifically prohibited in topical cosmetic use.',
    },
    reported: {
      route: 'Topical in the evidence-backed use; subcutaneous injection in grey-market protocols',
      range: 'Cosmetic formulations typically 0.1–2%; injection protocols online commonly cite 1–2 mg two to three times weekly',
      note: 'Reported for context only. The human evidence is topical; injected dosing has no clinical basis.',
    },
    timeline: [
      { year: 1973, label: 'Isolated from human plasma', detail: 'Identified as a growth-supporting factor in serum.', kind: 'discovery' },
      { year: 1988, label: 'Copper complex characterised', detail: 'Copper binding established as central to activity.', kind: 'discovery' },
      { year: 2002, label: 'Cosmetic trials', detail: 'Small human facial trials report appearance improvements.', kind: 'clinical' },
      { year: 2018, label: 'Transcriptome review', detail: 'Gene-expression framing drives the anti-ageing narrative.', kind: 'preclinical' },
    ],
    related: ['bpc-157', 'tb-500', 'kpv', 'klow'],
  },

  {
    id: 'semaglutide',
    name: 'Semaglutide',
    full: 'GLP-1 receptor agonist',
    aka: ['Ozempic', 'Wegovy', 'Rybelsus'],
    klass: 'Incretin mimetic (GLP-1 RA)',
    tagline: 'The compound on this platform with the strongest evidence base by an enormous margin — and it is a prescription drug.',
    accent: '#ff3b5c',
    accent2: '#7a0e22',
    systems: ['metabolic', 'endocrine', 'cardiovascular', 'gastrointestinal'],
    goals: ['metabolic', 'longevity'],
    summary: 'A long-acting analogue of glucagon-like peptide-1, an incretin hormone released by the gut after eating. Approved for type 2 diabetes and, at higher doses, for weight management. It belongs on this platform as the reference standard: this is what a real evidence base looks like.',
    mechanisms: [
      { id: 'incretin', title: 'Glucose-dependent insulin secretion', detail: 'Amplifies insulin release only when glucose is elevated, which is why hypoglycaemia risk is low compared with insulin or sulfonylureas.', tier: 'human-rct' },
      { id: 'gastric', title: 'Delayed gastric emptying', detail: 'Slows the rate at which the stomach empties, prolonging fullness after a meal — which is also the source of the nausea and other gastrointestinal effects that are the most common reason people stop taking it.', tier: 'human-rct' },
      { id: 'central', title: 'Central appetite regulation', detail: 'Acts on hypothalamic and hindbrain circuits governing appetite and food reward.', tier: 'human-trial' },
      { id: 'cardio', title: 'Cardiovascular effects beyond weight', detail: 'Outcome trials show cardiovascular benefit that is not fully explained by weight loss alone; the mechanism remains under study.', tier: 'human-rct' },
    ],
    claims: [
      { id: 'weight', text: 'Produces substantial, sustained weight loss', tier: 'human-rct', studies: ['sema-step1'], note: 'About 15% mean body-weight reduction at 68 weeks in a large randomised trial.' },
      { id: 'cv', text: 'Reduces major cardiovascular events in people with obesity and established cardiovascular disease', tier: 'human-rct', studies: ['sema-select'], note: 'A 17,600-person outcome trial. This is the top of the evidence pyramid.' },
      { id: 'glycaemic', text: 'Improves glycaemic control in type 2 diabetes', tier: 'human-rct', studies: ['sema-sustain6'], note: 'The original approved indication, replicated across a large trial programme.' },
      { id: 'regain', text: 'Weight loss is maintained after stopping', tier: 'human-rct', studies: ['sema-step1'], direction: -1, note: 'Contradicted: withdrawal studies show substantial regain. This is the claim the marketing most often omits.' },
    ],
    studies: [
      {
        id: 'sema-step1', title: 'Once-weekly semaglutide in adults with overweight or obesity (STEP 1)', year: 2021,
        journal: 'New England Journal of Medicine', design: 'Randomised, double-blind, placebo-controlled trial', tier: 'human-rct',
        n: 1961, population: 'Adults with BMI ≥30, or ≥27 with a weight-related condition, without diabetes',
        finding: 'Mean body-weight change of about −14.9% with semaglutide 2.4 mg versus −2.4% with placebo at 68 weeks.',
        limitation: 'All participants received lifestyle intervention; gastrointestinal adverse effects were common; the extension data show substantial regain after discontinuation.',
        direction: 1, independent: false, search: 'Wilding semaglutide STEP 1 NEJM 2021 obesity',
      },
      {
        id: 'sema-select', title: 'Semaglutide and cardiovascular outcomes in obesity without diabetes (SELECT)', year: 2023,
        journal: 'New England Journal of Medicine', design: 'Randomised, double-blind, placebo-controlled outcome trial', tier: 'human-rct',
        n: 17604, population: 'Adults with cardiovascular disease and overweight or obesity, no diabetes',
        finding: 'A roughly 20% reduction in major adverse cardiovascular events versus placebo over a mean follow-up of about 40 months.',
        limitation: 'Industry-sponsored; the population had established cardiovascular disease, so the result does not automatically generalise to primary prevention.',
        direction: 1, independent: false, search: 'Lincoff SELECT semaglutide cardiovascular outcomes NEJM 2023',
      },
      {
        id: 'sema-sustain6', title: 'Semaglutide and cardiovascular outcomes in type 2 diabetes (SUSTAIN-6)', year: 2016,
        journal: 'New England Journal of Medicine', design: 'Randomised, double-blind, placebo-controlled trial', tier: 'human-rct',
        n: 3297, population: 'Adults with type 2 diabetes at high cardiovascular risk',
        finding: 'Lower rate of cardiovascular death, non-fatal myocardial infarction or stroke; an increase in diabetic retinopathy complications was observed.',
        limitation: 'Designed as a non-inferiority safety trial; the retinopathy signal remains a discussed safety question.',
        direction: 1, independent: false, search: 'Marso SUSTAIN-6 semaglutide cardiovascular NEJM 2016',
      },
    ],
    uncertainties: [
      'Weight regain after discontinuation is well documented, which reframes it as an ongoing therapy rather than a course of treatment.',
      'Loss of lean mass alongside fat mass is an active area of study.',
      'Long-term effects over decades are unknown; the drug class is comparatively young at these doses.',
      'Compounded and grey-market "semaglutide" carries real identity and sterility risk — regulators have repeatedly warned about salt forms and unverified sources.',
    ],
    regulatory: {
      status: 'approved',
      headline: 'FDA and EMA approved. Prescription only.',
      detail: 'Approved for type 2 diabetes and for chronic weight management at higher doses. Compounded versions have been the subject of repeated FDA warnings, particularly regarding semaglutide salt forms which are not the approved active ingredient.',
      sport: 'Not currently prohibited by WADA, but always check the current Prohibited List.',
    },
    reported: {
      route: 'Subcutaneous weekly injection, or daily oral tablet',
      range: 'Approved regimens are titrated by a prescriber over months',
      note: 'This is a prescription medicine. Dosing belongs with a clinician who knows the person, and nothing on this platform substitutes for that.',
    },
    timeline: [
      { year: 1987, label: 'GLP-1 incretin effect described', detail: 'The hormone’s role in glucose-dependent insulin release is characterised.', kind: 'discovery' },
      { year: 2005, label: 'First GLP-1 agonist approved', detail: 'Exenatide opens the drug class.', kind: 'regulatory' },
      { year: 2017, label: 'Semaglutide approved for diabetes', detail: 'Weekly injectable enters the market.', kind: 'regulatory' },
      { year: 2021, label: 'STEP 1 published', detail: 'The obesity result that changed the field.', kind: 'clinical' },
      { year: 2023, label: 'SELECT outcomes', detail: 'Cardiovascular benefit demonstrated in people without diabetes.', kind: 'clinical' },
    ],
    related: ['tirzepatide', 'tesamorelin'],
  },

  {
    id: 'tirzepatide',
    name: 'Tirzepatide',
    full: 'Dual GIP and GLP-1 receptor agonist',
    aka: ['Mounjaro', 'Zepbound'],
    klass: 'Dual incretin agonist',
    tagline: 'Two incretin receptors instead of one, and the largest weight-loss effect yet demonstrated in a randomised trial.',
    accent: '#ff6b3d',
    accent2: '#7a2a0e',
    systems: ['metabolic', 'endocrine', 'cardiovascular'],
    goals: ['metabolic', 'longevity'],
    summary: 'A single molecule that activates both the GIP and GLP-1 receptors. Approved for type 2 diabetes and for chronic weight management, with trial results that exceed those of GLP-1 agonists alone.',
    mechanisms: [
      { id: 'dual', title: 'Dual incretin receptor activation', detail: 'Adds GIP receptor agonism to the GLP-1 mechanism; the contribution of the GIP arm is still being characterised and was, for years, expected to work in the opposite direction.', tier: 'human-rct' },
      { id: 'adipose', title: 'Adipose tissue effects', detail: 'GIP receptor signalling in fat tissue is proposed to improve lipid handling and insulin sensitivity.', tier: 'animal' },
    ],
    claims: [
      { id: 'weight', text: 'Produces greater weight loss than GLP-1 agonism alone', tier: 'human-rct', studies: ['tirz-surmount1', 'tirz-surpass2'], note: 'Up to about 21% mean reduction at the highest dose in SURMOUNT-1.' },
      { id: 'a1c', text: 'Lowers HbA1c more than semaglutide 1 mg in type 2 diabetes', tier: 'human-rct', studies: ['tirz-surpass2'], note: 'A head-to-head randomised comparison, which is rare and valuable.' },
    ],
    studies: [
      {
        id: 'tirz-surmount1', title: 'Tirzepatide once weekly for the treatment of obesity (SURMOUNT-1)', year: 2022,
        journal: 'New England Journal of Medicine', design: 'Randomised, double-blind, placebo-controlled trial', tier: 'human-rct',
        n: 2539, population: 'Adults with obesity or overweight with a comorbidity, without diabetes',
        finding: 'Mean weight reduction of about 15%, 19.5% and 20.9% at 5, 10 and 15 mg versus 3.1% with placebo at 72 weeks.',
        limitation: 'Industry-sponsored; gastrointestinal side effects common; discontinuation leads to regain as with GLP-1 agonists.',
        direction: 1, independent: false, search: 'Jastreboff SURMOUNT-1 tirzepatide obesity NEJM 2022',
      },
      {
        id: 'tirz-surpass2', title: 'Tirzepatide versus semaglutide once weekly in type 2 diabetes (SURPASS-2)', year: 2021,
        journal: 'New England Journal of Medicine', design: 'Randomised open-label active-comparator trial', tier: 'human-rct',
        n: 1879, population: 'Adults with type 2 diabetes on metformin',
        finding: 'Greater HbA1c and weight reduction with tirzepatide across all doses versus semaglutide 1 mg.',
        limitation: 'Open-label; the semaglutide comparator dose was lower than the doses later approved for weight management.',
        direction: 1, independent: false, search: 'Frias SURPASS-2 tirzepatide semaglutide NEJM 2021',
      },
    ],
    uncertainties: [
      'Long-term cardiovascular outcome data is less mature than for semaglutide.',
      'The mechanistic contribution of GIP agonism is still debated — GIP antagonism was also proposed as a weight-loss strategy.',
      'Regain after discontinuation appears to follow the same pattern as the GLP-1 class.',
    ],
    regulatory: {
      status: 'approved',
      headline: 'FDA and EMA approved. Prescription only.',
      detail: 'Approved for type 2 diabetes and chronic weight management. Compounded tirzepatide has been the subject of regulatory action as shortages resolved.',
      sport: 'Not currently prohibited by WADA; verify against the current list.',
    },
    reported: {
      route: 'Subcutaneous weekly injection',
      range: 'Approved regimens titrate over months under prescription',
      note: 'Prescription medicine. Dosing decisions belong with a clinician.',
    },
    timeline: [
      { year: 2018, label: 'Dual agonist concept trialled', detail: 'Early-phase work shows the combined receptor approach is viable.', kind: 'clinical' },
      { year: 2021, label: 'SURPASS-2 head-to-head', detail: 'Outperforms semaglutide 1 mg on HbA1c and weight.', kind: 'clinical' },
      { year: 2022, label: 'SURMOUNT-1', detail: 'Roughly 21% mean weight reduction at the top dose.', kind: 'clinical' },
      { year: 2023, label: 'Weight-management approval', detail: 'Approved for chronic weight management.', kind: 'regulatory' },
    ],
    related: ['semaglutide'],
  },

  {
    id: 'cjc-1295',
    name: 'CJC-1295',
    full: 'Growth hormone-releasing hormone analogue',
    aka: ['Modified GRF (1-29)', 'CJC-1295 with DAC', 'Tetrasubstituted GRF'],
    klass: 'GHRH analogue / secretagogue',
    tagline: 'Raises growth hormone in humans — which is a measurement, not an outcome.',
    accent: '#f2b53b',
    accent2: '#7a5a0e',
    systems: ['endocrine', 'metabolic', 'musculoskeletal'],
    goals: ['recovery', 'performance', 'longevity'],
    summary: 'A modified fragment of growth hormone-releasing hormone. The "with DAC" version binds albumin, extending its half-life from minutes to days. It reliably raises circulating GH and IGF-1 in humans; what that translates into clinically is the unanswered question.',
    mechanisms: [
      { id: 'ghrh', title: 'GHRH receptor agonism at the pituitary', detail: 'Stimulates the pituitary to release growth hormone in pulses, preserving the feedback loop rather than overriding it as exogenous GH does.', tier: 'human-trial' },
      { id: 'dac', title: 'Albumin binding (DAC)', detail: 'The drug affinity complex extends half-life to roughly a week, producing a sustained elevation rather than a pulse.', tier: 'human-trial' },
    ],
    claims: [
      { id: 'gh', text: 'Increases growth hormone and IGF-1 levels', tier: 'human-trial', studies: ['cjc-teichman'], note: 'Demonstrated in healthy adults. This is a biomarker result, and it is solid.' },
      { id: 'body-comp', text: 'Improves body composition and recovery', tier: 'mechanistic', studies: [], note: 'Not demonstrated. The inference runs GH → IGF-1 → outcomes, and that chain has repeatedly failed to deliver in healthy adults.' },
      { id: 'anti-aging', text: 'Reverses age-related decline', tier: 'anecdotal', studies: [], note: 'Raising GH in older adults has been studied directly and produced side effects more reliably than benefits.' },
    ],
    studies: [
      {
        id: 'cjc-teichman', title: 'Prolonged stimulation of GH and IGF-I secretion by CJC-1295 in healthy adults', year: 2006,
        journal: 'Journal of Clinical Endocrinology & Metabolism', design: 'Randomised, double-blind, placebo-controlled dose-escalation', tier: 'human-rct',
        n: 43, population: 'Healthy adults aged 21–61',
        finding: 'Single doses produced sustained increases in GH and IGF-I lasting days, with dose-dependent magnitude and good tolerability.',
        limitation: 'A biomarker endpoint over a short period in a small sample. It measured hormone levels, not strength, body composition, injury recovery or anything a buyer cares about.',
        relevance: 0.5, direction: 1, independent: true, search: 'Teichman CJC-1295 GH IGF-I healthy adults JCEM 2006',
      },
      {
        id: 'cjc-gh-elderly', title: 'Growth hormone administration in healthy older adults — systematic review', year: 2007,
        journal: 'Annals of Internal Medicine', design: 'Systematic review and meta-analysis', tier: 'human-rct',
        n: 220, population: 'Healthy elderly adults across 31 trials',
        finding: 'Small increases in lean mass and decreases in fat mass, with no improvement in strength, and higher rates of oedema, arthralgia, gynaecomastia and glucose intolerance.',
        limitation: 'Studied GH itself rather than a secretagogue, but it is the most directly relevant human outcome evidence for the "raise GH to feel younger" thesis — and it points the other way.',
        relevance: 0.4, direction: -1, independent: true, search: 'Liu growth hormone healthy elderly systematic review Annals 2007',
      },
    ],
    uncertainties: [
      'No trial connects the hormone rise to a clinical outcome in healthy people.',
      'Sustained elevation from the DAC version flattens the natural pulsatile GH pattern, and the consequences of that are not characterised.',
      'IGF-1 elevation has a long-discussed theoretical relationship with cancer risk that is unresolved in this context.',
      'A related compound, CJC-1295 without DAC (modified GRF 1-29), is often sold under the same name despite very different pharmacokinetics.',
    ],
    regulatory: {
      status: 'not-approved',
      headline: 'Never approved. Clinical development was discontinued.',
      detail: 'Development was halted after a serious adverse event in a trial of a related indication. Sold today only as a research chemical.',
      sport: 'Prohibited at all times by WADA under S2 (growth hormone releasing factors).',
    },
    reported: {
      route: 'Subcutaneous injection',
      range: 'Community protocols commonly cite 1–2 mg one to three times weekly',
      note: 'Reported for context only. Trial dosing was for a hormone-response study, not for a performance protocol.',
    },
    timeline: [
      { year: 1982, label: 'GHRH sequenced', detail: 'The parent hormone is characterised.', kind: 'discovery' },
      { year: 2005, label: 'DAC technology applied', detail: 'Albumin binding extends half-life from minutes to days.', kind: 'discovery' },
      { year: 2006, label: 'Human hormone-response trial', detail: 'Sustained GH and IGF-1 elevation demonstrated.', kind: 'clinical' },
      { year: 2007, label: 'Development discontinued', detail: 'Clinical programme halted; the compound moves to the grey market.', kind: 'regulatory' },
    ],
    related: ['ipamorelin', 'tesamorelin'],
  },

  {
    id: 'ipamorelin',
    name: 'Ipamorelin',
    full: 'Selective growth hormone secretagogue (ghrelin receptor agonist)',
    aka: ['NNC 26-0161'],
    klass: 'GHS-R1a agonist (pentapeptide)',
    tagline: 'Selective where older secretagogues were not — and it failed the human trial it was actually taken into.',
    accent: '#ffd166',
    accent2: '#7a5a0e',
    systems: ['endocrine', 'gastrointestinal', 'musculoskeletal'],
    goals: ['recovery', 'performance'],
    summary: 'A pentapeptide agonist of the ghrelin receptor that releases growth hormone without the cortisol and prolactin rises seen with earlier secretagogues. Usually paired with a GHRH analogue on the argument that the two mechanisms are complementary.',
    mechanisms: [
      { id: 'ghsr', title: 'Ghrelin receptor agonism', detail: 'Acts at GHS-R1a on pituitary somatotrophs to release GH, by a pathway distinct from GHRH.', tier: 'animal' },
      { id: 'selectivity', title: 'Selectivity profile', detail: 'Preclinical work reports GH release without the ACTH, cortisol and prolactin elevation of earlier compounds such as GHRP-6.', tier: 'animal' },
      { id: 'motility', title: 'Gastrointestinal motility', detail: 'Ghrelin receptor agonism accelerates gastric emptying, which is why it was taken into a postoperative ileus programme.', tier: 'human-rct' },
    ],
    claims: [
      { id: 'gh', text: 'Raises growth hormone selectively', tier: 'animal', studies: ['ipa-raun'], note: 'Well characterised preclinically; the selectivity claim is the compound’s real distinguishing feature.' },
      { id: 'ileus', text: 'Speeds gastrointestinal recovery after surgery', tier: 'human-rct', studies: ['ipa-ileus'], direction: -1, note: 'Contradicted. It was tested properly in humans for this and did not meet its endpoint.' },
      { id: 'physique', text: 'Builds muscle and burns fat', tier: 'anecdotal', studies: [], note: 'No human trial has tested a body-composition endpoint with this compound.' },
    ],
    studies: [
      {
        id: 'ipa-raun', title: 'Ipamorelin, the first selective growth hormone secretagogue', year: 1998,
        journal: 'European Journal of Endocrinology', design: 'Preclinical pharmacology', tier: 'animal',
        n: 0, population: 'Rats and swine; pituitary cell preparations',
        finding: 'Potent, dose-dependent GH release with no significant ACTH or cortisol increase, unlike GHRP-6.',
        limitation: 'Animal and cell pharmacology. Establishes the receptor story, not a clinical effect.',
        direction: 1, independent: true, search: 'Raun ipamorelin selective growth hormone secretagogue 1998',
      },
      {
        id: 'ipa-ileus', title: 'Ipamorelin for postoperative ileus after bowel resection', year: 2014,
        journal: 'Clinical trial programme', design: 'Randomised, double-blind, placebo-controlled Phase II', tier: 'human-rct',
        n: 114, population: 'Adults undergoing partial bowel resection',
        finding: 'Did not achieve a statistically significant improvement on the primary recovery endpoint versus placebo.',
        limitation: 'A negative trial in a specific surgical indication. It is nonetheless the best-designed human test this compound has had, and it should temper enthusiasm rather than be ignored.',
        relevance: 0.5, direction: -1, independent: true, search: 'ipamorelin postoperative ileus randomized placebo controlled trial',
      },
    ],
    uncertainties: [
      'No human study reports a body-composition, strength or recovery outcome.',
      'The combination with a GHRH analogue is a mechanistic argument that has never been tested against either compound alone in a controlled human trial.',
      'Ghrelin receptor agonism increases appetite, which cuts directly against how the compound is usually marketed.',
    ],
    regulatory: {
      status: 'not-approved',
      headline: 'Not approved. Clinical development discontinued after the ileus programme.',
      detail: 'Sold as a research chemical and through some compounding channels, with tightening regulatory attention.',
      sport: 'Prohibited at all times by WADA under S2 (growth hormone secretagogues).',
    },
    reported: {
      route: 'Subcutaneous injection',
      range: 'Community protocols commonly cite 100–300 mcg one to three times daily',
      note: 'Reported for context only. There is no human dose-finding data for the uses it is marketed for.',
    },
    timeline: [
      { year: 1998, label: 'Characterised as selective', detail: 'Distinguished from GHRP-6 by the absence of cortisol and prolactin release.', kind: 'discovery' },
      { year: 2008, label: 'Enters clinical development', detail: 'Taken forward for postoperative ileus rather than for physique or ageing.', kind: 'clinical' },
      { year: 2014, label: 'Phase II misses endpoint', detail: 'The programme does not continue.', kind: 'clinical' },
      { year: 2019, label: 'Stack culture adopts it', detail: 'Becomes half of the ubiquitous CJC-1295 / Ipamorelin pairing.', kind: 'culture' },
    ],
    related: ['cjc-1295', 'tesamorelin'],
  },

  {
    id: 'tesamorelin',
    name: 'Tesamorelin',
    full: 'Stabilised GHRH(1-44) analogue',
    aka: ['Egrifta', 'Growth hormone-releasing hormone analogue', 'GHRH(1-44)'],
    klass: 'GHRH analogue',
    tagline: 'The growth-hormone-axis compound that actually got approved — for one specific population, on one specific endpoint.',
    accent: '#22e07a',
    accent2: '#0b6b3a',
    systems: ['endocrine', 'metabolic', 'cardiovascular'],
    goals: ['metabolic', 'longevity'],
    summary: 'A synthetic GHRH analogue approved to reduce excess visceral abdominal fat in people with HIV-associated lipodystrophy. The most instructive compound on the platform, because it shows how narrow an approval is compared with how a compound gets marketed.',
    mechanisms: [
      { id: 'ghrh', title: 'GHRH receptor agonism', detail: 'Stimulates the pituitary to release growth hormone in its own pulsatile pattern, raising IGF-1 while leaving the feedback loop intact — which is the pharmacological argument for a secretagogue over administering growth hormone directly.', tier: 'human-rct' },
      { id: 'visceral', title: 'Preferential visceral adipose reduction', detail: 'GH-axis activation increases lipolysis, with a measured preference for visceral over subcutaneous fat in this population.', tier: 'human-rct' },
    ],
    claims: [
      { id: 'vat', text: 'Reduces visceral abdominal fat', tier: 'human-rct', studies: ['tesa-falutz', 'tesa-stanley'], note: 'Demonstrated by CT imaging in randomised trials — roughly 15–18% reduction in visceral adipose tissue.' },
      { id: 'liver', text: 'Reduces liver fat', tier: 'human-rct', studies: ['tesa-stanley'], note: 'Shown in people with HIV and non-alcoholic fatty liver disease.' },
      { id: 'general-fatloss', text: 'A fat-loss compound for the general population', tier: 'mechanistic', studies: [], note: 'Not what it was approved for or tested in. The trial population had a specific, drug-induced fat-distribution disorder.' },
    ],
    studies: [
      {
        id: 'tesa-falutz', title: 'Metabolic effects of a growth hormone-releasing factor in patients with HIV', year: 2007,
        journal: 'New England Journal of Medicine', design: 'Randomised, double-blind, placebo-controlled trial', tier: 'human-rct',
        n: 412, population: 'Adults with HIV and excess abdominal fat',
        finding: 'About a 15% reduction in visceral adipose tissue by CT at 26 weeks versus placebo, with improved triglycerides.',
        limitation: 'A specific population with a specific pathology. Gains reverse on discontinuation, and glucose parameters need monitoring.',
        direction: 1, independent: false, search: 'Falutz tesamorelin HIV visceral adiposity NEJM 2007',
      },
      {
        id: 'tesa-stanley', title: 'Effects of tesamorelin on hepatic fat in HIV-associated NAFLD', year: 2019,
        journal: 'The Lancet HIV', design: 'Randomised, double-blind, placebo-controlled trial', tier: 'human-rct',
        n: 61, population: 'Adults with HIV and non-alcoholic fatty liver disease',
        finding: 'Significant reduction in hepatic fat fraction and less fibrosis progression versus placebo over 12 months.',
        limitation: 'Small sample, single population, imaging endpoints rather than clinical liver outcomes.',
        relevance: 0.9, direction: 1, independent: true, search: 'Stanley tesamorelin hepatic fat HIV NAFLD Lancet HIV',
      },
    ],
    uncertainties: [
      'Effects reverse when treatment stops — the visceral fat returns.',
      'Glucose tolerance can worsen; the label carries monitoring requirements.',
      'No trial in people without HIV-associated lipodystrophy supports the general body-composition marketing.',
      'IGF-1 elevation raises the same unresolved long-term theoretical questions as other GH-axis compounds.',
    ],
    regulatory: {
      status: 'approved',
      headline: 'FDA approved (2010) for one indication. Prescription only.',
      detail: 'Approved to reduce excess abdominal fat in HIV-infected patients with lipodystrophy. Any other use is off-label, and the grey-market product sold as tesamorelin is not the approved product.',
      sport: 'Prohibited at all times by WADA under S2.',
    },
    reported: {
      route: 'Daily subcutaneous injection',
      range: 'The approved regimen is 2 mg daily in the licensed indication',
      note: 'Prescription medicine, licensed for a population most readers are not in. Dosing belongs with a prescriber.',
    },
    timeline: [
      { year: 2007, label: 'Pivotal trial published', detail: 'Visceral fat reduction demonstrated in NEJM.', kind: 'clinical' },
      { year: 2010, label: 'FDA approval', detail: 'Approved for HIV-associated lipodystrophy.', kind: 'regulatory' },
      { year: 2019, label: 'Liver fat trial', detail: 'Hepatic fat reduction shown in HIV-associated NAFLD.', kind: 'clinical' },
      { year: 2021, label: 'Off-label spread', detail: 'Adopted into general body-composition marketing well outside the label.', kind: 'culture' },
    ],
    related: ['cjc-1295', 'ipamorelin', 'semaglutide'],
  },

  {
    id: 'semax',
    name: 'Semax',
    full: 'Met-Glu-His-Phe-Pro-Gly-Pro',
    aka: ['ACTH(4-7)-PGP', 'Heptapeptide Semax'],
    klass: 'ACTH fragment analogue (nootropic)',
    tagline: 'Approved and prescribed — in Russia. Which is exactly the evidence-literacy lesson.',
    accent: '#2f9dff',
    accent2: '#0e4a80',
    systems: ['nervous'],
    goals: ['cognition', 'mood'],
    summary: 'A synthetic heptapeptide based on a fragment of adrenocorticotropic hormone with the behavioural activity retained and the hormonal activity removed. Registered as a medicine in Russia for stroke and cognitive indications; essentially unknown to Western regulators.',
    mechanisms: [
      { id: 'bdnf', title: 'BDNF and NGF expression', detail: 'Rodent work reports rapid increases in brain-derived neurotrophic factor expression in the hippocampus.', tier: 'animal' },
      { id: 'monoamine', title: 'Monoaminergic modulation', detail: 'Reported effects on dopaminergic and serotonergic systems, proposed as the route to attention and mood effects.', tier: 'animal' },
      { id: 'neuroprotection', title: 'Ischaemic neuroprotection', detail: 'Reduces infarct size and improves recovery in rodent stroke models.', tier: 'animal' },
    ],
    claims: [
      { id: 'stroke', text: 'Improves outcomes after ischaemic stroke', tier: 'human-trial', studies: ['semax-stroke'], note: 'Supported by Russian clinical literature. Not replicated in Western trials, and the methodology is difficult to audit from outside.' },
      { id: 'cognition', text: 'Enhances focus and memory in healthy people', tier: 'anecdotal', studies: ['semax-bdnf'], note: 'The reason most people take it, and the claim with the least evidence behind it.' },
      { id: 'bdnf', text: 'Increases BDNF', tier: 'animal', studies: ['semax-bdnf'], note: 'Rodent hippocampus. BDNF is a popular biomarker precisely because it is easy to move and hard to connect to outcomes.' },
    ],
    studies: [
      {
        id: 'semax-stroke', title: 'Semax in acute ischaemic stroke — Russian clinical programme', year: 2011,
        journal: 'Zhurnal Nevrologii i Psikhiatrii and related Russian literature', design: 'Controlled clinical trials', tier: 'human-trial',
        n: 110, population: 'Adults with acute ischaemic stroke',
        finding: 'Reported improvements in neurological recovery scores versus standard care.',
        limitation: 'Published predominantly in Russian-language journals with limited independent replication, and registration standards differ. This is the central caveat for the whole compound.',
        relevance: 0.7, direction: 1, independent: false, search: 'Semax ischemic stroke clinical trial neurological recovery',
      },
      {
        id: 'semax-bdnf', title: 'Semax and BDNF/trkB expression in rat hippocampus', year: 2006,
        journal: 'Neuroscience Letters and related preclinical literature', design: 'Animal experiment', tier: 'animal',
        n: 0, population: 'Rats',
        finding: 'Rapid increase in BDNF and trkB expression after intranasal administration.',
        limitation: 'A molecular result in rodents. It does not establish a cognitive effect in humans.',
        direction: 1, independent: true, search: 'Dolotov Semax BDNF trkB rat hippocampus',
      },
    ],
    uncertainties: [
      'The clinical evidence base sits almost entirely in one country’s literature, which limits independent scrutiny — this is a publication-ecosystem problem, not automatically a quality one.',
      'No controlled trial has tested cognitive enhancement in healthy adults.',
      'Intranasal bioavailability and central exposure in humans are poorly characterised in accessible literature.',
    ],
    regulatory: {
      status: 'regional',
      headline: 'Registered medicine in Russia. Not approved in the US, UK or EU.',
      detail: 'Sold in Western markets as a research chemical. Regional approval elsewhere is genuine regulatory context, but different agencies apply different evidentiary standards.',
      sport: 'Falls under WADA S0 as a non-approved substance in most jurisdictions.',
    },
    reported: {
      route: 'Intranasal in most described protocols',
      range: 'Sources commonly cite 300–600 mcg once or twice daily',
      note: 'Reported for context only. Russian clinical dosing was for stroke care under supervision, not for cognitive enhancement.',
    },
    timeline: [
      { year: 1982, label: 'Developed', detail: 'Designed at the Institute of Molecular Genetics in Moscow from the ACTH(4-10) fragment.', kind: 'discovery' },
      { year: 2000, label: 'Registered in Russia', detail: 'Approved for stroke and cognitive indications.', kind: 'regulatory' },
      { year: 2006, label: 'BDNF mechanism reported', detail: 'The finding that anchors most modern marketing.', kind: 'preclinical' },
      { year: 2020, label: 'Nootropic market growth', detail: 'Widely sold online in markets where it has no approval.', kind: 'culture' },
    ],
    related: ['selank'],
  },

  {
    id: 'selank',
    name: 'Selank',
    full: 'Thr-Lys-Pro-Arg-Pro-Gly-Pro',
    aka: ['Tuftsin analogue', 'TP-7'],
    klass: 'Tuftsin analogue (anxiolytic)',
    tagline: 'Studied head-to-head against a benzodiazepine — in a small Russian trial that almost nobody has read.',
    accent: '#d24bff',
    accent2: '#5c0e80',
    systems: ['nervous', 'immune'],
    goals: ['mood', 'cognition'],
    summary: 'A synthetic analogue of the immunomodulatory peptide tuftsin, developed alongside Semax at the same institute and studied for anxiety. Registered in Russia; unapproved elsewhere.',
    mechanisms: [
      { id: 'gaba', title: 'GABAergic modulation', detail: 'Preclinical work reports effects on GABA-A receptor expression and benzodiazepine-receptor-related signalling without the sedation profile.', tier: 'animal' },
      { id: 'enkephalin', title: 'Enkephalinase inhibition', detail: 'Proposed to extend the action of endogenous regulatory peptides by slowing their breakdown.', tier: 'animal' },
      { id: 'bdnf', title: 'BDNF expression', detail: 'Reported increases in hippocampal brain-derived neurotrophic factor in rodents, the same marker Semax is described as moving — and the same caution applies, since BDNF is easy to shift and hard to connect to anything a person would notice.', tier: 'animal' },
    ],
    claims: [
      { id: 'anxiety', text: 'Reduces anxiety comparably to a benzodiazepine, without sedation or dependence', tier: 'human-trial', studies: ['selank-zozulya'], note: 'A genuine comparator trial, but small, Russian-language, and not independently replicated.' },
      { id: 'cognition', text: 'Improves attention and memory', tier: 'animal', studies: ['selank-preclinical'], note: 'Rodent data plus secondary reports within the anxiety trials.' },
      { id: 'no-side-effects', text: 'Has no side effects', tier: 'anecdotal', studies: [], note: 'No compound has no side effects. Absence of reported harm in a 60-person trial is not evidence of safety.' },
    ],
    studies: [
      {
        id: 'selank-zozulya', title: 'Efficacy and safety of Selank in generalised anxiety disorder and neurasthenia', year: 2008,
        journal: 'Zhurnal Nevrologii i Psikhiatrii', design: 'Comparator clinical trial versus medazepam', tier: 'human-trial',
        n: 62, population: 'Adults with generalised anxiety disorder or neurasthenia',
        finding: 'Anxiolytic effect reported as comparable to medazepam, with an additional favourable effect on asthenic symptoms and no withdrawal phenomena.',
        limitation: 'Small, open in design, Russian-language, single-centre, and without independent replication. Every one of those is a reason to hold the result loosely.',
        relevance: 0.85, direction: 1, independent: false, search: 'Zozulya Selank generalized anxiety disorder medazepam trial',
      },
      {
        id: 'selank-preclinical', title: 'Selank in rodent anxiety and memory models', year: 2012,
        journal: 'Preclinical literature', design: 'Animal experiments', tier: 'animal',
        n: 0, population: 'Rats and mice',
        finding: 'Anxiolytic behaviour in elevated plus-maze and related paradigms, with reported BDNF changes.',
        limitation: 'Behavioural models in rodents map imperfectly onto human anxiety disorders.',
        direction: 1, independent: true, search: 'Selank anxiolytic rodent elevated plus maze BDNF',
      },
    ],
    uncertainties: [
      'The entire human evidence base is one small trial ecosystem, unreplicated outside it.',
      'No Western regulatory review has examined the safety data.',
      'The "no dependence" claim rests on short trials; dependence liability is established over longer periods.',
    ],
    regulatory: {
      status: 'regional',
      headline: 'Registered in Russia. Not approved in the US, UK or EU.',
      detail: 'Sold elsewhere as a research chemical with no regulatory review of quality or safety.',
      sport: 'Falls under WADA S0 as a non-approved substance in most jurisdictions.',
    },
    reported: {
      route: 'Intranasal in most described protocols',
      range: 'Sources commonly cite 250–750 mcg once or twice daily',
      note: 'Reported for context only.',
    },
    timeline: [
      { year: 1990, label: 'Developed from tuftsin', detail: 'Designed at the Institute of Molecular Genetics, Moscow.', kind: 'discovery' },
      { year: 2008, label: 'Comparator trial published', detail: 'Compared with medazepam in anxiety.', kind: 'clinical' },
      { year: 2009, label: 'Registered in Russia', detail: 'Approved as an anxiolytic.', kind: 'regulatory' },
      { year: 2021, label: 'Nootropic adoption', detail: 'Widely sold online outside any approval.', kind: 'culture' },
    ],
    related: ['semax'],
  },
];

/**
 * Documented stacks.
 *
 * Stacks get their own record because the evidence question is different: a
 * combination inherits the weakest link in its evidence, plus an interaction
 * question that nobody has studied.
 */
export const STACKS = [
  {
    id: 'klow',
    name: 'KLOW Stack',
    full: 'GHK-Cu + BPC-157 + TB-500 + KPV',
    klass: 'Combination protocol',
    tagline: 'Four compounds, one marketing name, and zero studies of the combination.',
    accent: '#d4af37',
    accent2: '#7a5a0e',
    members: ['ghk-cu', 'bpc-157', 'tb-500', 'kpv'],
    systems: ['integumentary', 'musculoskeletal', 'gastrointestinal', 'immune'],
    goals: ['recovery', 'skin-hair', 'gut-health'],
    summary: 'A blend marketed as a full-spectrum healing protocol: copper peptide for skin and collagen, BPC-157 and TB-500 for tissue repair, KPV for inflammation. The rationale is that the mechanisms are complementary.',
    rationale: 'Each component targets a different stage or tissue of the repair cascade — angiogenesis, cell migration, matrix synthesis and inflammatory tone — so the argument is that combining them covers more of the process than any one alone.',
    evidenceNote: 'The combination has never been studied. Its confidence is therefore bounded by its weakest member and reduced further by an unstudied interaction surface: four unapproved compounds, no pharmacokinetic data for any pairing, and no safety data for the set.',
    uncertainties: [
      'No study of the four together, in any species.',
      'Three of the four have no published human efficacy trial at all.',
      'Combining compounds multiplies product-quality risk, since each vial is an independent chance of a mislabelled or contaminated product.',
      'Attributing an outcome to a four-compound stack is impossible even for the person taking it.',
    ],
  },
  {
    id: 'cjc-ipamorelin',
    name: 'CJC-1295 / Ipamorelin',
    full: 'GHRH analogue + ghrelin receptor agonist',
    klass: 'Combination protocol',
    tagline: 'The most common stack in the growth-hormone corner, built on a mechanism argument rather than a trial.',
    accent: '#f2b53b',
    accent2: '#7a5a0e',
    members: ['cjc-1295', 'ipamorelin'],
    systems: ['endocrine', 'metabolic', 'musculoskeletal'],
    goals: ['recovery', 'performance', 'longevity'],
    summary: 'Pairs a GHRH analogue with a ghrelin receptor agonist on the argument that hitting two distinct pituitary pathways produces a larger, more physiological GH pulse than either alone.',
    rationale: 'GHRH raises the amplitude of GH pulses; a ghrelin receptor agonist adds a separate release signal and suppresses somatostatin tone. Two levers on the same output.',
    evidenceNote: 'The synergy argument is pharmacologically reasonable and completely untested in a controlled human trial. Neither component has a human outcome study for the uses this stack is sold for.',
    uncertainties: [
      'No controlled human comparison of the combination against either compound alone.',
      'No human outcome endpoint — only hormone levels.',
      'Both compounds are prohibited in sport at all times.',
    ],
  },
];

/** Every peptide keyed by id. */
const BY_ID = new Map(PEPTIDES.map((entry) => [entry.id, entry]));
/** Every stack keyed by id. */
const STACK_BY_ID = new Map(STACKS.map((entry) => [entry.id, entry]));

/**
 * Look up a peptide.
 *
 * @param {string} id Peptide identifier.
 * @returns {object|null} The record, or null.
 */
export function findPeptide(id) {
  return BY_ID.get(id) || null;
}

/**
 * Look up a stack.
 *
 * @param {string} id Stack identifier.
 * @returns {object|null} The record, or null.
 */
export function findStack(id) {
  return STACK_BY_ID.get(id) || null;
}

/**
 * Look up a compound or a stack by id.
 *
 * @param {string} id Identifier.
 * @returns {object|null} The record, or null.
 */
export function findAny(id) {
  return findPeptide(id) || findStack(id);
}

/**
 * Every study in the corpus, tagged with the peptide it belongs to.
 *
 * @returns {Array<object>} Flattened studies.
 */
export function allStudies() {
  return PEPTIDES.flatMap((peptide) => peptide.studies.map((study) => ({ ...study, peptide: peptide.id, peptideName: peptide.name })));
}

/**
 * Every claim in the corpus, tagged with its peptide.
 *
 * @returns {Array<object>} Flattened claims.
 */
export function allClaims() {
  return PEPTIDES.flatMap((peptide) => peptide.claims.map((claim) => ({ ...claim, peptide: peptide.id, peptideName: peptide.name })));
}

/**
 * Resolve a claim's study ids into study records.
 *
 * @param {object} peptide The peptide the claim belongs to.
 * @param {object} claim The claim.
 * @returns {Array<object>} The cited studies.
 */
export function claimStudies(peptide, claim) {
  const ids = new Set(claim.studies || []);
  return peptide.studies.filter((study) => ids.has(study.id));
}

/**
 * Count the corpus.
 *
 * @returns {{ peptides: number, stacks: number, studies: number, claims: number, mechanisms: number }} Totals.
 */
export function corpusSize() {
  return {
    peptides: PEPTIDES.length,
    stacks: STACKS.length,
    studies: allStudies().length,
    claims: allClaims().length,
    mechanisms: PEPTIDES.reduce((sum, peptide) => sum + peptide.mechanisms.length, 0),
  };
}

/**
 * Build a PubMed search URL for a study.
 *
 * The corpus stores a query rather than a link so a reader always lands on the
 * live literature rather than on a URL that may have rotted.
 *
 * @param {object} study A study record.
 * @returns {string} A PubMed search URL.
 */
export function pubmedUrl(study) {
  return `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(study.search || study.title)}`;
}
