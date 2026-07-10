-- CreateTable
CREATE TABLE "DustShopPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "playerId" TEXT,
    "dustCost" INTEGER NOT NULL,
    "goldMonthKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DustShopPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DustShopPurchase_userId_goldMonthKey_key" ON "DustShopPurchase"("userId", "goldMonthKey");

-- AddForeignKey
ALTER TABLE "DustShopPurchase" ADD CONSTRAINT "DustShopPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DustShopPurchase" ADD CONSTRAINT "DustShopPurchase_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
