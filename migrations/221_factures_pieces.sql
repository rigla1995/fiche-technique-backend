-- 221 — Factures fournisseur, étape F1 : la facture devient une vraie pièce (labflow-reprise/achats-compta/PLAN-FACTURES.md).
--
-- factures_pieces : les fichiers du fournisseur (PDF, scan, photo) joints à une facture d'approvisionnement saisie
--   (type_source 'manuel') ; 1 à 5 par facture. Le fichier vit dans le stockage (Cloudflare R2 en production, dossier
--   local en essai) sous `cle` ; la base garde son type (vérifié sur le contenu), sa taille, son empreinte SHA-256 et
--   son nom d'origine. Une photo HEIC / HEIF reçoit une copie JPEG faite par le navigateur (`apercu_cle`), pour
--   l'affichage partout. Suppression définitive (décision du client, 09/10/2026) : la ligne et le fichier partent.
-- factures_journal : qui a créé une facture, ajouté des lignes, joint, remplacé, supprimé une pièce, supprimé une
--   facture (sa dernière ligne partie) ; garde la référence en clair quand la facture n'existe plus.
-- Index : lignes de stock par facture (recalcul des montants, dernière ligne d'une facture) ; numéro de facture
--   normalisé (majuscules, sans espaces) par compte, pour l'avertissement « facture déjà saisie ».
--
-- Additive et idempotente ; aucune donnée existante n'est modifiée.

CREATE TABLE IF NOT EXISTS factures_pieces (
  id            SERIAL PRIMARY KEY,
  facture_id    INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  client_id     INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  ordre         SMALLINT NOT NULL CHECK (ordre BETWEEN 1 AND 5),
  cle           VARCHAR(200) NOT NULL UNIQUE,
  type_mime     VARCHAR(40) NOT NULL CHECK (type_mime IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp',
                                                          'image/heic', 'image/heif', 'image/avif')),
  taille        INTEGER NOT NULL CHECK (taille > 0),
  empreinte     CHAR(64) NOT NULL,
  nom_origine   VARCHAR(200) NOT NULL,
  apercu_cle    VARCHAR(200) UNIQUE,
  apercu_taille INTEGER CHECK (apercu_taille > 0),
  depose_par    INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  depose_le     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((apercu_cle IS NULL) = (apercu_taille IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_factures_pieces_facture ON factures_pieces (facture_id, ordre);
CREATE INDEX IF NOT EXISTS idx_factures_pieces_client ON factures_pieces (client_id);

CREATE TABLE IF NOT EXISTS factures_journal (
  id          BIGSERIAL PRIMARY KEY,
  client_id   INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  facture_id  INTEGER REFERENCES factures(id) ON DELETE SET NULL,
  action      VARCHAR(30) NOT NULL CHECK (action IN ('facture_creee', 'lignes_ajoutees', 'piece_jointe', 'piece_remplacee',
                                                     'piece_supprimee', 'facture_supprimee')),
  auteur_id   INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  cree_le     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_factures_journal_client ON factures_journal (client_id, cree_le DESC);
CREATE INDEX IF NOT EXISTS idx_factures_journal_facture ON factures_journal (facture_id) WHERE facture_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_entreprise_daily_facture ON stock_entreprise_daily (facture_id) WHERE facture_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_labo_daily_facture ON stock_labo_daily (facture_id) WHERE facture_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_factures_ref_normalisee
  ON factures (client_id, UPPER(REGEXP_REPLACE(ref_facture, '\s', '', 'g')))
  WHERE ref_facture IS NOT NULL;
