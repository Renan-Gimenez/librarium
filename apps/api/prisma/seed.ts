import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "@/config/env";

const addapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: addapter });

async function main() {
  const fiction = await prisma.genre.upsert({
    where: { name: "Fiction" },
    update: {},
    create: { name: "Fiction" },
  });

  const science = await prisma.genre.upsert({
    where: { name: "Science" },
    update: {},
    create: { name: "Science" },
  });

  await prisma.book.createMany({
    skipDuplicates: true,
    data: [
      {
        title: "The Hitchhiker's Guide to the Galaxy",
        author: "Douglas Adams",
        description:
          "A comedic science fiction series following the misadventures of Arthur Dent.",
        rating: 4.5,
        publishedAt: new Date("1979-10-12"),
        genreId: fiction.id,
      },
      {
        title: "A Brief History of Time",
        author: "Stephen Hawking",
        description:
          "An exploration of cosmology, black holes, and the nature of time.",
        rating: 4.7,
        publishedAt: new Date("1988-04-01"),
        genreId: science.id,
      },
    ],
  });

  console.log("✅ Seed concluído");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
