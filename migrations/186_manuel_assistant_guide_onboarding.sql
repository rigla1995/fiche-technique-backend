-- L'assistant IA devient un GUIDE DE MISE EN ROUTE (décision client 2026-07-24) :
-- visible pendant l'onboarding uniquement, il montre l'avancement de la configuration
-- et se retire quand tout est en place (il revient après un avenant).
-- REPLACE ciblés (contenu + contenu_defaut) sur les formulations de la migration 185.
UPDATE manuel_sections SET
  contenu = REPLACE(contenu,
    'Vous y accédez à tout moment par le bouton 🤖 de la barre du haut (à côté de la cloche de notifications), présent sur chaque page de votre espace : le chat s''ouvre en panneau par-dessus votre écran, sans vous faire quitter la page en cours.',
    'Il s''affiche via le bouton 🤖 de la barre du haut (à côté de la cloche de notifications) **pendant votre mise en route** : le panneau montre l''avancement de votre configuration étape par étape (activités & labos, référentiel, articles, fournisseurs, produits, premières saisies, carnet d''acheteurs si le module est actif), avec des questions suggérées pour l''étape en cours. Une fois votre configuration terminée, le guide se retire automatiquement — et il revient de lui-même si un avenant ajoute de nouvelles capacités à configurer (activité, labo, module Acheteurs…). Le chat s''ouvre par-dessus votre écran, sans vous faire quitter la page en cours.'),
  contenu_defaut = REPLACE(contenu_defaut,
    'Vous y accédez à tout moment par le bouton 🤖 de la barre du haut (à côté de la cloche de notifications), présent sur chaque page de votre espace : le chat s''ouvre en panneau par-dessus votre écran, sans vous faire quitter la page en cours.',
    'Il s''affiche via le bouton 🤖 de la barre du haut (à côté de la cloche de notifications) **pendant votre mise en route** : le panneau montre l''avancement de votre configuration étape par étape (activités & labos, référentiel, articles, fournisseurs, produits, premières saisies, carnet d''acheteurs si le module est actif), avec des questions suggérées pour l''étape en cours. Une fois votre configuration terminée, le guide se retire automatiquement — et il revient de lui-même si un avenant ajoute de nouvelles capacités à configurer (activité, labo, module Acheteurs…). Le chat s''ouvre par-dessus votre écran, sans vous faire quitter la page en cours.'),
  updated_at = NOW()
WHERE slug = 'assistant-ia';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu,
    '- Le bouton 🤖 de la barre du haut, visible sur toutes les pages : un clic ouvre ou referme l''assistant',
    '- Le bouton 🤖 de la barre du haut, visible pendant votre mise en route : un clic ouvre ou referme le guide'),
  contenu_defaut = REPLACE(contenu_defaut,
    '- Le bouton 🤖 de la barre du haut, visible sur toutes les pages : un clic ouvre ou referme l''assistant',
    '- Le bouton 🤖 de la barre du haut, visible pendant votre mise en route : un clic ouvre ou referme le guide'),
  updated_at = NOW()
WHERE slug = 'assistant-ia';
