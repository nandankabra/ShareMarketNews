-- CreateTable
CREATE TABLE "Sector" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "constituentsFile" TEXT,
    "sortIndex" INTEGER NOT NULL DEFAULT 0,
    "lastLevel" REAL,
    "lastChangePercent" REAL,
    "levelAt" DATETIME,
    "constituentsSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Share" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "yahooSymbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isin" TEXT,
    "series" TEXT,
    "industry" TEXT,
    "yahooSector" TEXT,
    "yahooIndustry" TEXT,
    "lastPrice" REAL,
    "previousClose" REAL,
    "dayChange" REAL,
    "dayChangePercent" REAL,
    "dayHigh" REAL,
    "dayLow" REAL,
    "week52High" REAL,
    "week52Low" REAL,
    "volume" REAL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "quotedAt" DATETIME,
    "avgAbsChangePercent20d" REAL,
    "avgVolume20d" REAL,
    "statsAt" DATETIME,
    "rsi14" REAL,
    "atr14" REAL,
    "atrPercent" REAL,
    "sma20" REAL,
    "sma50" REAL,
    "sma200" REAL,
    "macdHist" REAL,
    "trendState" TEXT,
    "taAt" DATETIME,
    "levelsJson" TEXT,
    "levelsAt" DATETIME,
    "newsDayMovePct" TEXT,
    "quoteUnavailable" BOOLEAN NOT NULL DEFAULT false,
    "notFoundCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SectorMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sectorId" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SectorMembership_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SectorMembership_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "Share" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shareId" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "at" DATETIME NOT NULL,
    "open" REAL NOT NULL,
    "high" REAL NOT NULL,
    "low" REAL NOT NULL,
    "close" REAL NOT NULL,
    "volume" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceSnapshot_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "Share" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NewsArticle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dedupKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" TEXT,
    "publishedAt" DATETIME NOT NULL,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" TEXT,
    "polarity" TEXT,
    "confidence" REAL,
    "matchedTerms" TEXT
);

-- CreateTable
CREATE TABLE "ShareNewsMention" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shareId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "matchedQuery" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShareNewsMention_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "Share" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShareNewsMention_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "NewsArticle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CorporateEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "shareId" TEXT,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "eventDate" TEXT NOT NULL,
    "recordDate" TEXT,
    "description" TEXT NOT NULL,
    "raw" TEXT,
    "dedupKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CorporateEvent_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "Share" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OptionUnderlying" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "lotSize" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OptionChainSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "underlyingId" TEXT NOT NULL,
    "expiryDate" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL,
    "underlyingValue" REAL NOT NULL,
    "totalCeOi" REAL NOT NULL,
    "totalPeOi" REAL NOT NULL,
    "totalCeVolume" REAL NOT NULL,
    "totalPeVolume" REAL NOT NULL,
    "pcrOi" REAL NOT NULL,
    "pcrVolume" REAL NOT NULL,
    "maxPainStrike" REAL NOT NULL,
    "atmStrike" REAL NOT NULL,
    "atmIv" REAL,
    "oiResistance" REAL,
    "oiSupport" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OptionChainSnapshot_underlyingId_fkey" FOREIGN KEY ("underlyingId") REFERENCES "OptionUnderlying" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OptionStrike" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "strikePrice" REAL NOT NULL,
    "ceOi" REAL,
    "ceOiChange" REAL,
    "ceVolume" REAL,
    "ceIv" REAL,
    "ceLtp" REAL,
    "ceChange" REAL,
    "peOi" REAL,
    "peOiChange" REAL,
    "peVolume" REAL,
    "peIv" REAL,
    "peLtp" REAL,
    "peChange" REAL,
    "ceBuildup" TEXT,
    "peBuildup" TEXT,
    CONSTRAINT "OptionStrike_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "OptionChainSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shareId" TEXT NOT NULL,
    "note" TEXT,
    "sortIndex" INTEGER NOT NULL DEFAULT 0,
    "addedPrice" REAL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WatchlistItem_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "Share" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourceFetch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "lastAttemptAt" DATETIME,
    "lastSuccessAt" DATETIME,
    "lastStatus" TEXT,
    "lastError" TEXT,
    "itemCount" INTEGER,
    "durationMs" INTEGER,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "nextEligibleAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MarketSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeDate" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "niftyLevel" REAL,
    "niftyChangePercent" REAL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Sector_key_key" ON "Sector"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Sector_name_key" ON "Sector"("name");

