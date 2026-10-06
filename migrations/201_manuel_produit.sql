-- 201 — LabFlow Compta, étape S2a (labflow-reprise/achats-compta/SPEC-SOCLE.md, D15) : chaque fiche du manuel
-- appartient à un produit, LabFlow (toutes les fiches existantes) ou LabFlow Compta ; première fiche de LabFlow Compta.
--
-- GET /api/manuel sert les fiches de LabFlow par défaut (aucun changement pour les lecteurs de app.) et, avec
-- ?produit=compta, celles de LabFlow Compta. Les fiches de LabFlow Compta sont en vocabulaire comptable fixe : jamais
-- balisées, jamais rendues dans les mots du domaine du compte. Écrite à la main : l'outil scripts/manuel/ ne sait que
-- réécrire des fiches de LabFlow existantes. Idempotente.

ALTER TABLE manuel_sections ADD COLUMN IF NOT EXISTS produit VARCHAR(10) NOT NULL DEFAULT 'labflow';
ALTER TABLE manuel_sections DROP CONSTRAINT IF EXISTS manuel_sections_produit_check;
ALTER TABLE manuel_sections ADD CONSTRAINT manuel_sections_produit_check CHECK (produit IN ('labflow', 'compta'));
-- Une fiche de LabFlow Compta ne porte jamais de balise « [[ » (elle serait rendue avec les mots de LabFlow) : la base
-- le garantit, quel que soit le chemin d'écriture (création, modification, changement de produit d'une fiche balisée).
ALTER TABLE manuel_sections DROP CONSTRAINT IF EXISTS manuel_sections_compta_sans_balise;
ALTER TABLE manuel_sections ADD CONSTRAINT manuel_sections_compta_sans_balise CHECK (
  produit <> 'compta'
  OR (strpos(titre, '[[') = 0 AND strpos(partie, '[[') = 0 AND strpos(contenu, '[[') = 0
      AND strpos(COALESCE(contenu_defaut, ''), '[[') = 0)
);

WITH fiche (contenu) AS (VALUES ($compta_bienvenue$## 📒 Bienvenue dans LabFlow Compta

LabFlow Compta est l'espace comptable de LabFlow. Il a sa propre adresse : **compta.labflow-tn.com**.

### Se connecter

1. Ouvrez **compta.labflow-tn.com**.
2. Saisissez votre adresse email et votre mot de passe, puis cliquez sur **Se connecter**.
3. Mot de passe perdu : cliquez sur **Mot de passe oublié ?**. Le lien reçu par email vous ramène sur LabFlow Compta.

### Vos comptabilités

L'accueil **Vos comptabilités** présente les comptabilités auxquelles vous avez accès, en trois groupes toujours séparés :

| Groupe | Ce qu'il contient |
|---|---|
| Mon cabinet | la comptabilité de votre cabinet comptable |
| Ma comptabilité | la comptabilité de votre entreprise, quand vous êtes client LabFlow avec le module Comptabilité |
| Comptabilités confiées par des clients LabFlow | les comptabilités que des clients LabFlow vous ont confiées |

Tant qu'aucune comptabilité n'est ouverte pour votre compte, l'accueil l'indique.

### Aide

Le bouton **?** en haut de chaque page ouvre ce manuel dans un nouvel onglet, à la fiche de la page.$compta_bienvenue$))
INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant, actif, produit)
SELECT 'compta-bienvenue', 'Bienvenue dans LabFlow Compta', '📒', 'LabFlow Compta', 1000, fiche.contenu, fiche.contenu,
       'compta, comptabilité, connexion, accueil, cabinet, mot de passe, aide', '/', true, true, 'compta'
  FROM fiche
ON CONFLICT (slug) DO NOTHING;
