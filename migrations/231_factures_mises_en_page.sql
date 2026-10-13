-- Migration 231 : factures fournisseur, étape F5 « Scans et photos mieux lus » (labflow-reprise/achats-compta/
-- PLAN-FACTURES.md §1 « F5 », ETAPE-F5.md) — la MISE EN PAGE apprise d'un fournisseur : les colonnes du tableau de ses
-- factures (genre, début et fin du titre, en fractions de la largeur de la page), apprises à la validation d'une facture
-- lue et PARTAGÉES entre les comptes par l'identifiant du matricule fiscal du fournisseur (ses 7 chiffres ; réponse 12 du
-- client). Aucune donnée d'un compte : ni nom, ni montant, ni ligne. Une mise en page vue sur le texte d'un PDF (exacte)
-- n'est jamais remplacée par une mise en page vue sur une image (src/services/misesEnPage.js).
CREATE TABLE IF NOT EXISTS factures_mises_en_page (
  identifiant     VARCHAR(7)  PRIMARY KEY CHECK (identifiant ~ '^[0-9]{7}$'),
  colonnes        JSONB       NOT NULL CHECK (jsonb_typeof(colonnes) = 'object' AND jsonb_typeof(colonnes -> 'colonnes') = 'array'),
  source          VARCHAR(3)  NOT NULL CHECK (source IN ('pdf', 'ocr')),
  apprentissages  INTEGER     NOT NULL DEFAULT 1 CHECK (apprentissages > 0),
  -- Dernière personne dont la validation a fixé la mise en page (suivi d'un abus éventuel) ; jamais montré.
  appris_par      INTEGER     REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
