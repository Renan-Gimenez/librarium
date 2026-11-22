/*
  Warnings:

  - You are about to drop the column `genreId` on the `books` table. All the data in the column will be lost.
  - The primary key for the `genres` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `genres` table. All the data in the column will be lost.
  - Added the required column `slug` to the `genres` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "books" DROP CONSTRAINT "books_genreId_fkey";

-- AlterTable
ALTER TABLE "books" DROP COLUMN "genreId";

-- AlterTable
ALTER TABLE "genres" DROP CONSTRAINT "genres_pkey",
DROP COLUMN "id",
ADD COLUMN     "slug" TEXT NOT NULL,
ADD CONSTRAINT "genres_pkey" PRIMARY KEY ("slug");

-- CreateTable
CREATE TABLE "_BookToGenre" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_BookToGenre_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_BookToGenre_B_index" ON "_BookToGenre"("B");

-- AddForeignKey
ALTER TABLE "_BookToGenre" ADD CONSTRAINT "_BookToGenre_A_fkey" FOREIGN KEY ("A") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BookToGenre" ADD CONSTRAINT "_BookToGenre_B_fkey" FOREIGN KEY ("B") REFERENCES "genres"("slug") ON DELETE CASCADE ON UPDATE CASCADE;
