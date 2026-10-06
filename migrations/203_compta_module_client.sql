-- LabFlow Compta, étape S2c (labflow-reprise/achats-compta/PLAN-S2.md §4) : le module Comptabilité chez un client
-- Stock / Vente. Le schéma vient de la migration 202 (colonnes module_compta_* de abonnement_config, type de demande
-- activer_module_compta, compta.espaces de type client_labflow) ; cette migration ajoute :
-- 1) la date de désactivation du module : il reste facturé jusqu'au mois de sa désactivation compris
--    (tarifsCompta.configPourMois) ; NULL tant qu'il n'a jamais été désactivé ;
-- 2) la fiche du manuel de la page « Ma comptabilité » (vocabulaire comptable fixe, jamais balisée ; produit
--    « compta », hors outil scripts/manuel/, PLAN-S2 §2.14).
ALTER TABLE abonnement_config ADD COLUMN IF NOT EXISTS module_compta_desactive_le TIMESTAMPTZ;

WITH fiche (slug, titre, icone, ordre, contenu, mots_cles, ecran) AS (VALUES
  ('compta-ma-comptabilite', 'Ma comptabilité', '📒', 1030, $f203a$## 📒 Ma comptabilité

Cette page présente la comptabilité de votre entreprise dans LabFlow Compta. Elle existe dès que le **module Comptabilité** est activé sur votre compte LabFlow. Vous la trouvez dans le menu de gauche, entrée **Ma comptabilité**, ou depuis l'accueil.

### Ce que vous voyez

- **Votre module** : le prix mensuel du module (et des gérants comptables supplémentaires s'il y en a) et le mois à partir duquel il est facturé, avec votre abonnement LabFlow, sur la même facture.
- **Votre comptable** : le module comprend l'accès d'un comptable. Tant qu'il n'est pas désigné, il apparaît « à désigner ».
- **Gérants comptables supplémentaires** : les accès comptables prévus en plus de celui de votre comptable.

### Actions pas à pas

1. **Activer le module** : dans LabFlow, page **Mon abonnement**, carte **Module Comptabilité**, cliquez sur **Demander l'activation** ; l'équipe LabFlow valide votre demande.
2. **Venir ici** : connectez-vous sur l'adresse de LabFlow Compta avec votre adresse email et votre mot de passe LabFlow.

### Points d'attention

:::attention
Le module est facturé à son prix, à partir du mois qui suit son activation. Les promotions de votre abonnement LabFlow ne s'y appliquent pas.
:::

:::astuce
La désignation de votre comptable et l'ouverture de vos dossiers arrivent dans une prochaine version de LabFlow Compta.
:::$f203a$, 'ma comptabilité, module, comptable, gérants comptables, facture, activation', '/ma-comptabilite')
)
INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant, actif, produit)
SELECT f.slug, f.titre, f.icone, 'LabFlow Compta', f.ordre, f.contenu, f.contenu, f.mots_cles, f.ecran, false, true, 'compta'
  FROM fiche f
ON CONFLICT (slug) DO NOTHING;
