CREATE TABLE IF NOT EXISTS article_vendable_prix_historique (
  id                  SERIAL PRIMARY KEY,
  article_vendable_id UUID NOT NULL REFERENCES activite_articles_vendables(id) ON DELETE CASCADE,
  prix_vente          NUMERIC(10,2) NOT NULL,
  saved_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_avph_article_vendable ON article_vendable_prix_historique(article_vendable_id, saved_at DESC);
