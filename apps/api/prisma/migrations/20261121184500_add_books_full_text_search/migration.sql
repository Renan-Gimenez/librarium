-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA public;

-- AlterTable
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "search_vector" tsvector;

-- CreateFunction
CREATE OR REPLACE FUNCTION "books_search_vector_update"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."search_vector" :=
    setweight(to_tsvector('simple', public.unaccent(coalesce(NEW."title", ''))), 'A') ||
    setweight(to_tsvector('simple', public.unaccent(coalesce(NEW."author", ''))), 'B') ||
    setweight(to_tsvector('simple', public.unaccent(coalesce(NEW."description", ''))), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- CreateTrigger
DROP TRIGGER IF EXISTS "books_search_vector_trigger" ON "books";
CREATE TRIGGER "books_search_vector_trigger"
BEFORE INSERT OR UPDATE OF "title", "author", "description"
ON "books"
FOR EACH ROW
EXECUTE FUNCTION "books_search_vector_update"();

-- Backfill
UPDATE "books"
SET "search_vector" =
  setweight(to_tsvector('simple', public.unaccent(coalesce("title", ''))), 'A') ||
  setweight(to_tsvector('simple', public.unaccent(coalesce("author", ''))), 'B') ||
  setweight(to_tsvector('simple', public.unaccent(coalesce("description", ''))), 'C');

-- CreateIndex
CREATE INDEX IF NOT EXISTS "books_search_vector_gin_idx" ON "books" USING GIN ("search_vector");
