-- 202 — LabFlow Compta, étape S2b « le cabinet comptable » (labflow-reprise/achats-compta/SPEC-SOCLE.md, D1, D6-D10,
-- D16 ; PLAN-S2.md). Migration additive : aucun compte existant ne change (produit « labflow », module inactif,
-- 0 gérant comptable, paiements sans lignes, tarifs Compta à 0 DT tant que l'admin ne les a pas saisis).

-- 1) Rôle « comptable » (D1) : une personne qui n'utilise que LabFlow Compta. Contrainte refaite sur le modèle de la 178.
ALTER TABLE utilisateurs DROP CONSTRAINT IF EXISTS utilisateurs_role_check;
ALTER TABLE utilisateurs ADD CONSTRAINT utilisateurs_role_check
  CHECK ((role)::text = ANY ((ARRAY['super_admin','client','gerant','acheteur','boss','comptable'])::text[]));

-- 2) Adresses sans casse (D1) : index unique sur LOWER(email), seulement si la base n'a aucun doublon de casse (sinon
--    un avis, jamais un échec). La connexion compare désormais sans la casse.
DO $m202$
DECLARE
  n INTEGER;
BEGIN
  SELECT COUNT(*) INTO n FROM (
    SELECT LOWER(email) FROM utilisateurs GROUP BY LOWER(email) HAVING COUNT(*) > 1
  ) d;
  IF n = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS utilisateurs_email_lower_key ON utilisateurs (LOWER(email));
  ELSE
    RAISE NOTICE '[202] % adresse(s) en double à la casse près : index utilisateurs_email_lower_key NON créé', n;
  END IF;
END $m202$;

-- 3) Produit de l'abonnement (D6) : « labflow » (tous les comptes existants) ou « compta » (cabinet comptable).
ALTER TABLE abonnements ADD COLUMN IF NOT EXISTS produit VARCHAR(10) NOT NULL DEFAULT 'labflow';
ALTER TABLE abonnements DROP CONSTRAINT IF EXISTS abonnements_produit_check;
ALTER TABLE abonnements ADD CONSTRAINT abonnements_produit_check CHECK (produit IN ('labflow', 'compta'));

-- 4) Postes LabFlow Compta de la configuration (D6, D7) : module chez un client Stock / Vente (étape S2c) ; gérants
--    comptables (client : en plus du comptable compris ; cabinet : gérants achetés).
ALTER TABLE abonnement_config ADD COLUMN IF NOT EXISTS module_compta_actif BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE abonnement_config ADD COLUMN IF NOT EXISTS module_compta_active_le TIMESTAMPTZ;
ALTER TABLE abonnement_config ADD COLUMN IF NOT EXISTS nb_gerants_compta INTEGER NOT NULL DEFAULT 0;
ALTER TABLE abonnement_config DROP CONSTRAINT IF EXISTS abonnement_config_nb_gerants_compta_check;
ALTER TABLE abonnement_config ADD CONSTRAINT abonnement_config_nb_gerants_compta_check CHECK (nb_gerants_compta >= 0);

-- 5) Postes figés sur la mensualité (D8) : remplis seulement quand un poste Compta existe ; NULL = facture d'avant.
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS lignes JSONB;

-- 6) Les 5 tarifs de LabFlow Compta (D7), grille générale seulement (non surchargeables par domaine), saisis par
--    l'admin dans l'écran des tarifs ; 0 DT au départ (création d'un cabinet refusée tant que son tarif vaut 0).
INSERT INTO tarifs_config (cle, valeur_dt, description) VALUES
  ('compta_cabinet_mensuel', 0, 'LabFlow Compta seul — abonnement mensuel d''un cabinet comptable, titulaire compris (DT/mois)'),
  ('compta_gerant_cabinet_mensuel', 0, 'LabFlow Compta seul — gérant de cabinet (DT/mois par gérant)'),
  ('compta_mise_en_route', 0, 'LabFlow Compta seul — frais de mise en route d''un cabinet (DT, une fois)'),
  ('compta_module_mensuel', 0, 'Module Comptabilité d''un client Stock / Vente, son comptable compris (DT/mois)'),
  ('compta_gerant_client_mensuel', 0, 'Module Comptabilité — gérant comptable supplémentaire d''un client (DT/mois par gérant)')
ON CONFLICT (cle) DO NOTHING;

-- 7) Demande d'activation du module par un client (étape S2c).
ALTER TABLE demandes DROP CONSTRAINT IF EXISTS demandes_type_demande_check;
ALTER TABLE demandes ADD CONSTRAINT demandes_type_demande_check
  CHECK (type_demande IN (
    'gerant_sup',
    'labo_sup',
    'upgrade_entreprise',
    'activer_module_vente',
    'activer_module_acheteurs',
    'passer_formule_premium',
    'activer_module_compta'
  ));

-- 8) Schéma « compta » (SPEC-SOCLE §0, §3.2) : les comptabilités (espaces), qui y accède (acces), le journal (evenements).
CREATE SCHEMA IF NOT EXISTS compta;

