-- Migration 231 : factures fournisseur, étape F5 « Scans et photos mieux lus » (labflow-reprise/achats-compta/
-- PLAN-FACTURES.md §1 « F5 », ETAPE-F5.md) — la MISE EN PAGE d'un fournisseur vue par chaque compte : les colonnes du
-- tableau de ses factures (genre, début et fin du titre, en fractions de la largeur de la page), apprises à la validation
-- d'une facture lue, par l'identifiant du matricule fiscal du fournisseur (ses 7 chiffres). Aucune donnée de la facture :
-- ni nom, ni montant, ni ligne.
-- Partage entre les comptes (réponse 12 du client), sans qu'un seul compte puisse l'imposer aux autres : un compte lit
-- toujours SA mise en page ; celle d'un autre compte ne lui est servie que si deux comptes distincts au moins ont vu la
-- même (src/services/misesEnPage.js). Une facture supprimée emporte ce qu'elle avait appris ; un compte supprimé, aussi.
CREATE TABLE IF NOT EXISTS factures_mises_en_page (
  identifiant  VARCHAR(7)  NOT NULL CHECK (identifiant ~ '^[0-9]{7}$'),
  client_id    INTEGER     NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  colonnes     JSONB       NOT NULL CHECK (jsonb_typeof(colonnes) = 'object' AND jsonb_typeof(colonnes -> 'colonnes') = 'array'),
  -- Lecture qui l'a vue (texte d'un PDF, ou image) : information seulement, elle ne donne aucune priorité.
  source       VARCHAR(3)  NOT NULL CHECK (source IN ('pdf', 'ocr')),
  -- La facture validée qui l'a apprise : supprimée, elle emporte la mise en page qu'elle avait fixée.
  facture_id   INTEGER     REFERENCES factures(id) ON DELETE CASCADE,
  appris_par   INTEGER     REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (identifiant, client_id)
);
CREATE INDEX IF NOT EXISTS idx_factures_mises_en_page_facture ON factures_mises_en_page (facture_id);
