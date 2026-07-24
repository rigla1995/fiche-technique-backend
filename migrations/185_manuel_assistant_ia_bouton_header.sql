-- L'assistant IA se déclenche désormais depuis le BOUTON 🤖 de la barre du haut
-- (à côté de la cloche de notifications) — la bulle bas-droite entrait en conflit
-- avec les panneaux flottants de saisie (aperçu d'appro, aperçu de vente).
-- REPLACE ciblés (contenu + contenu_defaut) sur les formulations de la migration 184.
UPDATE manuel_sections SET
  contenu = REPLACE(contenu,
    'la bulle 🤖 flottante, en bas à droite de chaque page de votre espace : le chat s''ouvre par-dessus votre écran, sans vous faire quitter la page en cours.',
    'le bouton 🤖 de la barre du haut (à côté de la cloche de notifications), présent sur chaque page de votre espace : le chat s''ouvre en panneau par-dessus votre écran, sans vous faire quitter la page en cours.'),
  contenu_defaut = REPLACE(contenu_defaut,
    'la bulle 🤖 flottante, en bas à droite de chaque page de votre espace : le chat s''ouvre par-dessus votre écran, sans vous faire quitter la page en cours.',
    'le bouton 🤖 de la barre du haut (à côté de la cloche de notifications), présent sur chaque page de votre espace : le chat s''ouvre en panneau par-dessus votre écran, sans vous faire quitter la page en cours.'),
  updated_at = NOW()
WHERE slug = 'assistant-ia';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu,
    '- La bulle 🤖, visible sur toutes les pages : un clic ouvre ou referme l''assistant',
    '- Le bouton 🤖 de la barre du haut, visible sur toutes les pages : un clic ouvre ou referme l''assistant'),
  contenu_defaut = REPLACE(contenu_defaut,
    '- La bulle 🤖, visible sur toutes les pages : un clic ouvre ou referme l''assistant',
    '- Le bouton 🤖 de la barre du haut, visible sur toutes les pages : un clic ouvre ou referme l''assistant'),
  updated_at = NOW()
WHERE slug = 'assistant-ia';
