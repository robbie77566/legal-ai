# Row-Level Security (RLS) Implementation

To ensure strict data isolation between tenants, we use PostgreSQL Row-Level Security.

## 1. Session Variable
We use a session variable `app.current_tenant_id` to store the tenant ID of the currently authenticated user.

## 2. Enabling RLS
For every table that contains tenant-specific data (e.g., `Case`, `Document`, `AuditLog`), we run the following SQL:

```sql
-- Enable RLS on the table
ALTER TABLE "Case" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

-- Create policies for data isolation
CREATE POLICY tenant_isolation_policy ON "Case"
  USING ("tenantId" = current_setting('app.current_tenant_id'));

CREATE POLICY tenant_isolation_policy ON "Document"
  USING (EXISTS (
    SELECT 1 FROM "Case" c
    WHERE c.id = "caseId" AND c."tenantId" = current_setting('app.current_tenant_id')
  ));

CREATE POLICY tenant_isolation_policy ON "AuditLog"
  USING ("caseId" IN (
    SELECT id FROM "Case" WHERE "tenantId" = current_setting('app.current_tenant_id')
  ));
```

## 3. Prisma Integration
The `getTenantPrisma(tenantId)` function in `packages/database` automatically sets this session variable before executing any query.

```typescript
await prisma.$executeRawUnsafe(`SET app.current_tenant_id = '${tenantId}'`)
```

## 4. Immutable Audit Log Triggers
To prevent any manual tampering with the audit logs, we implement PostgreSQL triggers that block `UPDATE` and `DELETE` operations on the `AuditLog` table.

```sql
CREATE OR REPLACE FUNCTION block_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_immutability_trigger
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW
EXECUTE FUNCTION block_audit_log_modification();
```
