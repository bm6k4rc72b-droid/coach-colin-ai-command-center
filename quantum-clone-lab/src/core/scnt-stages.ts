/**
 * The physical stages inside an SCNT (cloning) facility, in order, with what each room/step does
 * and the key detail a student should take away. Descriptive and educational only. Pure.
 */
export interface Stage {
  id: string;
  room: string;
  title: string;
  what: string;
  detail: string;
  /** Canvas scene key for the micromanipulation view. */
  scene: 'collect' | 'enucleate' | 'inject' | 'fuse' | 'culture' | 'transfer' | 'birth';
}

export const STAGES: Stage[] = [
  {
    id: 'oocytes',
    room: 'Oocyte room',
    title: 'Collect and mature the eggs',
    what: 'Immature eggs (oocytes) are recovered from ovaries — often from a slaughterhouse for livestock — and matured in an incubator to metaphase II.',
    detail: 'The egg supplies the cytoplasm that will do the reprogramming, and all of the clone\'s mitochondria. A mature MII oocyte has its own chromosomes lined up on a spindle, ready to be removed.',
    scene: 'collect',
  },
  {
    id: 'donor',
    room: 'Cell-culture room',
    title: 'Grow the donor cells',
    what: 'A small skin biopsy from the animal to be cloned is grown into a dish of fibroblasts. Serum starvation arrests them in the quiet G0/G1 phase.',
    detail: 'Keith Campbell\'s insight for Dolly: a quiescent donor nucleus is far easier for the egg to reprogram. This single choice is the difference between frequent failure and occasional success.',
    scene: 'collect',
  },
  {
    id: 'enucleate',
    room: 'Micromanipulation suite',
    title: 'Enucleate the oocyte',
    what: 'Under a microscope with hydraulic micromanipulators, a holding pipette steadies the egg while a fine glass pipette aspirates out its chromosomes.',
    detail: 'Polarised light (Oosight) or a brief Hoechst stain locates the metaphase plate. Remove too much cytoplasm and the egg dies; leave the chromosomes behind and the clone is not a clone.',
    scene: 'enucleate',
  },
  {
    id: 'transfer',
    room: 'Micromanipulation suite',
    title: 'Insert the donor cell',
    what: 'The whole donor cell (or its isolated nucleus) is slipped through the same slit in the zona pellucida, tucked against the enucleated egg.',
    detail: 'The reconstructed "embryo" is now an egg cytoplasm next to an adult nucleus — a combination nature never makes. Nothing has started yet.',
    scene: 'inject',
  },
  {
    id: 'fuse',
    room: 'Fusion & activation bench',
    title: 'Fuse and activate',
    what: 'A short DC electric pulse fuses the two cells into one, and electrical + chemical activation (e.g. ionomycin then 6-DMAP) makes the egg behave as if fertilised.',
    detail: 'An HDAC inhibitor such as trichostatin A may be added to loosen the chromatin and help the egg rewrite the nucleus\'s epigenetic marks. Reprogramming — switching off adult genes and switching on embryonic ones — is the true bottleneck of cloning.',
    scene: 'fuse',
  },
  {
    id: 'culture',
    room: 'Incubator',
    title: 'Culture to blastocyst',
    what: 'The reconstructed embryo is cultured at 38.5 °C in low oxygen for about 5–7 days. Most arrest; a minority reach the blastocyst stage.',
    detail: 'Embryos that divide but reprogram badly stall early. Imprinting errors here set up the placental problems and "large offspring syndrome" seen later.',
    scene: 'culture',
  },
  {
    id: 'embryotransfer',
    room: 'Surrogate suite',
    title: 'Transfer to a surrogate',
    what: 'Blastocysts are transferred into the uterus of a hormonally synchronised surrogate mother of the same species.',
    detail: 'The surrogate\'s cycle must match the embryo\'s age. Several embryos are usually transferred because so few will implant and survive.',
    scene: 'transfer',
  },
  {
    id: 'birth',
    room: 'Nursery',
    title: 'Pregnancy and birth',
    what: 'A rare pregnancy is monitored closely; cloned fetuses have high rates of oversized placentas and late loss. A survivor is delivered, often by C-section.',
    detail: 'The newborn is genetically identical in nuclear DNA to the donor, but is a baby, not a copy of the adult — it carries the egg donor\'s mitochondria and will develop its own markings, health and personality.',
    scene: 'birth',
  },
];
