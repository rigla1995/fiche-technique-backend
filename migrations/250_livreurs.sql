-- 250 — Module « Livreurs », étape L1 « comptes livreurs » (labflow-reprise/livreurs/PLAN-LIVREURS.md, plan validé le
-- 19/10/2026 : « ok pour tes 6 recommandations, vas-y L1 »). Un livreur est une personne du compte client qui livre les
-- commandes [[acheteurs]] et, depuis son téléphone (étape L3), valide ou signale l'échec d'une livraison. Il est créé par le
-- client ou un gérant, se connecte par téléphone ou par e-mail, et ne voit que ses livraisons.
-- Migration additive et rejouable : aucun compte existant ne change.

-- 1) Rôle « livreur » : contrainte refaite sur le modèle de la 202 (liste fermée des rôles).
ALTER TABLE utilisateurs DROP CONSTRAINT IF EXISTS utilisateurs_role_check;
ALTER TABLE utilisateurs ADD CONSTRAINT utilisateurs_role_check
  CHECK ((role)::text = ANY ((ARRAY['super_admin','client','gerant','acheteur','boss','comptable','livreur'])::text[]));

-- 2) Mot de passe initial à changer à la première connexion : un livreur sans adresse e-mail ne peut pas recevoir
--    d'invitation ; le client lui remet un mot de passe initial (affiché une seule fois), que l'application lui fait
--    changer avant tout accès à son espace.
ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS doit_changer_mdp BOOLEAN NOT NULL DEFAULT false;

-- 3) Fiche livreur : une ligne par compte livreur (comme `acheteurs` pour le rôle acheteur). `telephone_norm` = les
--    8 chiffres du numéro tunisien, identifiant de connexion, unique sur toute la base. `email` = l'adresse réelle si le
--    livreur en a une (sinon NULL : utilisateurs.email porte alors une adresse technique livreur-<tel>@livreurs.labflow.local,
--    jamais affichée).
CREATE TABLE IF NOT EXISTS livreurs (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL UNIQUE REFERENCES utilisateurs(id) ON DELETE CASCADE,
  nom VARCHAR(100) NOT NULL,
  telephone VARCHAR(20) NOT NULL,
  telephone_norm VARCHAR(8) NOT NULL,
  email VARCHAR(255),
  actif BOOLEAN NOT NULL DEFAULT true,
  cree_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS livreurs_telephone_norm_key ON livreurs (telephone_norm);
CREATE INDEX IF NOT EXISTS livreurs_client_idx ON livreurs (client_id);

-- 4) Quota : 5 livreurs par compte (décision du client du 19/10, « inclus, 5 par compte, au-delà sur demande »).
--    Colonne simple, hors composants de l'abonnement (deriveCompteurs ne la touche pas) ; l'admin la relève à la demande.
ALTER TABLE abonnement_config ADD COLUMN IF NOT EXISTS nb_livreurs INTEGER NOT NULL DEFAULT 5;

-- 5) Manuel : fiche « Livreurs » de l'Espace Acheteurs (ordre 69 comme la fiche du portail : elle se range juste après,
--    avant « Tableau de bord » (70) ; le tri est ordre puis id). Visible des gérants qui ont l'accès à la base acheteurs.
WITH fiche(slug, titre, icone, ordre, contenu, mots_cles, ecran) AS (
  VALUES ('livreurs', 'Livreurs', '🏍️', 69, $f250$## 🏍️ Livreurs

Cet écran vous permet de créer des **comptes livreurs** : les personnes qui livrent vos commandes [[compl:acheteur:pl]]. Depuis son téléphone, un livreur verra les livraisons qu'on lui confie, validera chaque livraison ou signalera qu'elle a échoué (étapes à venir du module). Vous trouvez l'écran dans le menu latéral, partie **[[Nom:espace_acheteurs]]**, entrée **Livreurs**. Un livreur ne voit que ses livraisons : jamais [[le:stock]], les prix d'achat ni les autres commandes.

### Ce que vous voyez

Le bandeau affiche le compteur **Livreurs** (comptes créés / comptes inclus dans votre abonnement) et le bouton **+ Nouveau livreur**, remplacé par la mention 🔒 *Limite atteinte* quand le quota est plein.

Chaque livreur apparaît sous forme de carte avec :

- ses initiales, son nom, son téléphone et, s'il en a une, son adresse e-mail ;
- son statut : **● Actif** ou **○ Inactif**, plus **⏳ Invitation en attente** tant qu'il n'a pas activé son compte par e-mail, ou **🔑 Mot de passe à changer** tant qu'il n'a pas remplacé le mot de passe initial que vous lui avez remis ;
- les actions : **✉️ Renvoyer** l'invitation (livreur avec e-mail, compte non activé), **🔑 Nouveau mot de passe**, **✏️ Modifier**, **⏸ Désactiver** / **▶ Activer**, **🗑** supprimer.

### Actions pas à pas

1. Cliquez **+ Nouveau livreur** et renseignez le **nom** et le **téléphone** (8 chiffres, obligatoires). L'adresse **e-mail** est facultative.
2. **Avec une adresse e-mail** : validez avec **✓ Créer et envoyer l'invitation**. Le livreur reçoit un e-mail, clique sur le lien (valable 48 heures) et choisit son mot de passe.
3. **Sans adresse e-mail** : validez avec **✓ Créer et obtenir le mot de passe**. Un **mot de passe initial** s'affiche **une seule fois** : notez-le et remettez-le au livreur de vive voix. À sa première connexion, l'application lui demande d'en choisir un nouveau.
4. Le livreur se connecte sur la page habituelle de LabFlow avec son **numéro de téléphone** (ou son e-mail) et son mot de passe.
5. Mot de passe perdu : **🔑 Nouveau mot de passe** en génère un autre, affiché une seule fois lui aussi ; les sessions ouvertes du livreur sont fermées.
6. Pour suspendre temporairement un accès, cliquez **⏸ Désactiver** (réversible avec ▶ Activer). Pour retirer définitivement l'accès, utilisez 🗑 (une confirmation est demandée).

### Points d'attention

:::regle
Votre abonnement comprend **5 comptes livreurs**. Au-delà, demandez un ajout de capacité à l'équipe LabFlow depuis la page Demandes.
:::

:::attention
Le numéro de téléphone sert d'identifiant de connexion : il doit être **unique** dans LabFlow et au format tunisien (8 chiffres). Le mot de passe initial n'est **jamais** envoyé par SMS ni par e-mail : il n'existe qu'à l'écran, au moment où il est généré.
:::

:::astuce
Créez un compte par livreur plutôt qu'un compte partagé : les livraisons garderont la trace de qui a livré quoi, et quand.
:::

### Voir aussi

- [[[Pl:vente]] & commandes [[compl:acheteur:pl]]](#acheteurs-ventes) — les commandes que vos livreurs livreront
- [Carnet [[de:acheteur:pl:Nom]]](#acheteurs-carnet) · [Comptes [[court:gerant:pl]]](#gerants)
$f250$, 'livreur, livreurs, livraison, compte livreur, téléphone, mot de passe initial, invitation, désactiver, quota, cinq livreurs, chauffeur, coursier, expédition, commandes acheteurs', '/client/livreurs')
)
INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant, actif, produit)
SELECT f.slug, f.titre, f.icone, '[[Nom:espace_acheteurs]]', f.ordre, f.contenu, f.contenu, f.mots_cles, f.ecran, true, true, 'labflow'
  FROM fiche f
ON CONFLICT (slug) DO NOTHING;
