const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding started...");

  const kumaranPassword = "Kumaran@11";
  const hashedPassword = await bcrypt.hash(kumaranPassword, 10);

  // Kumaran - Super Admin
  const kumaran = await prisma.user.upsert({
    where: { email: "kumaran@gmail.com" },
    update: { password: hashedPassword },
    create: {
      name: "Kumaran",
      email: "kumaran@gmail.com",
      mobile: "6380251936",
      password: hashedPassword,
      status: "ACTIVE",
    },
  });
  console.log("Kumaran seeded:", kumaran.email, "| mobile:", kumaran.mobile, "| password:", kumaranPassword);

  // Gunal - Owner (preserve existing data, only upsert if not present)
  const gunalPassword = "Gunal@11";
  const gunalHashed = await bcrypt.hash(gunalPassword, 10);

  const gunal = await prisma.user.upsert({
    where: { email: "gunalgunal2710@gmail.com" },
    update: { password: gunalHashed },
    create: {
      name: "Gunal",
      email: "gunalgunal2710@gmail.com",
      mobile: "9080076414",
      password: gunalHashed,
      status: "ACTIVE",
      address: "2/6 mariyamman Kovil Street, p nathamedu, Pidagam.",
      companyName: "GUNAL HARVESTER'S",
      secondaryMobile: "9443289283",
      city: "Viluppuram",
      education: "Bsc.agri,MBA",
    },
  });
  console.log("Gunal seeded:", gunal.email, "| mobile:", gunal.mobile);

  console.log("Seeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
