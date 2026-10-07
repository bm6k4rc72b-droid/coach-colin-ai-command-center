// Curated, bone-level muscle attachments.
//
// Only textbook-standard origins and insertions are listed (Gray's Anatomy;
// Moore, Clinically Oriented Anatomy), and only where both the muscle and the
// bone exist as BodyParts3D meshes. Names are side-less "base" names; the
// build resolves them to the piece on the same side as the muscle (or to the
// midline bone). Anything not listed here is simply shown without
// attachments: the app never infers one.

export interface AttachmentRule {
  origin: string[];
  insertion: string[];
}

const ribs = (...n: string[]) => n.map((x) => `${x} rib`);
const cervical = (...n: string[]) => n.map((x) => `${x} cervical vertebra`);
const thoracic = (...n: string[]) => n.map((x) => `${x} thoracic vertebra`);
const lumbar = (...n: string[]) => n.map((x) => `${x} lumbar vertebra`);
const toes = (phalanx: string, ...n: string[]) => n.map((x) => `${phalanx} phalanx of ${x}`);

export const ATTACHMENTS: Record<string, AttachmentRule> = {
  // Shoulder and arm
  'long head of biceps brachii': { origin: ['scapula'], insertion: ['radius'] },
  'short head of biceps brachii': { origin: ['scapula'], insertion: ['radius'] },
  brachialis: { origin: ['humerus'], insertion: ['ulna'] },
  coracobrachialis: { origin: ['scapula'], insertion: ['humerus'] },
  'long head of triceps brachii': { origin: ['scapula'], insertion: ['ulna'] },
  'lateral head of triceps brachii': { origin: ['humerus'], insertion: ['ulna'] },
  'medial head of triceps brachii': { origin: ['humerus'], insertion: ['ulna'] },
  anconeus: { origin: ['humerus'], insertion: ['ulna'] },
  'clavicular part of deltoid': { origin: ['clavicle'], insertion: ['humerus'] },
  'acromial part of deltoid': { origin: ['scapula'], insertion: ['humerus'] },
  'spinal part of deltoid': { origin: ['scapula'], insertion: ['humerus'] },
  supraspinatus: { origin: ['scapula'], insertion: ['humerus'] },
  'infraspinatus muscle': { origin: ['scapula'], insertion: ['humerus'] },
  'teres minor': { origin: ['scapula'], insertion: ['humerus'] },
  'teres major': { origin: ['scapula'], insertion: ['humerus'] },
  subscapularis: { origin: ['scapula'], insertion: ['humerus'] },
  'latissimus dorsi': { origin: ['hip bone'], insertion: ['humerus'] },
  'clavicular part of pectoralis major': { origin: ['clavicle'], insertion: ['humerus'] },
  'sternocostal part of pectoralis major': {
    origin: ['manubrium', 'body of sternum'],
    insertion: ['humerus'],
  },
  'abdominal part of pectoralis major': { origin: [], insertion: ['humerus'] },
  'pectoralis minor': { origin: ribs('third', 'fourth', 'fifth'), insertion: ['scapula'] },
  'serratus anterior': {
    origin: ribs('first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'),
    insertion: ['scapula'],
  },
  subclavius: { origin: ribs('first'), insertion: ['clavicle'] },
  'levator scapulae': { origin: ['atlas', 'axis', ...cervical('third', 'fourth')], insertion: ['scapula'] },
  'rhomboid major': { origin: thoracic('second', 'third', 'fourth', 'fifth'), insertion: ['scapula'] },
  'rhomboid minor': { origin: [...cervical('seventh'), ...thoracic('first')], insertion: ['scapula'] },
  'descending part of trapezius': { origin: ['occipital bone'], insertion: ['clavicle'] },
  'transverse part of trapezius': {
    origin: [...cervical('seventh'), ...thoracic('first', 'second', 'third')],
    insertion: ['scapula'],
  },
  'ascending part of trapezius': {
    origin: thoracic('fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'),
    insertion: ['scapula'],
  },

  // Forearm and hand
  brachioradialis: { origin: ['humerus'], insertion: ['radius'] },
  'humeral head of pronator teres': { origin: ['humerus'], insertion: ['radius'] },
  'ulnar head of pronator teres': { origin: ['ulna'], insertion: ['radius'] },
  supinator: { origin: ['humerus', 'ulna'], insertion: ['radius'] },
  'pronator quadratus': { origin: ['ulna'], insertion: ['radius'] },
  'flexor carpi radialis': { origin: ['humerus'], insertion: ['second metacarpal bone', 'third metacarpal bone'] },
  'humeral head of flexor carpi ulnaris': {
    origin: ['humerus'],
    insertion: ['pisiform', 'hamate', 'fifth metacarpal bone'],
  },
  'ulnar head of flexor carpi ulnaris': {
    origin: ['ulna'],
    insertion: ['pisiform', 'hamate', 'fifth metacarpal bone'],
  },
  'extensor carpi radialis longus': { origin: ['humerus'], insertion: ['second metacarpal bone'] },
  'extensor carpi radialis brevis': { origin: ['humerus'], insertion: ['third metacarpal bone'] },
  'humeral head of extensor carpi ulnaris': { origin: ['humerus'], insertion: ['fifth metacarpal bone'] },
  'ulnar head of extensor carpi ulnaris': { origin: ['ulna'], insertion: ['fifth metacarpal bone'] },
  'flexor pollicis longus': { origin: ['radius'], insertion: ['distal phalanx of thumb'] },
  'extensor pollicis longus': { origin: ['ulna'], insertion: ['distal phalanx of thumb'] },
  'extensor pollicis brevis': { origin: ['radius'], insertion: ['proximal phalanx of thumb'] },
  'abductor pollicis longus': { origin: ['radius', 'ulna'], insertion: ['first metacarpal bone'] },
  'flexor digitorum profundus': {
    origin: ['ulna'],
    insertion: [
      'distal phalanx of index finger',
      'distal phalanx of middle finger',
      'distal phalanx of ring finger',
      'distal phalanx of little finger',
    ],
  },
  'opponens pollicis': { origin: ['trapezium'], insertion: ['first metacarpal bone'] },
  'opponens digiti minimi of hand': { origin: ['hamate'], insertion: ['fifth metacarpal bone'] },

  // Hip and thigh
  'rectus femoris': { origin: ['hip bone'], insertion: ['patella', 'tibia'] },
  'vastus lateralis': { origin: ['femur'], insertion: ['patella', 'tibia'] },
  'vastus medialis': { origin: ['femur'], insertion: ['patella', 'tibia'] },
  'vastus intermedius': { origin: ['femur'], insertion: ['patella', 'tibia'] },
  sartorius: { origin: ['hip bone'], insertion: ['tibia'] },
  gracilis: { origin: ['hip bone'], insertion: ['tibia'] },
  'tensor fasciae latae': { origin: ['hip bone'], insertion: [] },
  'adductor longus': { origin: ['hip bone'], insertion: ['femur'] },
  'adductor brevis': { origin: ['hip bone'], insertion: ['femur'] },
  'adductor magnus': { origin: ['hip bone'], insertion: ['femur'] },
  pectineus: { origin: ['hip bone'], insertion: ['femur'] },
  semitendinosus: { origin: ['hip bone'], insertion: ['tibia'] },
  semimembranosus: { origin: ['hip bone'], insertion: ['tibia'] },
  'long head of biceps femoris': { origin: ['hip bone'], insertion: ['fibula'] },
  'short head of biceps femoris': { origin: ['femur'], insertion: ['fibula'] },
  'gluteus maximus': { origin: ['hip bone', 'sacrum'], insertion: ['femur'] },
  'gluteus medius': { origin: ['hip bone'], insertion: ['femur'] },
  'gluteus minimus': { origin: ['hip bone'], insertion: ['femur'] },
  iliacus: { origin: ['hip bone'], insertion: ['femur'] },
  'psoas major': {
    origin: [...thoracic('twelfth'), ...lumbar('first', 'second', 'third', 'fourth', 'fifth')],
    insertion: ['femur'],
  },
  piriformis: { origin: ['sacrum'], insertion: ['femur'] },
  'obturator internus': { origin: ['hip bone'], insertion: ['femur'] },
  'obturator externus': { origin: ['hip bone'], insertion: ['femur'] },
  'quadratus femoris': { origin: ['hip bone'], insertion: ['femur'] },
  'gemellus superior': { origin: ['hip bone'], insertion: ['femur'] },
  'gemellus inferior': { origin: ['hip bone'], insertion: ['femur'] },

  // Leg and foot
  'medial head of gastrocnemius': { origin: ['femur'], insertion: ['calcaneus'] },
  'lateral head of gastrocnemius': { origin: ['femur'], insertion: ['calcaneus'] },
  soleus: { origin: ['tibia', 'fibula'], insertion: ['calcaneus'] },
  plantaris: { origin: ['femur'], insertion: ['calcaneus'] },
  popliteus: { origin: ['femur'], insertion: ['tibia'] },
  'tibialis anterior': { origin: ['tibia'], insertion: ['medial cuneiform bone', 'first metatarsal bone'] },
  'tibialis posterior': { origin: ['tibia', 'fibula'], insertion: ['navicular bone of foot'] },
  'fibularis longus': { origin: ['fibula'], insertion: ['medial cuneiform bone', 'first metatarsal bone'] },
  'fibularis brevis': { origin: ['fibula'], insertion: ['fifth metatarsal bone'] },
  'fibularis tertius': { origin: ['fibula'], insertion: ['fifth metatarsal bone'] },
  'extensor hallucis longus': { origin: ['fibula'], insertion: ['distal phalanx of big toe'] },
  'flexor hallucis longus': { origin: ['fibula'], insertion: ['distal phalanx of big toe'] },
  'extensor digitorum longus': {
    origin: ['tibia', 'fibula'],
    insertion: toes('distal', 'second toe', 'third toe', 'fourth toe', 'little toe'),
  },
  'flexor digitorum longus': {
    origin: ['tibia'],
    insertion: toes('distal', 'second toe', 'third toe', 'fourth toe', 'little toe'),
  },
  'abductor hallucis': { origin: ['calcaneus'], insertion: ['proximal phalanx of big toe'] },
  'flexor digitorum brevis': {
    origin: ['calcaneus'],
    insertion: toes('middle', 'second toe', 'third toe', 'fourth toe', 'little toe'),
  },

  // Head and neck
  sternocleidomastoid: { origin: ['manubrium', 'clavicle'], insertion: ['temporal bone', 'occipital bone'] },
  'superficial part of masseter': { origin: ['maxilla', 'zygomatic bone'], insertion: ['mandible'] },
  'deep part of masseter': { origin: ['zygomatic bone', 'temporal bone'], insertion: ['mandible'] },
  temporalis: {
    origin: ['temporal bone', 'parietal bone', 'frontal bone', 'sphenoid bone'],
    insertion: ['mandible'],
  },
  'medial pterygoid': { origin: ['sphenoid bone', 'palatine bone', 'maxilla'], insertion: ['mandible'] },
  'upper head of lateral pterygoid': { origin: ['sphenoid bone'], insertion: ['mandible'] },
  'lower head of lateral pterygoid': { origin: ['sphenoid bone'], insertion: ['mandible'] },
  mylohyoid: { origin: ['mandible'], insertion: ['hyoid bone'] },
  geniohyoid: { origin: ['mandible'], insertion: ['hyoid bone'] },
  stylohyoid: { origin: ['temporal bone'], insertion: ['hyoid bone'] },
  'anterior belly of digastric': { origin: ['mandible'], insertion: [] },
  'posterior belly of digastric': { origin: ['temporal bone'], insertion: [] },
  thyrohyoid: { origin: ['thyroid cartilage'], insertion: ['hyoid bone'] },
  sternohyoid: { origin: ['manubrium'], insertion: ['hyoid bone'] },
  sternothyroid: { origin: ['manubrium'], insertion: ['thyroid cartilage'] },
  omohyoid: { origin: ['scapula'], insertion: ['hyoid bone'] },
  'scalenus anterior': { origin: cervical('third', 'fourth', 'fifth', 'sixth'), insertion: ribs('first') },
  'scalenus medius': { origin: ['axis', ...cervical('third', 'fourth', 'fifth', 'sixth', 'seventh')], insertion: ribs('first') },
  'scalenus posterior': { origin: cervical('fourth', 'fifth', 'sixth'), insertion: ribs('second') },
  'splenius capitis': { origin: [], insertion: ['temporal bone', 'occipital bone'] },
  'semispinalis capitis': { origin: [], insertion: ['occipital bone'] },
  'rectus capitis posterior major': { origin: ['axis'], insertion: ['occipital bone'] },
  'rectus capitis posterior minor': { origin: ['atlas'], insertion: ['occipital bone'] },
  'rectus capitis anterior': { origin: ['atlas'], insertion: ['occipital bone'] },
  'rectus capitis lateralis': { origin: ['atlas'], insertion: ['occipital bone'] },
  'obliquus capitis inferior': { origin: ['axis'], insertion: ['atlas'] },
  'obliquus capitis superior': { origin: ['atlas'], insertion: ['occipital bone'] },

  // Trunk
  'rectus abdominis': {
    origin: ['hip bone'],
    insertion: ['xiphoid process', 'fifth costal cartilage', 'sixth costal cartilage', 'seventh costal cartilage'],
  },
  'external oblique': {
    origin: ribs('fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'),
    insertion: ['hip bone'],
  },
  'internal oblique': { origin: ['hip bone'], insertion: ribs('tenth', 'eleventh', 'twelfth') },
  'transversus abdominis': { origin: ['hip bone'], insertion: [] },
  pyramidalis: { origin: ['hip bone'], insertion: [] },
  'quadratus lumborum': {
    origin: ['hip bone'],
    insertion: [...ribs('twelfth'), ...lumbar('first', 'second', 'third', 'fourth')],
  },
  diaphragm: {
    origin: ['xiphoid process', 'seventh costal cartilage', ...lumbar('first', 'second', 'third')],
    insertion: [],
  },
  'serratus posterior superior': { origin: [], insertion: ribs('second', 'third', 'fourth', 'fifth') },
  'serratus posterior inferior': { origin: [], insertion: ribs('ninth', 'tenth', 'eleventh', 'twelfth') },
  coccygeus: { origin: ['hip bone'], insertion: ['sacrum'] },
};