-- Une comptabilité : le cabinet d'un comptable, ou la comptabilité d'un client LabFlow (S2c). Son titulaire ne peut pas
-- être supprimé tant qu'elle existe (D10 : RESTRICT ; la suppression d'un cabinet sans dossier la retire d'abord).
CREATE TABLE IF NOT EXISTS compta.espaces (
  id           SERIAL PRIMARY KEY,
  type         VARCHAR(20) NOT NULL CHECK (type IN ('cabinet', 'client_labflow')),
  titulaire_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE RESTRICT,
  nom          VARCHAR(200) NOT NULL,
  etat         VARCHAR(10) NOT NULL DEFAULT 'actif' CHECK (etat IN ('actif', 'ferme')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (type, titulaire_id)
);

-- Un accès : une personne (vide tant que l'adresse n'est pas renseignée) dans une comptabilité. L'accès « obligatoire »
-- (comptable d'un client LabFlow) n'est jamais supprimé, seulement réattribué ; supprimer une personne vide ses accès
-- (SET NULL) sans les effacer.
CREATE TABLE IF NOT EXISTS compta.acces (
  id             SERIAL PRIMARY KEY,
  espace_id      INTEGER NOT NULL REFERENCES compta.espaces(id) ON DELETE CASCADE,
  personne_id    INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  role           VARCHAR(10) NOT NULL CHECK (role IN ('titulaire', 'gerant')),
  niveau         VARCHAR(12) NOT NULL DEFAULT 'complet' CHECK (niveau IN ('consultation', 'saisie', 'complet')),
  tous_dossiers  BOOLEAN NOT NULL DEFAULT true,
  obligatoire    BOOLEAN NOT NULL DEFAULT false,
  etat           VARCHAR(12) NOT NULL DEFAULT 'actif' CHECK (etat IN ('a_attribuer', 'actif', 'desactive')),
  nom_attendu    VARCHAR(100),
  email_attendu  VARCHAR(255),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (espace_id, personne_id)
);
CREATE INDEX IF NOT EXISTS idx_compta_acces_personne ON compta.acces (personne_id);

-- Journal (D16) : qui a fait quoi, quand (horodatage du serveur). Il survit à la suppression d'un compte.
CREATE TABLE IF NOT EXISTS compta.evenements (
  id         BIGSERIAL PRIMARY KEY,
  espace_id  INTEGER REFERENCES compta.espaces(id) ON DELETE SET NULL,
  auteur_id  INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  type       VARCHAR(40) NOT NULL,
  details    JSONB NOT NULL DEFAULT '{}'::jsonb,
  cree_le    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_compta_evenements_espace ON compta.evenements (espace_id, cree_le);

-- 9) Manuel de LabFlow Compta : fiches des deux pages du cabinet (vocabulaire comptable fixe, jamais balisées).
WITH fiche (slug, titre, icone, ordre, contenu, mots_cles, ecran) AS (VALUES
  ('compta-cabinet', 'Mon cabinet', '🏢', 1010, $f202a$## 🏢 Mon cabinet

Cette page présente votre cabinet tel que LabFlow le connaît. Vous la trouvez dans le menu de gauche, entrée **Mon cabinet**.

### Ce que vous voyez

- **Identité** : raison sociale, forme juridique, matricule fiscal, RNE, adresse et représentant légal. C'est l'identité qui figure sur vos factures d'abonnement.
- **Contact** : le nom, l'adresse email et le téléphone du titulaire du compte.
- **Gérants** : le nombre de comptes gérants prévus dans votre abonnement, pour vos collaborateurs.

### Points d'attention

:::attention
Votre identité est enregistrée par l'équipe LabFlow. Pour la corriger, contactez-la : la modification s'appliquera aux factures suivantes, jamais à celles déjà émises.
:::$f202a$, 'cabinet, identité, matricule fiscal, raison sociale, contact, gérants', '/cabinet'),
  ('compta-abonnement', 'Abonnement et factures', '💳', 1020, $f202b$## 💳 Abonnement et factures

Cette page récapitule votre abonnement à LabFlow Compta et réunit vos factures. Vous la trouvez dans le menu de gauche, entrée **Abonnement et factures**.

### Ce que vous voyez

- **État du compte** : actif, en lecture seule, suspendu ou archivé.
- **Votre abonnement** : le détail de la mensualité poste par poste (abonnement mensuel du cabinet, gérants supplémentaires) et le **total mensuel**. Une promotion en cours apparaît avec sa période.
- **Frais de mise en route** : leur montant et leur état (payés, en attente…).
- **Vos mensualités** : chaque mois, son montant et son état. Une mensualité réglée a sa **facture** à télécharger en PDF.

### Actions pas à pas

1. **Télécharger une facture** : dans la liste des mensualités, cliquez sur **Facture** en face d'un mois réglé ; le PDF s'enregistre sur votre appareil.
2. **Changer le nombre de gérants** : contactez l'équipe LabFlow ; le nouveau montant s'applique à partir du mois suivant.

### Points d'attention

:::attention
La facture d'un mois réglé ne change plus : elle garde l'identité et le détail du moment de son règlement.
:::$f202b$, 'abonnement, facture, factures, mensualité, paiement, promotion, mise en route, gérants', '/abonnement')
)
INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant, actif, produit)
SELECT f.slug, f.titre, f.icone, 'LabFlow Compta', f.ordre, f.contenu, f.contenu, f.mots_cles, f.ecran, false, true, 'compta'
  FROM fiche f
ON CONFLICT (slug) DO NOTHING;
