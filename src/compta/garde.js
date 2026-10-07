// LabFlow Compta — garde d'écriture PAR COMPTABILITÉ (SPEC-SOCLE D4, étape S3b). Les routes /api/compta sortent de la
// garde globale de src/app.js, qui juge le mode de l'abonnement de la PERSONNE : ici, le mode appliqué est celui de
// l'abonnement du TITULAIRE de la comptabilité visée. Ainsi le comptable d'un client en retard ne voit que cette
// comptabilité en lecture seule, et un cabinet bloqué garde les comptabilités que ses clients lui ont confiées.
// Chaque route d'écriture de /api/compta appelle exigerEcriture (ou figure dans ECRITURES_SANS_GARDE, routes.js).

// Codes et messages repris de requireWriteAccess (src/middleware/auth.js) ; « bloqué » reste affiché sur place par les
// écrans de LabFlow Compta (code BLOCKED).
const REFUS = {
  read_only: { code: 'READ_ONLY', message: 'Comptabilité en lecture seule : l\'abonnement de son titulaire attend un paiement' },
  desactive: { code: 'SUSPENDED', message: 'Comptabilité suspendue : l\'abonnement de son titulaire est suspendu' },
  archive: { code: 'SUSPENDED', message: 'Comptabilité suspendue : l\'abonnement de son titulaire est suspendu' },
  bloque: { code: 'BLOCKED', message: 'Comptabilité bloquée : l\'abonnement de son titulaire est bloqué' },
};

const erreurEcriture = (mode) => {
  const r = REFUS[mode];
  return r ? Object.assign(new Error(r.message), { statusCode: 403, code: r.code }) : null;
};

// Mode du dernier abonnement du titulaire d'une comptabilité (« actif » sans abonnement, comme authenticate).
const modeTitulaire = async (db, espaceId) => {
  const r = await db.query(
    `SELECT a.mode_compte
       FROM compta.espaces e
       JOIN abonnements a ON a.client_id = e.titulaire_id
      WHERE e.id = $1
      ORDER BY a.id DESC
      LIMIT 1`,
    [espaceId]
  );
  return r.rows[0]?.mode_compte || 'actif';
};

// Lève l'erreur 403 (READ_ONLY, SUSPENDED, BLOCKED) si la comptabilité n'est pas modifiable.
const exigerEcriture = async (db, espaceId) => {
  const e = erreurEcriture(await modeTitulaire(db, espaceId));
  if (e) throw e;
};

// Présentation de l'état d'une comptabilité selon le mode de son titulaire : actif, lecture_seule, bloque, suspendu.
const etatAbonnement = (mode) => (mode === 'read_only' ? 'lecture_seule' : mode === 'bloque' ? 'bloque' : REFUS[mode] ? 'suspendu' : 'actif');

module.exports = { REFUS, erreurEcriture, modeTitulaire, exigerEcriture, etatAbonnement };
