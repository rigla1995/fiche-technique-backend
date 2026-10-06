-- LabFlow Compta, étape S3a (labflow-reprise/achats-compta/PLAN-S3.md, SPEC-SOCLE D12) : passer d'une adresse à l'autre
-- (app. ↔ compta.) sans ressaisir son mot de passe.
-- 1) Codes de passage à usage unique : conservés hachés (SHA-256), liés à la personne et à l'adresse de destination,
--    valables 60 secondes, marqués à leur utilisation ; ménage des codes anciens à chaque émission (src/compta/passage.js).
--    session_iat / session_exp : dates (secondes) du jeton de la session qui a demandé le passage, reprises par la
--    session ouverte de l'autre côté (jamais prolongée ; révoquée par un changement de mot de passe, comme l'originale).
CREATE TABLE IF NOT EXISTS compta.sessions_passage (
  id           BIGSERIAL PRIMARY KEY,
  personne_id  INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  code_hache   CHAR(64) NOT NULL UNIQUE,
  destination  VARCHAR(10) NOT NULL CHECK (destination IN ('app', 'compta')),
  expire_le    TIMESTAMPTZ NOT NULL,
  utilise_le   TIMESTAMPTZ,
  session_iat  BIGINT NOT NULL,
  session_exp  BIGINT NOT NULL,
  cree_le      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_compta_sessions_passage_expire ON compta.sessions_passage (expire_le);

-- 2) Manuel de LabFlow Compta : le passage entre les deux espaces (fiche d'accueil) et l'arrivée dans « Ma comptabilité »
--    (texte par défaut ET texte en ligne ; une fiche retouchée par l'admin garde ses autres phrases).
UPDATE manuel_sections
   SET contenu = replace(contenu, $a$### Vos comptabilités$a$, $b$### Passer de LabFlow à LabFlow Compta

Si vous utilisez aussi LabFlow (Stock / Vente), un écran vous propose, après la connexion, **Stock / Vente** ou **Comptabilité**. Ensuite, le bouton **📒 Comptabilité** de la barre du haut de LabFlow et le bouton **📦 Stock / Vente** de la barre du haut de LabFlow Compta font passer d'un espace à l'autre sans ressaisir votre mot de passe.

### Vos comptabilités$b$),
       contenu_defaut = replace(contenu_defaut, $a$### Vos comptabilités$a$, $b$### Passer de LabFlow à LabFlow Compta

Si vous utilisez aussi LabFlow (Stock / Vente), un écran vous propose, après la connexion, **Stock / Vente** ou **Comptabilité**. Ensuite, le bouton **📒 Comptabilité** de la barre du haut de LabFlow et le bouton **📦 Stock / Vente** de la barre du haut de LabFlow Compta font passer d'un espace à l'autre sans ressaisir votre mot de passe.

### Vos comptabilités$b$)
 WHERE slug = 'compta-bienvenue' AND produit = 'compta' AND position('### Passer de LabFlow' in contenu_defaut) = 0;

UPDATE manuel_sections
   SET contenu = replace(contenu, $a$2. **Venir ici** : connectez-vous sur l'adresse de LabFlow Compta avec votre adresse email et votre mot de passe LabFlow.$a$, $b$2. **Venir ici** : dans LabFlow, bouton **📒 Comptabilité** de la barre du haut (ou l'écran de choix après la connexion) : vous arrivez ici sans ressaisir votre mot de passe ; le bouton **📦 Stock / Vente** vous ramène dans LabFlow.$b$),
       contenu_defaut = replace(contenu_defaut, $a$2. **Venir ici** : connectez-vous sur l'adresse de LabFlow Compta avec votre adresse email et votre mot de passe LabFlow.$a$, $b$2. **Venir ici** : dans LabFlow, bouton **📒 Comptabilité** de la barre du haut (ou l'écran de choix après la connexion) : vous arrivez ici sans ressaisir votre mot de passe ; le bouton **📦 Stock / Vente** vous ramène dans LabFlow.$b$)
 WHERE slug = 'compta-ma-comptabilite' AND produit = 'compta';
