-- 253 — Module « Livreurs », étape L3 « livrer avec son téléphone » (labflow-reprise/livreurs/PLAN-LIVREURS.md, L2 acceptée
-- le 20/10/2026). Le livreur valide une livraison avec la facture signée / cachetée (photo ou PDF obligatoire), ou la
-- déclare non livrée (motif + note obligatoires, marchandise rapportée au dépôt ou non). Nouvel état « livraison_echouee » ;
-- le gérant relance (repasse en expédiée) ou annule. Option par compte : les livreurs encaissent (montant perçu + mode).
-- Migration additive et rejouable.

-- 1) Nouvel état sur les commandes et leur journal (VARCHAR(12) trop court pour « livraison_echouee »). L'élargissement
--    n'est fait qu'une fois : au rejeu, la colonne générée `stock_sorti` (point 2) interdit de retoucher le type de `statut`.
DO $l3$
BEGIN
  IF (SELECT character_maximum_length FROM information_schema.columns
       WHERE table_name = 'commandes_acheteur' AND column_name = 'statut') < 20 THEN
    ALTER TABLE commandes_acheteur ALTER COLUMN statut TYPE VARCHAR(20);
  END IF;
  IF (SELECT character_maximum_length FROM information_schema.columns
       WHERE table_name = 'commande_acheteur_statuts' AND column_name = 'statut') < 20 THEN
    ALTER TABLE commande_acheteur_statuts ALTER COLUMN statut TYPE VARCHAR(20);
  END IF;
END $l3$;
ALTER TABLE commandes_acheteur DROP CONSTRAINT IF EXISTS commandes_acheteur_statut_check;
ALTER TABLE commandes_acheteur ADD CONSTRAINT commandes_acheteur_statut_check
  CHECK (statut IN ('en_attente', 'expediee', 'livree', 'annulee', 'livraison_echouee'));
ALTER TABLE commande_acheteur_statuts DROP CONSTRAINT IF EXISTS commande_acheteur_statuts_statut_check;
ALTER TABLE commande_acheteur_statuts ADD CONSTRAINT commande_acheteur_statuts_statut_check
  CHECK (statut IN ('en_attente', 'expediee', 'livree', 'annulee', 'livraison_echouee'));

-- 2) Marchandise rapportée au dépôt après un échec, et la règle de stock qui en découle, calculée une fois pour toutes :
--    la commande « sort » du stock quand elle est expédiée ou livrée, ou non livrée SANS retour au dépôt.
ALTER TABLE commandes_acheteur ADD COLUMN IF NOT EXISTS livraison_rapportee BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE commandes_acheteur ADD COLUMN IF NOT EXISTS stock_sorti BOOLEAN
  GENERATED ALWAYS AS (statut IN ('expediee', 'livree') OR (statut = 'livraison_echouee' AND NOT livraison_rapportee)) STORED;
CREATE INDEX IF NOT EXISTS commandes_acheteur_stock_sorti_idx ON commandes_acheteur (labo_id) WHERE stock_sorti;