-- CreateIndex
CREATE INDEX "Sector_sortIndex_idx" ON "Sector"("sortIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Share_symbol_key" ON "Share"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "Share_yahooSymbol_key" ON "Share"("yahooSymbol");

-- CreateIndex
CREATE INDEX "Share_quotedAt_idx" ON "Share"("quotedAt");

-- CreateIndex
CREATE INDEX "Share_lastViewedAt_idx" ON "Share"("lastViewedAt");

-- CreateIndex
CREATE INDEX "Share_quoteUnavailable_idx" ON "Share"("quoteUnavailable");

-- CreateIndex
CREATE INDEX "SectorMembership_shareId_idx" ON "SectorMembership"("shareId");

-- CreateIndex
CREATE INDEX "SectorMembership_lastSeenAt_idx" ON "SectorMembership"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "SectorMembership_sectorId_shareId_key" ON "SectorMembership"("sectorId", "shareId");

-- CreateIndex
CREATE INDEX "PriceSnapshot_shareId_interval_at_idx" ON "PriceSnapshot"("shareId", "interval", "at");

-- CreateIndex
CREATE INDEX "PriceSnapshot_interval_at_idx" ON "PriceSnapshot"("interval", "at");

-- CreateIndex
CREATE UNIQUE INDEX "PriceSnapshot_shareId_interval_at_key" ON "PriceSnapshot"("shareId", "interval", "at");

-- CreateIndex
CREATE UNIQUE INDEX "NewsArticle_dedupKey_key" ON "NewsArticle"("dedupKey");

-- CreateIndex
CREATE INDEX "NewsArticle_publishedAt_idx" ON "NewsArticle"("publishedAt");

-- CreateIndex
CREATE INDEX "NewsArticle_firstSeenAt_idx" ON "NewsArticle"("firstSeenAt");

-- CreateIndex
CREATE INDEX "ShareNewsMention_articleId_idx" ON "ShareNewsMention"("articleId");

-- CreateIndex
CREATE INDEX "ShareNewsMention_shareId_createdAt_idx" ON "ShareNewsMention"("shareId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShareNewsMention_shareId_articleId_key" ON "ShareNewsMention"("shareId", "articleId");

-- CreateIndex
CREATE UNIQUE INDEX "CorporateEvent_dedupKey_key" ON "CorporateEvent"("dedupKey");

-- CreateIndex
CREATE INDEX "CorporateEvent_eventDate_idx" ON "CorporateEvent"("eventDate");

-- CreateIndex
CREATE INDEX "CorporateEvent_shareId_eventDate_idx" ON "CorporateEvent"("shareId", "eventDate");

-- CreateIndex
CREATE INDEX "CorporateEvent_symbol_idx" ON "CorporateEvent"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "OptionUnderlying_symbol_key" ON "OptionUnderlying"("symbol");

-- CreateIndex
CREATE INDEX "OptionChainSnapshot_underlyingId_expiryDate_capturedAt_idx" ON "OptionChainSnapshot"("underlyingId", "expiryDate", "capturedAt");

-- CreateIndex
CREATE INDEX "OptionChainSnapshot_capturedAt_idx" ON "OptionChainSnapshot"("capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OptionChainSnapshot_underlyingId_expiryDate_capturedAt_key" ON "OptionChainSnapshot"("underlyingId", "expiryDate", "capturedAt");

-- CreateIndex
CREATE INDEX "OptionStrike_snapshotId_strikePrice_idx" ON "OptionStrike"("snapshotId", "strikePrice");

-- CreateIndex
CREATE UNIQUE INDEX "OptionStrike_snapshotId_strikePrice_key" ON "OptionStrike"("snapshotId", "strikePrice");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_shareId_key" ON "WatchlistItem"("shareId");

-- CreateIndex
CREATE INDEX "WatchlistItem_sortIndex_idx" ON "WatchlistItem"("sortIndex");

-- CreateIndex
CREATE UNIQUE INDEX "SourceFetch_source_key" ON "SourceFetch"("source");

-- CreateIndex
CREATE UNIQUE INDEX "MarketSnapshot_tradeDate_key" ON "MarketSnapshot"("tradeDate");
