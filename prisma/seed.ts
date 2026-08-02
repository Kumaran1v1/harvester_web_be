import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding started...");

  // Hash password
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash("Gunal@006", saltRounds);

  // Seed default user: Gunal (find + update/create avoids MongoDB replica-set requirement of upsert)
  const existing = await prisma.user.findUnique({
    where: { email: "gunal@gmail.com" },
  });

  const gunalUser = existing
    ? await prisma.user.update({
        where: { email: "gunal@gmail.com" },
        data: {
          name: "Gunal",
          mobile: "9080076414",
          password: hashedPassword,
          address: "Owner Address",
        },
      })
    : await prisma.user.create({
        data: {
          name: "Gunal",
          email: "gunal@gmail.com",
          mobile: "9080076414",
          password: hashedPassword,
          address: "Owner Address",
          status: "ACTIVE",
        },
      });

  console.log("User seeded successfully:", gunalUser.email);
  console.log("Name is: Gunal");
  console.log("Mobile is: 9080076414");
  console.log("Password is: Gunal@006");
  console.log("Seeding complete.");
}

main()
  .catch((e) => {
    console.log(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
