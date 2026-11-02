#!/usr/bin/env python3
"""Build the VIGIL enterprise proposal PDF (by Colin Cook) from public/vigil/data/catalog.json.

    python3 scripts/vigil-proposal.py

Writes public/vigil/VIGIL-Proposal-Colin-Cook.pdf. Needs reportlab.
"""
import json
import os
from datetime import date

from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table,
                                TableStyle, PageBreak, NextPageTemplate, KeepTogether, Flowable)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAT = json.load(open(os.path.join(ROOT, 'public/vigil/data/catalog.json')))
OUT = os.path.join(ROOT, 'public/vigil/VIGIL-Proposal-Colin-Cook.pdf')

F = '/usr/share/fonts/truetype/'
pdfmetrics.registerFont(TTFont('Serif', F + 'liberation/LiberationSerif-Regular.ttf'))
pdfmetrics.registerFont(TTFont('Serif-I', F + 'liberation/LiberationSerif-Italic.ttf'))
pdfmetrics.registerFont(TTFont('Serif-B', F + 'liberation/LiberationSerif-Bold.ttf'))
pdfmetrics.registerFont(TTFont('Sans', F + 'dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('Sans-B', F + 'dejavu/DejaVuSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('Mono', F + 'dejavu/DejaVuSansMono.ttf'))

ONYX, ONYX2 = HexColor('#0b0b0d'), HexColor('#16161a')
GOLD, GOLDHI, GOLDLO = HexColor('#c9a96e'), HexColor('#e8d3a6'), HexColor('#8a7247')
IVORY, INK, MUTE, RULE = HexColor('#f4eee2'), HexColor('#1b1915'), HexColor('#6f6a60'), HexColor('#e3dccb')
PAPER = HexColor('#fbf8f2')
W, H = letter
M = 54


def money(n):
    return '${:,.2f}'.format(n)


sections = [(s, sum(i['price'] for i in s['items'])) for s in CAT['sections']]
TOTAL = sum(t for _, t in sections)
cents = round(TOTAL * 100)
MONTHLY = (cents // 12) / 100
FIRST = (cents - (cents // 12) * 11) / 100

# ─────────────────────────────────────────── styles
S = {
    'h1': ParagraphStyle('h1', fontName='Serif', fontSize=34, leading=38, textColor=INK, spaceAfter=6),
    'eyebrow': ParagraphStyle('eb', fontName='Sans', fontSize=7.5, leading=10, textColor=GOLDLO, spaceAfter=8),
    'h2': ParagraphStyle('h2', fontName='Serif', fontSize=19, leading=23, textColor=INK, spaceBefore=12, spaceAfter=6),
    'body': ParagraphStyle('b', fontName='Sans', fontSize=9.4, leading=14.2, textColor=INK, spaceAfter=7),
    'lead': ParagraphStyle('l', fontName='Serif-I', fontSize=15, leading=20, textColor=INK, spaceAfter=10),
    'small': ParagraphStyle('s', fontName='Sans', fontSize=7.8, leading=10.8, textColor=MUTE),
    'cell': ParagraphStyle('c', fontName='Sans', fontSize=7.6, leading=10.2, textColor=INK),
    'cellb': ParagraphStyle('cb', fontName='Sans-B', fontSize=8, leading=10.6, textColor=INK),
    'mono': ParagraphStyle('m', fontName='Mono', fontSize=6.9, leading=9.6, textColor=GOLDLO),
    'bullet': ParagraphStyle('bl', fontName='Sans', fontSize=9.2, leading=13.6, textColor=INK, leftIndent=12, bulletIndent=0, spaceAfter=4),
}


def eyebrow(t):
    return Paragraph('&nbsp;&nbsp;&nbsp;'.join(' '.join(w) for w in t.upper().split()), S['eyebrow'])


# ─────────────────────────────────────────── page painters
def cover(c, doc):
    c.saveState()
    c.setFillColor(ONYX); c.rect(0, 0, W, H, fill=1, stroke=0)
    # soft gold glow
    for i in range(40):
        c.setFillColor(HexColor('#c9a96e')); c.setFillAlpha(0.006)
        c.circle(W * 0.78, H * 0.86, 30 + i * 9, fill=1, stroke=0)
    c.setFillAlpha(1)
    # thin frame
    c.setStrokeColor(GOLDLO); c.setLineWidth(0.5); c.rect(28, 28, W - 56, H - 56)
    # crest
    cx, cy = W / 2, H * 0.66
    c.setStrokeColor(GOLD); c.setLineWidth(1.2); c.circle(cx, cy, 34)
    c.setLineWidth(1.6); p = c.beginPath(); p.moveTo(cx - 15, cy + 12); p.lineTo(cx, cy - 16); p.lineTo(cx + 15, cy + 12); c.drawPath(p)
    c.setFillColor(IVORY); c.setFont('Serif', 74)
    word = 'V I G I L'; c.drawCentredString(cx, H * 0.50, word)
    c.setFillColor(GOLD); c.setFont('Sans', 8.5); c.drawCentredString(cx, H * 0.465, 'E L D E R   C A R E   I N T E L L I G E N C E')
    c.setStrokeColor(GOLD); c.setLineWidth(0.6); c.line(cx - 40, H * 0.44, cx + 40, H * 0.44)
    c.setFillColor(IVORY); c.setFont('Serif-I', 19); c.drawCentredString(cx, H * 0.40, 'Always watching over. Never watching you.')
    c.setFont('Sans', 9); c.setFillColor(HexColor('#bdb6a6'))
    c.drawCentredString(cx, H * 0.30, 'ENTERPRISE PROPOSAL  ·  AI FALL DETECTION & PRIVATE MONITORING')
    c.drawCentredString(cx, H * 0.30 - 16, 'for care communities and at-home care')
    c.setFillColor(GOLDHI); c.setFont('Serif', 15); c.drawCentredString(cx, H * 0.17, 'Prepared by Colin Cook')
    c.setFillColor(HexColor('#8d877b')); c.setFont('Sans', 8)
    c.drawCentredString(cx, H * 0.17 - 16, date.today().strftime('%B %Y') + '  ·  Confidential')
    c.restoreState()


def page(c, doc):
    c.saveState()
    c.setFillColor(PAPER); c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(ONYX); c.rect(0, H - 30, W, 30, fill=1, stroke=0)
    c.setFillColor(GOLD); c.setFont('Serif', 11); c.drawString(M, H - 19.5, 'V I G I L')
    c.setFillColor(HexColor('#a39c8d')); c.setFont('Sans', 7); c.drawRightString(W - M, H - 18.5, 'ENTERPRISE PROPOSAL  ·  COLIN COOK')
    c.setStrokeColor(RULE); c.setLineWidth(0.5); c.line(M, 40, W - M, 40)
    c.setFillColor(MUTE); c.setFont('Sans', 7)
    c.drawString(M, 28, 'Confidential · prepared for the client named on the cover · prices in USD, valid 30 days')
    c.drawRightString(W - M, 28, str(doc.page))
    c.restoreState()


# ─────────────────────────────────────────── flowables
class Architecture(Flowable):
    """Sensors → edge box → AI verifier → cloud → people, drawn in gold on onyx."""

    def __init__(self, w, h=210):
        super().__init__(); self.w, self.h = w, h

    def wrap(self, *a):
        return self.w, self.h

    def draw(self):
        c = self.canv
        c.setFillColor(ONYX); c.roundRect(0, 0, self.w, self.h, 10, fill=1, stroke=0)
        cols = [
            ('IN THE ROOM', ['PoE cameras', 'mmWave radar', 'Wearable SOS', 'Mic (no recording)']),
            ('EDGE BOX', ['YOLO11-pose', 'ByteTrack IDs', 'ST-GCN fall model', 'Skeleton-only out']),
            ('AI SECOND LOOK', ['VLM verifier', 'Sensor fusion', 'False-alarm filter', 'Audit log']),
            ('VIGIL CLOUD', ['Escalation engine', 'Resident records', 'EHR / nurse call', 'Analytics']),
            ('PEOPLE', ['Caregiver app', 'Voice concierge', 'Family app', 'Command center']),
        ]
        n = len(cols); gap = 12; bw = (self.w - 28 - gap * (n - 1)) / n; top = self.h - 26
        for i, (title, items) in enumerate(cols):
            x = 14 + i * (bw + gap)
            c.setFillColor(GOLD); c.setFont('Sans-B', 6.6); c.drawString(x + 2, top, title)
            for j, it in enumerate(items):
                y = top - 22 - j * 36
                c.setStrokeColor(GOLDLO); c.setLineWidth(0.6); c.setFillColor(ONYX2)
                c.roundRect(x, y - 10, bw, 26, 5, fill=1, stroke=1)
                c.setFillColor(IVORY); c.setFont('Sans', 7.2); c.drawCentredString(x + bw / 2, y + 0.5, it)
            if i < n - 1:
                ax = x + bw + 1; ay = top - 70
                c.setStrokeColor(GOLD); c.setLineWidth(1); c.line(ax, ay, ax + gap - 2, ay)
                c.line(ax + gap - 5, ay + 3, ax + gap - 2, ay); c.line(ax + gap - 5, ay - 3, ax + gap - 2, ay)
        c.setFillColor(HexColor('#a39c8d')); c.setFont('Sans', 6.8)
        c.drawCentredString(self.w / 2, 9, 'Raw video stays in the building. Only events, skeletons and (with consent) blurred clips reach the cloud.')


def stat_row(items, width):
    cells = [[Paragraph(f'<font name="Serif" size="24" color="#8a7247">{b}</font><br/><font size="7.4" color="#6f6a60">{s}</font>', S['cell']) for b, s in items]]
    t = Table(cells, colWidths=[width / len(items)] * len(items))
    t.setStyle(TableStyle([('LINEABOVE', (0, 0), (-1, 0), 0.6, GOLD), ('TOPPADDING', (0, 0), (-1, -1), 10), ('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    return t


def quote_table(width):
    """The headline price sheet, laid out like a classic itemised quote."""
    rows, style = [], [
        ('FONT', (0, 0), (-1, -1), 'Sans', 8.3), ('TEXTCOLOR', (0, 0), (-1, -1), INK),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'), ('TOPPADDING', (0, 0), (-1, -1), 2.9), ('BOTTOMPADDING', (0, 0), (-1, -1), 2.9),
        ('LEFTPADDING', (0, 0), (-1, -1), 8), ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]
    rows.append([CAT['title'], '']); style += [('FONT', (0, 0), (-1, 0), 'Sans', 7.6), ('TEXTCOLOR', (0, 0), (-1, 0), MUTE)]
    for s, tot in sections:
        r = len(rows); rows.append([s['name'], money(tot)])
        style += [('FONT', (0, r), (-1, r), 'Sans-B', 8.8), ('LINEBELOW', (0, r), (-1, r), 0.9, GOLDLO), ('BACKGROUND', (0, r), (-1, r), HexColor('#f1ead9'))]
        for it in s['items']:
            r = len(rows); rows.append([it['name'], money(it['price'])])
            style += [('LINEBELOW', (0, r), (-1, r), 0.3, RULE)]
    r = len(rows); rows.append(['Total for 12 months', money(TOTAL)])
    style += [('FONT', (0, r), (-1, r), 'Serif-B', 13), ('LINEABOVE', (0, r), (-1, r), 1.2, INK), ('TOPPADDING', (0, r), (-1, r), 9)]
    r = len(rows); rows.append([f'Paid monthly at {money(MONTHLY)} (first payment {money(FIRST)})', ''])
    style += [('FONT', (0, r), (-1, r), 'Sans', 7.8), ('TEXTCOLOR', (0, r), (-1, r), MUTE)]
    t = Table(rows, colWidths=[width - 110, 110], repeatRows=0)
    t.setStyle(TableStyle(style))
    return t


def detail_table(section, width):
    hs = ParagraphStyle('hd', parent=S['cellb'], textColor=GOLDHI)
    head = [Paragraph(h, hs) for h in ('FEATURE &amp; PRICE', 'TECH YOU NEED', 'AI YOU NEED', 'GITHUB / OPEN SOURCE')]
    rows = [head]
    for it in section['items']:
        repos = '<br/>'.join(it['repos']) if it['repos'] else '<font color="#6f6a60">service line</font>'
        rows.append([
            Paragraph(f'<b>{it["name"]}</b><br/><font color="#8a7247">{money(it["price"])}</font><br/><font size="7" color="#6f6a60">{it["what"]}</font>', S['cell']),
            Paragraph(it['tech'], S['cell']), Paragraph(it['ai'], S['cell']), Paragraph(repos, S['mono'])])
    cw = [width * 0.30, width * 0.24, width * 0.26, width * 0.20]
    t = Table(rows, colWidths=cw, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), ONYX), ('TEXTCOLOR', (0, 0), (-1, 0), IVORY),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LINEBELOW', (0, 1), (-1, -1), 0.3, RULE),
        ('TOPPADDING', (0, 0), (-1, -1), 4.5), ('BOTTOMPADDING', (0, 0), (-1, -1), 4.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 5), ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    return t


def bullets(items):
    return [Paragraph(t, S['bullet'], bulletText='◆') for t in items]


# ─────────────────────────────────────────── story
doc = BaseDocTemplate(OUT, pagesize=letter, leftMargin=M, rightMargin=M, topMargin=58, bottomMargin=54,
                      title='VIGIL — Enterprise Proposal', author='Colin Cook', subject='AI fall detection and private monitoring for elder care')
fw = W - 2 * M
doc.addPageTemplates([
    PageTemplate(id='cover', frames=[Frame(0, 0, W, H, id='c')], onPage=cover),
    PageTemplate(id='page', frames=[Frame(M, 54, fw, H - 58 - 54, id='p')], onPage=page),
])

st = [NextPageTemplate('page'), PageBreak()]

# 1 · letter + summary
st += [eyebrow('Executive summary'), Paragraph('Dignity first. <i>Seconds, not hours.</i>', S['h1']),
       Paragraph('A fall that nobody sees is the moment elder care fails. VIGIL is one AI platform that watches over every suite and every home without watching anyone: it sees skeletons, not faces; uses radar where cameras never belong; and gets the nearest caregiver to the bedside in minutes.', S['lead']),
       Spacer(1, 4),
       stat_row([('1 in 4', 'adults 65+ report a fall each year (CDC)'), ('~3M', 'older adults treated in EDs for falls yearly (CDC)'),
                 ('< 3 s', 'VIGIL target: fall to alert'), ('< 4 min', 'VIGIL target: alert to bedside')], fw),
       Spacer(1, 14),
       Paragraph('This proposal covers a complete 12-month enterprise deployment for <b>' + CAT['client'] + '</b>: the platform, the AI, the hardware lease, security and compliance, training and a dedicated engineering team. Every line item names the technology, the AI models and the open-source GitHub projects it is built on, so your team knows exactly what it is paying for and nothing is a black box.', S['body']),
       Paragraph('What changes on day one', S['h2'])]
st += bullets([
    '<b>Unwitnessed falls become witnessed.</b> Pose-based vision and bathroom radar confirm a fall in under three seconds and page the closest free caregiver.',
    '<b>Night rounds get smarter, not more frequent.</b> Radar confirms breathing and presence in every room, so staff wake residents only when it matters.',
    '<b>Decline is caught early.</b> Each resident\'s daily rhythm (sleep, bathroom visits, gait speed) is learned; changes are flagged days before a crisis.',
    '<b>Families feel close.</b> A private family app, weekly wellbeing letters and instant video calls after any incident.',
    '<b>Paperwork writes itself.</b> AI drafts the state-compliant incident report from the event log for a nurse to review and sign.',
])

# 2 · how it works
st += [PageBreak(), eyebrow('How it works'), Paragraph('From the room to the right person.', S['h1']), Spacer(1, 6), Architecture(fw), Spacer(1, 14),
       Paragraph('Privacy by design', S['h2'])]
st += bullets([
    '<b>Skeleton-only by default.</b> The edge box turns video into 17 body keypoints and discards the frame. No facial recognition anywhere in the system.',
    '<b>No cameras in bathrooms.</b> 60 GHz mmWave radar detects falls, presence and breathing without an image.',
    '<b>Consent per resident and roommate,</b> with privacy schedules (e.g. camera off during care and dressing) and a full audit log of who viewed what.',
    '<b>HIPAA-ready:</b> BAA-backed hosting, encryption at rest and in transit, SSO and MFA, SOC 2 readiness in year one.',
])
st += [Paragraph('The response ladder', S['h2'])]
ladder = [['+0 s', 'Edge AI confirms fall posture'], ['+2 s', 'AI verifier second look'], ['+4 s', 'Nearest caregiver paged (critical push + badge)'],
          ['+6 s', 'Voice concierge: "Are you alright?"'], ['+1 min', 'Charge nurse if unacknowledged'], ['+3 min', 'Family + on-call manager'], ['+5 min', '911 if no responder on scene']]
lt = Table(ladder, colWidths=[60, fw - 60])
lt.setStyle(TableStyle([('FONT', (0, 0), (0, -1), 'Mono', 8.4), ('TEXTCOLOR', (0, 0), (0, -1), GOLDLO), ('FONT', (1, 0), (1, -1), 'Sans', 9),
                        ('LINEBELOW', (0, 0), (-1, -1), 0.3, RULE), ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4)]))
st += [lt]

# 3 · investment
st += [PageBreak(), eyebrow('Investment'), Paragraph('One platform. <i>Every residence. Every home.</i>', S['h1']), quote_table(fw)]

# 4+ · detail per section
for i, (s, tot) in enumerate(sections):
    st += [PageBreak(),
           eyebrow(f'Build sheet {i + 1} of {len(sections)}'),
           Paragraph(f'{s["name"]} <font color="#8a7247">· {money(tot)}</font>', S['h2']), detail_table(s, fw)]

# business
st += [PageBreak(), eyebrow('Running VIGIL as an enterprise'), Paragraph('How the business works.', S['h1']),
       Paragraph('Who pays', S['h2'])]
st += bullets([
    '<b>Care communities</b> (assisted living, memory care, skilled nursing): per-bed SaaS at <b>$45-79 per bed per month</b> on 3-year terms, plus a one-time build and integration fee for large operators (this proposal).',
    '<b>Home-care agencies:</b> white-label VIGIL for their clients; remote eyes between visits.',
    '<b>Families direct:</b> a <b>$699 home kit</b> (edge hub, 2 radars, 1 camera, SOS wearable) plus <b>$129-249 per month</b> (self-monitored up to 24/7 concierge response).',
    '<b>Payers:</b> Medicaid waiver programs and some Medicare Advantage plans cover personal emergency response; long-term-care insurers value documented fall prevention.',
])
econ = [['', 'Facility bed', 'At-home plan'], ['Price / month', '$59', '$189'], ['Cost to serve / month', '$14', '$41'], ['Gross margin', '76%', '78%'],
        ['Example: 540 beds + 250 homes', '$31,860 MRR', '$47,250 MRR'], ['Combined annual recurring revenue', '$949,320 ARR', '']]
et = Table(econ, colWidths=[fw * 0.46, fw * 0.27, fw * 0.27])
et.setStyle(TableStyle([('FONT', (0, 0), (-1, -1), 'Sans', 8.8), ('FONT', (0, 0), (-1, 0), 'Sans-B', 8.6), ('BACKGROUND', (0, 0), (-1, 0), HexColor('#f1ead9')),
                        ('FONT', (0, -1), (-1, -1), 'Sans-B', 9), ('TEXTCOLOR', (1, -1), (1, -1), GOLDLO), ('SPAN', (1, -1), (2, -1)),
                        ('LINEBELOW', (0, 0), (-1, -1), 0.3, RULE), ('ALIGN', (1, 0), (-1, -1), 'RIGHT'), ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5)]))
st += [Paragraph('Unit economics', S['h2']), et, Spacer(1, 6),
       Paragraph('Cost to serve includes cloud, AI usage, hardware amortisation and a share of the 24/7 response desk. The home kit costs about $310 to build.', S['small']),
       Paragraph('What must be right before launch', S['h2'])]
st += bullets([
    '<b>Consent and state law.</b> Several states regulate electronic monitoring in resident rooms (for example Texas, Illinois, Oklahoma, Washington, Virginia): written consent from the resident or legal representative and any roommate, posted notice, and rules on access to footage.',
    '<b>HIPAA.</b> VIGIL acts as a business associate: BAAs with every customer and sub-processor, a documented risk assessment, breach procedures.',
    '<b>Claims.</b> Market as safety and wellness monitoring that alerts people, not as a diagnostic medical device. Have a regulatory attorney review all marketing claims.',
    '<b>Measured accuracy.</b> Publish recall, false alarms per room-week and time-to-alert from your own pilots.',
    '<b>Insurance:</b> technology E&amp;O, cyber liability and general liability before the first install.',
])
plan = [['Days 0-30', 'Entity, insurance, BAA templates. Edge box running Frigate + YOLO11-pose + radar fusion. Recruit one friendly community for a free 10-suite pilot.'],
        ['Days 30-60', 'Pilot live with consent packs. Label every event; tune until false alarms < 1 per room per week. Ship the caregiver app.'],
        ['Days 60-90', 'Turn pilot numbers into a case study (time to bedside, falls with injury, night-round hours saved). Launch the home kit to 25 families.'],
        ['Days 90-120', 'Sell to regional operators (5-20 communities) through state assisted-living associations; partner with two home-care agencies.']]
pt = Table([[Paragraph(f'<b>{a}</b>', S['cell']), Paragraph(b, S['cell'])] for a, b in plan], colWidths=[72, fw - 72])
pt.setStyle(TableStyle([('LINEBELOW', (0, 0), (-1, -1), 0.3, RULE), ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5)]))
st += [KeepTogether([Paragraph('The first 120 days', S['h2']), pt]), Paragraph('Core team', S['h2']),
       Paragraph('Founder (sales, brand, operator relationships) · full-stack engineer · ML / edge engineer · installer and field technician · clinical advisor (RN, director of nursing) · part-time compliance lead. The 24/7 response desk can start with a UL-listed monitoring partner.', S['body'])]

# close
st += [PageBreak(), eyebrow('Next steps'), Paragraph('Let\'s begin with ten suites.', S['h1']),
       Paragraph('We start with a 60-day paid pilot in ten suites at one community, priced at cost and credited in full against this agreement. If VIGIL does not cut time-to-bedside in half against your current baseline, you walk away.', S['lead'])]
st += bullets(['Week 1: site walk, consent packs, network survey.', 'Week 2: install edge box, radars and cameras; train night staff.',
               'Weeks 3-8: live pilot with weekly scorecards.', 'Week 9: go / no-go and portfolio rollout schedule.'])
st += [Spacer(1, 30)]
sig = Table([['', ''], ['Colin Cook · Founder, VIGIL', 'Client signature · Title · Date']], colWidths=[fw / 2 - 10, fw / 2 - 10], spaceBefore=20)
sig.setStyle(TableStyle([('LINEABOVE', (0, 1), (0, 1), 0.6, INK), ('LINEABOVE', (1, 1), (1, 1), 0.6, INK), ('FONT', (0, 0), (-1, -1), 'Sans', 8.4),
                         ('TEXTCOLOR', (0, 0), (-1, -1), MUTE), ('TOPPADDING', (0, 0), (-1, 0), 30), ('RIGHTPADDING', (0, 0), (0, -1), 20)]))
st += [sig, Spacer(1, 40),
       Paragraph('Live demo console: bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/vigil/', S['small']),
       Paragraph('Resident names, facilities and outcomes in the demo are fictional. Statistics marked CDC are from the U.S. Centers for Disease Control and Prevention. Accuracy and response figures are design targets to be validated in the pilot.', S['small'])]

doc.build(st)
print('wrote', OUT, 'total', money(TOTAL), 'monthly', money(MONTHLY), 'first', money(FIRST))
