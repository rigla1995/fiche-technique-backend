-- 255 — Module « Livreurs », étape L4 « suivi des livraisons » (labflow-reprise/livreurs/PLAN-LIVREURS.md, L3 acceptée le
-- 20/10/2026). Aucune donnée nouvelle : la page « Suivi des livraisons » et le bloc Livraisons du tableau de bord lisent
-- `commande_livraisons` (253). Cette migration n'apporte que le manuel : fiche « Suivi des livraisons » et renvoi depuis
-- la fiche « Livreurs ». Additive et rejouable.

WITH fiche(slug, titre, icone, ordre, contenu, mots_cles, ecran) AS (
  VALUES ('livreurs-suivi', 'Suivi des livraisons', '📍', 71, $f255$## 📍 Suivi des livraisons

Cet écran rassemble **tous les passages de vos livreurs** — livraisons validées avec la facture signée, et livraisons non abouties — pour savoir qui a livré quoi, en combien de temps, et ce qui a coincé. Vous le trouvez dans [[Nom:espace_acheteurs]] → **Suivi des livraisons**.

### Ce que vous voyez

- **Les chiffres de la période** : passages, livrées, non livrées (avec le taux d'échec), **délai moyen** entre l'expédition et la livraison, et le **total encaissé** par vos livreurs si l'option d'encaissement est active.
- **Par livreur** : le même bilan ligne par ligne — livrées, non livrées, taux d'échec, délai moyen, encaissé — pour comparer et repérer un livreur en difficulté.
- **Motifs d'échec** : la répartition des livraisons non abouties (client absent, adresse introuvable, refus, marchandise abîmée, autre).
- **La liste des passages** : date et heure, livreur, [[nom:acheteur]], facture et montant, résultat, motif et note, marchandise rapportée ou non, réceptionnaire, montant perçu et mode de paiement. Le bouton 👁️ ouvre la commande ; **📎** ouvre la facture signée.

### Filtres et export

Les filtres sont ceux de tous les historiques : **période**, **livreur**, **résultat** (livrées / non livrées) et [[nom:acheteur]]. **Exporter** produit le classeur Excel à la charte LabFlow avec la liste filtrée ; les lignes cochées y sont surlignées en ambre (la sélection ne filtre pas).

:::astuce
Le **délai** se compte en jours entre la date d'expédition et le jour de la livraison : 0 = livrée le jour même. Un délai moyen qui grimpe sur un livreur, ou un taux d'échec au-dessus des autres, mérite une conversation.
:::

:::regle
Un passage reste dans le suivi même si la commande est ensuite relancée ou annulée : c'est l'historique du terrain, pas l'état de la commande (celui-ci se lit dans [[[Pl:vente]] & commandes [[compl:acheteur:pl]]](#acheteurs-ventes)).
:::

### Voir aussi

- [Livrer avec son téléphone](#livreurs-livraison) — ce que fait le livreur sur place
- [Livreurs](#livreurs) — les comptes, l'option d'encaissement
- Tableau de bord, onglet [[Court:acheteur:pl]] : le bloc **Livraisons** reprend ces chiffres sur la période du tableau de bord
$f255$, 'suivi des livraisons, livreur, livraisons par livreur, délai de livraison, délai moyen, taux d''échec, motifs, encaissements, historique des livraisons, export livraisons, tournée', '/client/livraisons')
)
INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant, actif, produit)
SELECT f.slug, f.titre, f.icone, '[[Nom:espace_acheteurs]]', f.ordre, f.contenu, f.contenu, f.mots_cles, f.ecran, true, true, 'labflow'
  FROM fiche f
ON CONFLICT (slug) DO NOTHING;

-- Fiche « Livreurs » : renvoi vers le suivi (après le renvoi vers « Livrer avec son téléphone » posé par la 253).
UPDATE manuel_sections
   SET contenu = REPLACE(contenu,
         '- [Livrer avec son téléphone](#livreurs-livraison) — ce que fait le livreur sur place, et vous après un échec',
         '- [Livrer avec son téléphone](#livreurs-livraison) — ce que fait le livreur sur place, et vous après un échec' || E'\n' || '- [Suivi des livraisons](#livreurs-suivi) — qui a livré quoi, délais, échecs, encaissements'),
       contenu_defaut = REPLACE(contenu_defaut,
         '- [Livrer avec son téléphone](#livreurs-livraison) — ce que fait le livreur sur place, et vous après un échec',
         '- [Livrer avec son téléphone](#livreurs-livraison) — ce que fait le livreur sur place, et vous après un échec' || E'\n' || '- [Suivi des livraisons](#livreurs-suivi) — qui a livré quoi, délais, échecs, encaissements')
 WHERE slug = 'livreurs' AND contenu NOT LIKE '%#livreurs-suivi%';
