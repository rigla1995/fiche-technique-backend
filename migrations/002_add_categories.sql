-- Migration: Ajout table categories pour les ingrédients

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  nom VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS categorie_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
