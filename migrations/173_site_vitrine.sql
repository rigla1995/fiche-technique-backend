-- 173 — Site vitrine public : demandes d'accès + partenaires affichés.
--   • Table demandes_acces : leads du formulaire public « Demander un accès »
--     (statut nouvelle → contactee → convertie / refusee). Dédup silencieuse des
--     demandes OUVERTES par email : index UNIQUE partiel sur LOWER(email) — le
--     POST public fait ON CONFLICT DO NOTHING dessus (réponse 200 uniforme,
--     anti-énumération). config_calculateur = snapshot JSON du calculateur de
--     tarif du site (si le visiteur en vient).
--   • profil_entreprise : opt-in vitrine par client — site_partenaire_actif
--     + logo_site (data-URI base64, servi par GET /api/public/partenaires).

CREATE TABLE IF NOT EXISTS demandes_acces (
  id SERIAL PRIMARY KEY,
  nom VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL,
  telephone VARCHAR(30) NOT NULL,
  ville VARCHAR(100),
  type_activite VARCHAR(40),
  nb_points_vente INT,
  a_labo BOOLEAN,
  interet_b2b BOOLEAN,
  message TEXT,
  config_calculateur JSONB,
  statut VARCHAR(15) NOT NULL DEFAULT 'nouvelle'
    CHECK (statut IN ('nouvelle', 'contactee', 'convertie', 'refusee')),
  converted_client_id INT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  notes_admin TEXT,
  ip VARCHAR(60),
  user_agent TEXT,
  traite_par INT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  traite_le TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Une seule demande OUVERTE (nouvelle/contactee) par email — les demandes
-- converties/refusées ne bloquent pas une nouvelle demande du même email.
CREATE UNIQUE INDEX IF NOT EXISTS demandes_acces_email_ouverte
  ON demandes_acces (LOWER(email))
  WHERE statut IN ('nouvelle', 'contactee');

ALTER TABLE profil_entreprise
  ADD COLUMN IF NOT EXISTS site_partenaire_actif BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS logo_site TEXT; -- data-URI base64 (png|jpeg|webp|svg+xml)
