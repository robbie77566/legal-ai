-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "DocumentPage" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pageNo" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "dedupKind" TEXT,
    "ocrConfidence" DOUBLE PRECISION,
    "ocrProvider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentPage_documentId_idx" ON "DocumentPage"("documentId");

-- CreateIndex
CREATE INDEX "DocumentPage_contentHash_idx" ON "DocumentPage"("contentHash");

-- AddForeignKey
ALTER TABLE "DocumentPage" ADD CONSTRAINT "DocumentPage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "DocumentPage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentPage" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy_document_page ON "DocumentPage"
  USING ("documentId" IN (SELECT d.id FROM "Document" d JOIN "Case" c ON c.id = d."caseId" WHERE c."tenantId" = current_setting('app.current_tenant_id', true)))
  WITH CHECK ("documentId" IN (SELECT d.id FROM "Document" d JOIN "Case" c ON c.id = d."caseId" WHERE c."tenantId" = current_setting('app.current_tenant_id', true)));
