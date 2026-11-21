-- CreateIndex
CREATE INDEX IF NOT EXISTS "books_embedding_hnsw_idx" ON "books" USING hnsw ("embedding" vector_cosine_ops);
