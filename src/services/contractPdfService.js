/**
 * contractPdfService — documents contractuels « PDF rempli » (contrat / avenant / résiliation).
 *
 * Génère, PAR CLIENT, le PDF déjà rempli de ses vraies valeurs et pré-signé du
 * prestataire (builders de docuseal-templates/generate.js, previewMode:false —
 * la balise {{Signature;type=signature}} est posée). Le document part ensuite via
 * docusealService.createSubmissionFromPdf : DocuSeal ne recueille que la signature
 * du client, aucun template à entretenir dans son interface.
 *
 * Tous les montants affichés sont TTC, comme partout dans l'app (la facture ventile).
 */
const {
  buildContrat,
  buildAvenant,
  buildResiliation,
  checkPrestatairePlaceholders,
} = require('../../docuseal-templates/generate');

const fmtDT = (n) => `${Math.round(Number(n) || 0)} DT`;
const fmtDateFr = (d) =>
  new Date(d || Date.now()).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

// Référence lisible et stable : préfixe + année + id (l'id garantit l'unicité, l'année situe l'acte).
const refFor = (prefix, id, when) =>
  `${prefix}-${new Date(when || Date.now()).getFullYear()}-${String(id || 0).padStart(5, '0')}`;

const clientBlock = ({ nom, email, telephone, adresse } = {}) => ({
  nom: nom || 'Client',
  email: email || undefined,
  tel: telephone || undefined,
  adresse: adresse || undefined,
});

// Détail des conditions promotionnelles — même formulation que le flux template
// (buildContractPricingFields) pour une lecture identique quel que soit le canal.
const promoDetailOf = (p) => {
  if (!p || !p.hasPromo) return null;
  const parts = [];
  if (p.promoOb) {
    parts.push(p.effOnboarding === 0
      ? `Frais d'activation offerts (au lieu de ${fmtDT(p.baseOnboarding)})`
      : `Frais d'activation : ${fmtDT(p.effOnboarding)} au lieu de ${fmtDT(p.baseOnboarding)}`);
  }
  if (p.promoMens) {
    let m = p.effMensuel === 0
      ? `Mensualité offerte (au lieu de ${fmtDT(p.baseMensuel)})`
      : `Mensualité : ${fmtDT(p.effMensuel)} au lieu de ${fmtDT(p.baseMensuel)}`;
    if (p.promoMonths) m += ` pendant ${p.promoMonths} mois`;
    if (p.baseResumeDate) m += `, puis ${fmtDT(p.baseMensuel)} à partir du ${fmtDateFr(p.baseResumeDate)}`;
    parts.push(m);
  }
  return parts.join('  ·  ');
};

const generate = async (builder, data) => {
  checkPrestatairePlaceholders(); // warn — ou throw si FACTURE_STRICT=1
  const buffer = await builder(null, { ...data, previewMode: false }); // outPath null → Buffer
  return buffer.toString('base64');
};

// « +1 activité   ·   +2 comptes gérants » — partagé entre le PDF rempli et les
// champs du flux template (avenantExtraFields).
const ajoutTextOf = (ajouts = {}) => {
  const plur = (n, sing, plu) => `+${n} ${n > 1 ? plu : sing}`;
  const parts = [];
  if (ajouts.addActivites) parts.push(plur(ajouts.addActivites, 'activité', 'activités'));
  if (ajouts.addLabos) parts.push(plur(ajouts.addLabos, 'laboratoire', 'laboratoires'));
  if (ajouts.addGerants) parts.push(plur(ajouts.addGerants, 'compte gérant', 'comptes gérants'));
  return parts.join('   ·   ');
};

// Champs additionnels de l'avenant pour le flux TEMPLATE Docuseal (« Capacité
// ajoutée », « Contrat initial »). Sans risque : createSubmission retire de
// lui-même les champs absents du template (retry 422).
const avenantExtraFields = ({ ajouts = {}, abonnementId = null, abonnementDate = null } = {}) => {
  const fields = [];
  const ajout = ajoutTextOf(ajouts);
  if (ajout) fields.push({ name: 'Capacité ajoutée', default_value: ajout });
  if (abonnementId) {
    fields.push({
      name: 'Contrat initial',
      default_value: `${refFor('CTR', abonnementId, abonnementDate)} du ${fmtDateFr(abonnementDate)}`,
    });
  }
  return fields;
};

/**
 * Contrat d'abonnement. `pricing` = résultat de computeEffectivePricing (requis).
 * `config` = { nbActivites, nbLabos, nbGerants } ; `montantOnboarding` = repli si
 * le pricing ne porte pas d'onboarding.
 */
const buildContratDocument = async ({ abonnementId, client, config = {}, pricing, montantOnboarding = null }) => {
  if (!pricing) throw new Error('détail tarifaire indisponible pour le contrat');
  const ref = refFor('CTR', abonnementId);
  const onboarding = pricing.effOnboarding ?? montantOnboarding;
  const base64 = await generate(buildContrat, {
    ref,
    date: fmtDateFr(),
    client: clientBlock(client),
    config: {
      activites: config.nbActivites ?? 1,
      labos: config.nbLabos ?? 0,
      gerants: config.nbGerants ?? 0,
    },
    pricing: {
      onboarding: onboarding != null ? fmtDT(onboarding) : undefined,
      mensuel: fmtDT(pricing.effMensuel),
      mensuelBase: fmtDT(pricing.baseMensuel),
      promoDetail: promoDetailOf(pricing) || undefined,
    },
  });
  return { base64, ref, documentName: `Contrat d'abonnement LabFlow — ${ref}` };
};

/**
 * Avenant (demande de capacité). `pricing` = résultat de computeAvenantPricing
 * (nouvelle config totale + nouvelle mensualité). `ajouts` = { addActivites,
 * addLabos, addGerants } ; le contrat initial est visé via abonnementId/Date.
 */
const buildAvenantDocument = async ({ demandeId, client, pricing, ajouts = {}, abonnementId = null, abonnementDate = null }) => {
  if (!pricing) throw new Error("détail tarifaire indisponible pour l'avenant");
  const ref = refFor('AVN', demandeId);
  const base64 = await generate(buildAvenant, {
    ref,
    date: fmtDateFr(),
    contratRef: abonnementId ? refFor('CTR', abonnementId, abonnementDate) : undefined,
    contratDate: abonnementDate ? fmtDateFr(abonnementDate) : undefined,
    client: clientBlock(client),
    ajout: ajoutTextOf(ajouts) || undefined,
    config: {
      activites: pricing.nbActivites,
      labos: pricing.nbLabos,
      gerants: pricing.nbGerants,
    },
    pricing: { mensuel: fmtDT(pricing.effMensuel), mensuelBase: fmtDT(pricing.baseMensuel) },
  });
  return { base64, ref, documentName: `Avenant au contrat LabFlow — ${ref}` };
};

/** Résiliation — envoyée après suppression du compte, pour archive/formalité. */
const buildResiliationDocument = async ({ clientId, client }) => {
  const ref = refFor('RES', clientId);
  const base64 = await generate(buildResiliation, {
    ref,
    date: fmtDateFr(),
    client: clientBlock(client),
  });
  return { base64, ref, documentName: `Résiliation de contrat LabFlow — ${ref}` };
};

module.exports = { buildContratDocument, buildAvenantDocument, buildResiliationDocument, avenantExtraFields };
