// LabFlow Compta, étape S4b « Le dossier du client LabFlow » (labflow-reprise/achats-compta/PLAN-S4.md §1, §4 ;
// réponse 3 du client du 07/10) : le dossier « Mon entreprise » d'un client LabFlow est créé d'office, à partir de son
// identité LabFlow (profil_entreprise), dès que sa comptabilité est ouverte — à l'activation du module
// (moduleClient.basculer) ; la migration 209 l'a fait pour les comptabilités déjà ouvertes. Copie au moment de la
// création ; ensuite le dossier vit dans LabFlow Compta (« Reprendre l'identité de LabFlow » recopie à la demande :
// dossiers.reprendreIdentite). Une identité incomplète donne un dossier « à compléter », jamais un refus.
const { journaliser } = require('./journal');
const { regimeParForme, anneeCivile, creerExercice, lireIdentiteClient } = require('./dossiers');

// Crée le dossier « Mon entreprise » de la comptabilité s'il n'existe pas encore (source « labflow »), avec son premier
// exercice (année civile en cours) et ses périodes mensuelles ; journal. Dans la transaction de l'appelant.
// → { id, cree }.
const assurerDossierLabflow = async (db, { espaceId, clientId: clientBrut, auteurId }) => {
  // L'identifiant du client arrive parfois en texte (paramètre d'adresse de l'admin) : nombre dans le journal.
  const clientId = Number(clientBrut);
  const existe = await db.query(`SELECT id FROM compta.dossiers WHERE espace_id = $1 AND source = 'labflow' LIMIT 1`, [espaceId]);
  if (existe.rows.length) return { id: existe.rows[0].id, cree: false };
  const v = await lireIdentiteClient(db, clientId);
  const regime = regimeParForme(v.forme_juridique);
  const ins = await db.query(
    `INSERT INTO compta.dossiers (espace_id, nom, cree_par, personne, impot, tva, source, client_labflow_id,
                                  raison_sociale, nom_commercial, forme_juridique, matricule_fiscal, rne, adresse, ville, representant_nom, representant_qualite)
     VALUES ($1, $2, $3, $4, $5, 'reel', 'labflow', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING id, nom, matricule_fiscal`,
    [
      espaceId, (v.nom_commercial || v.raison_sociale).slice(0, 255), auteurId ?? null, regime.personne, regime.impot, clientId,
      v.raison_sociale, v.nom_commercial, v.forme_juridique, v.matricule_fiscal, v.rne, v.adresse, v.ville, v.representant_nom, v.representant_qualite,
    ]
  );
  const d = ins.rows[0];
  const exercice = anneeCivile();
  const ex = await creerExercice(db, d.id, exercice);
  await journaliser(db, espaceId, auteurId, 'dossier_cree', { dossier: d.id, nom: d.nom, matricule: d.matricule_fiscal, source: 'labflow', client: clientId });
  await journaliser(db, espaceId, auteurId, 'exercice_cree', { dossier: d.id, exercice: ex.id, debut: exercice.debut, fin: exercice.fin });
  return { id: d.id, cree: true };
};

module.exports = { assurerDossierLabflow };
