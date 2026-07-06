-- 145 : retrait du canal Telegram (fonctionnalité supprimée de l'application).
-- La fiche « Assistant IA » du manuel ne doit plus le proposer ; Messenger reste
-- le seul canal de messagerie optionnel.
UPDATE manuel_sections
   SET contenu = REPLACE(contenu, 'une messagerie instantanée (Telegram ou Messenger)', 'Facebook Messenger'),
       contenu_defaut = REPLACE(contenu_defaut, 'une messagerie instantanée (Telegram ou Messenger)', 'Facebook Messenger'),
       updated_at = NOW()
 WHERE slug = 'assistant-ia'
   AND (contenu LIKE '%Telegram%' OR contenu_defaut LIKE '%Telegram%');