-- 3) Les tentatives de livraison : une ligne par passage du livreur (la dernière fait foi). La facture signée est une
--    pièce du stockage (même compartiment que les factures d'appro : clients/<id>/pieces/…).
CREATE TABLE IF NOT EXISTS commande_livraisons (
  id               SERIAL PRIMARY KEY,
  commande_id      UUID NOT NULL REFERENCES commandes_acheteur(id) ON DELETE CASCADE,
  client_id        INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  livreur_id       INTEGER REFERENCES livreurs(id) ON DELETE SET NULL,
  livreur_nom      VARCHAR(150) NOT NULL,
  resultat         VARCHAR(10) NOT NULL CHECK (resultat IN ('livree', 'echec')),
  motif            VARCHAR(30) CHECK (motif IS NULL OR motif IN ('absent', 'adresse_introuvable', 'refus', 'marchandise_abimee', 'autre')),
  note             TEXT,
  rapportee_depot  BOOLEAN NOT NULL DEFAULT false,
  receptionnaire   VARCHAR(150),
  montant_percu    NUMERIC(12,3) CHECK (montant_percu IS NULL OR montant_percu >= 0),
  mode_paiement_id INTEGER REFERENCES modes_paiement(id),
  piece_cle        VARCHAR(300),
  piece_type       VARCHAR(40),
  piece_taille     INTEGER,
  piece_nom        VARCHAR(200),
  piece_empreinte  CHAR(64),
  apercu_cle       VARCHAR(300),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (resultat <> 'echec' OR (motif IS NOT NULL AND note IS NOT NULL)),
  CHECK (resultat <> 'livree' OR piece_cle IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS commande_livraisons_commande_idx ON commande_livraisons (commande_id, created_at DESC);
CREATE INDEX IF NOT EXISTS commande_livraisons_livreur_idx ON commande_livraisons (livreur_id, created_at DESC);

-- 4) Option par compte : les livreurs encaissent à la livraison (montant perçu + mode de paiement sur le téléphone).
ALTER TABLE abonnement_config ADD COLUMN IF NOT EXISTS livreurs_encaissement BOOLEAN NOT NULL DEFAULT false;
-- Modes de paiement du terrain (référentiel partagé de la 238 : espèces et virement y sont déjà).
INSERT INTO modes_paiement (code, libelle, ordre) VALUES ('cheque', 'Chèque', 3), ('carte', 'Carte bancaire', 4)
ON CONFLICT (code) DO NOTHING;

-- 5) Manuel : nouvelle fiche « Livrer avec son téléphone » (Espace Acheteurs, après « Livreurs »), insérée telle quelle
--    (comme la 250 : hors de scripts/manuel/balise, protégée par ON CONFLICT).
WITH fiche(slug, titre, icone, ordre, contenu, mots_cles, ecran) AS (
  VALUES ('livreurs-livraison', 'Livrer avec son téléphone', '🏍️', 70, $f253$## 🏍️ Livrer avec son téléphone

Le livreur retrouve dans son espace **Mes livraisons** les commandes expédiées que vous lui avez confiées, avec le client, l'adresse (bouton **🗺️ Itinéraire**), le téléphone (bouton **📞 Appeler**), la consigne, les lignes à livrer et le montant TTC de la facture.

### Sur place, deux issues

- **✅ Livrée** — le livreur **photographie la facture signée ou cachetée** par le client (obligatoire : sans ce document, la livraison ne se valide pas), indique s'il le souhaite le nom de la personne qui a réceptionné et, si vous avez activé l'encaissement, le **montant perçu** et le **mode de paiement**. La commande passe **Livrée**, vous recevez une notification, et la facture signée reste attachée à la commande : vous l'ouvrez depuis le détail (👁️ puis **📎 Facture signée**), [[le:acheteur]] aussi depuis son portail.
- **❌ Non livrée** — le livreur choisit un **motif** (client absent, adresse introuvable, refus, marchandise abîmée, autre), écrit une **note** (obligatoire) et coche **« marchandise rapportée au dépôt »** si elle est revenue. La commande passe **⚠️ Non livrée** ; vous recevez une notification.

### Après un échec, c'est vous qui tranchez

Depuis la liste des commandes (filtre **Non livrées**), sur la commande :

- **🔁 Relancer** — nouvelle tentative : la commande repasse **Expédiée**, avec le même livreur, un autre, ou sans livreur ; la facture est conservée. Si la marchandise avait été rapportée, [[le:stock]] ressort à ce moment-là (date d'expédition du jour).
- **↩️ Annuler** — comme toute annulation : facture supprimée, [[le:stock]] [[acc:stock:réintégré:réintégrée]] s'il n'était pas déjà revenu.

:::regle
Marchandise **rapportée au dépôt** : [[le:stock]] revient automatiquement (la sortie de la commande est neutralisée tant qu'elle n'est pas relancée). Marchandise **non rapportée** (restée chez le livreur, abîmée, perdue) : [[le:stock]] reste sorti jusqu'à votre décision.
:::

### L'encaissement par les livreurs

Dans [[Nom:espace_acheteurs]] → Livreurs, l'interrupteur **« Les livreurs encaissent à la livraison »** ajoute au formulaire du livreur le montant perçu et le mode de paiement (espèces, chèque, carte bancaire, virement). Sans cette option, le livreur ne saisit rien d'autre que la facture signée.

:::attention
La facture signée est une **pièce de la commande** : photo ou PDF, 15 Mo au plus. Elle ne se modifie ni ne se supprime depuis l'application ; une erreur se corrige en annulant puis en refaisant [[le:vente]].
:::

### Voir aussi

- [Livreurs](#livreurs) — créer les comptes, activer l'encaissement
- [[[Pl:vente]] & commandes [[compl:acheteur:pl]]](#acheteurs-ventes) — expédier, confier, relancer, annuler
$f253$, 'livraison, livreur, téléphone, facture signée, facture cachetée, preuve de livraison, non livrée, échec de livraison, motif, rapportée au dépôt, retour en stock, relancer, encaissement, montant perçu, mode de paiement', '/client/acheteurs/commandes')
)
INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant, actif, produit)
SELECT f.slug, f.titre, f.icone, '[[Nom:espace_acheteurs]]', f.ordre, f.contenu, f.contenu, f.mots_cles, f.ecran, true, true, 'labflow'
  FROM fiche f
ON CONFLICT (slug) DO NOTHING;

-- 6) Fiche « Livreurs » : l'interrupteur d'encaissement et le renvoi vers la nouvelle fiche (texte de la 250/251 inchangé
--    par ailleurs ; une fiche retouchée dans l'admin qui ne contient plus ces phrases n'est pas modifiée).
UPDATE manuel_sections
   SET contenu = REPLACE(REPLACE(contenu,
         'les livraisons garderont la trace de qui a livré quoi, et quand.',
         'les livraisons garderont la trace de qui a livré quoi, et quand. Pour que vos livreurs saisissent le **montant perçu** à la livraison, activez l''interrupteur **« Les livreurs encaissent à la livraison »** en haut de la page.'),
         '- [Carnet [[de:acheteur:pl:Nom]]](#acheteurs-carnet) · [Comptes [[court:gerant:pl]]](#gerants)',
         '- [Livrer avec son téléphone](#livreurs-livraison) — ce que fait le livreur sur place, et vous après un échec' || E'\n' || '- [Carnet [[de:acheteur:pl:Nom]]](#acheteurs-carnet) · [Comptes [[court:gerant:pl]]](#gerants)'),
       contenu_defaut = REPLACE(REPLACE(contenu_defaut,
         'les livraisons garderont la trace de qui a livré quoi, et quand.',
         'les livraisons garderont la trace de qui a livré quoi, et quand. Pour que vos livreurs saisissent le **montant perçu** à la livraison, activez l''interrupteur **« Les livreurs encaissent à la livraison »** en haut de la page.'),
         '- [Carnet [[de:acheteur:pl:Nom]]](#acheteurs-carnet) · [Comptes [[court:gerant:pl]]](#gerants)',
         '- [Livrer avec son téléphone](#livreurs-livraison) — ce que fait le livreur sur place, et vous après un échec' || E'\n' || '- [Carnet [[de:acheteur:pl:Nom]]](#acheteurs-carnet) · [Comptes [[court:gerant:pl]]](#gerants)')
 WHERE slug = 'livreurs' AND contenu NOT LIKE '%Les livreurs encaissent à la livraison%';
