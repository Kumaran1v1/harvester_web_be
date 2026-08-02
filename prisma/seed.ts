import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding started...");

  const email = "kumaran@gmail.com";
  const password = "12345678";
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  // find + create/update avoids MongoDB replica-set requirement of upsert
  const existing = await prisma.user.findUnique({
    where: { email },
  });

  const user = existing
    ? await prisma.user.update({
        where: { email },
        data: {
          name: "kumaran",
          mobile: "9080076414",
          password: hashedPassword,
          address: "Owner Address",
        },
      })
    : await prisma.user.create({
        data: {
          name: "kumaran",
          email,
          mobile: "9080076414",
          password: hashedPassword,
          address: "Owner Address",
          status: "ACTIVE",
        },
      });

  console.log("User seeded successfully:", user.email);
  console.log("Name is: kumaran");
  console.log("Mobile is: 9080076414");
  console.log("Password is:", password);
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
