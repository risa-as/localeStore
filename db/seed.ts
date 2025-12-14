import "dotenv/config";

import sampleData from "./sample-data";
// import { prisma } from "./prisma-db";
import { prisma } from "./prisma";

async function main() {
  await prisma.product.deleteMany();
  await prisma.account.deleteMany();
  await prisma.session.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.user.deleteMany();

  await prisma.product.createMany({
    data: sampleData.products,
  });
  await prisma.user.createMany({
    data: sampleData.users,
  });

  console.log("Database has been seeded successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
