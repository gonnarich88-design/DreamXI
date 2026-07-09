-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurrencyBalance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lp" INTEGER NOT NULL DEFAULT 0,
    "ppPending" INTEGER NOT NULL DEFAULT 0,
    "ppConfirmed" INTEGER NOT NULL DEFAULT 0,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "dust" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CurrencyBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurrencyTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurrencyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "UserCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceLP" INTEGER,
    "pricePP" INTEGER,
    "pityThreshold" INTEGER,
    "pityGuaranteedRarity" TEXT,

    CONSTRAINT "PackType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackDropRate" (
    "id" TEXT NOT NULL,
    "packTypeId" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PackDropRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PityCounter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packTypeId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PityCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CurrencyBalance_userId_key" ON "CurrencyBalance"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserCard_userId_playerId_key" ON "UserCard"("userId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "PackType_name_key" ON "PackType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PityCounter_userId_packTypeId_key" ON "PityCounter"("userId", "packTypeId");

-- AddForeignKey
ALTER TABLE "CurrencyBalance" ADD CONSTRAINT "CurrencyBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrencyTransaction" ADD CONSTRAINT "CurrencyTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCard" ADD CONSTRAINT "UserCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCard" ADD CONSTRAINT "UserCard_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackDropRate" ADD CONSTRAINT "PackDropRate_packTypeId_fkey" FOREIGN KEY ("packTypeId") REFERENCES "PackType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PityCounter" ADD CONSTRAINT "PityCounter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PityCounter" ADD CONSTRAINT "PityCounter_packTypeId_fkey" FOREIGN KEY ("packTypeId") REFERENCES "PackType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
