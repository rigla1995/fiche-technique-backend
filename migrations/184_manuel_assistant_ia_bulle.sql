-- L'assistant IA est désormais accessible par une BULLE flottante 🤖 présente sur
-- toutes les pages client/gérant (widget AssistantWidget) — plus par un lien de menu.
-- REPLACE ciblés (contenu + contenu_defaut) : la fiche ne doit pas décrire un accès disparu.
UPDATE manuel_sections SET
  contenu = REPLACE(contenu,
    'Vous y accédez depuis la page Assistant IA de votre espace.',
    'Vous y accédez à tout moment par la bulle 🤖 flottante, en bas à droite de chaque page de votre espace : le chat s''ouvre par-dessus votre écran, sans vous faire quitter la page en cours.'),
  contenu_defaut = REPLACE(contenu_defaut,
    'Vous y accédez depuis la page Assistant IA de votre espace.',
    'Vous y accédez à tout moment par la bulle 🤖 flottante, en bas à droite de chaque page de votre espace : le chat s''ouvre par-dessus votre écran, sans vous faire quitter la page en cours.'),
  updated_at = NOW()
WHERE slug = 'assistant-ia';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu,
    '- Un en-tête « Assistant IA LabFlow »',
    '- La bulle 🤖, visible sur toutes les pages : un clic ouvre ou referme l''assistant, et la conversation reste affichée pendant que vous naviguez d''une page à l''autre.
- Un en-tête « Assistant IA LabFlow »'),
  contenu_defaut = REPLACE(contenu_defaut,
    '- Un en-tête « Assistant IA LabFlow »',
    '- La bulle 🤖, visible sur toutes les pages : un clic ouvre ou referme l''assistant, et la conversation reste affichée pendant que vous naviguez d''une page à l''autre.
- Un en-tête « Assistant IA LabFlow »'),
  updated_at = NOW()
WHERE slug = 'assistant-ia';
