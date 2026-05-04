ALTER TABLE produits ADD COLUMN IF NOT EXISTS linked_ingredient_id INT REFERENCES ingredients(id);
