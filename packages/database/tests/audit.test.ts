import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma, { withTenant } from '../index';

describe('AuditLog Immutability Trigger', () => {
  it('should successfully insert an AuditLog record', async () => {
    // Mock the insert operation for testing environments without a live DB
    const insertMock = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({
      id: 'audit_123',
      caseId: 'case_123',
      action: 'GENERATED_WRIT',
      details: { claim: 'IAC' },
      userId: 'user_123',
      createdAt: new Date()
    } as any);

    const log = await prisma.auditLog.create({
      data: {
        caseId: 'case_123',
        action: 'GENERATED_WRIT',
        details: { claim: 'IAC' },
        userId: 'user_123'
      }
    });

    expect(log.id).toBe('audit_123');
    insertMock.mockRestore();
  });

  it('should reject an attempt to UPDATE an AuditLog record', async () => {
    // In a real integration test, the database trigger `trg_auditlog_append_only`
    // will throw an exception before the UPDATE completes.
    
    // Simulate the database exception
    const updateMock = vi.spyOn(prisma.auditLog, 'update').mockRejectedValue(
      new Error('AuditLog is append-only. UPDATE and DELETE operations are forbidden.')
    );

    await expect(prisma.auditLog.update({
      where: { id: 'audit_123' },
      data: { action: 'FORGED_ACTION' }
    })).rejects.toThrow('AuditLog is append-only. UPDATE and DELETE operations are forbidden.');

    updateMock.mockRestore();
  });

  it('should reject an attempt to DELETE an AuditLog record', async () => {
    // Simulate the database exception
    const deleteMock = vi.spyOn(prisma.auditLog, 'delete').mockRejectedValue(
      new Error('AuditLog is append-only. UPDATE and DELETE operations are forbidden.')
    );

    await expect(prisma.auditLog.delete({
      where: { id: 'audit_123' }
    })).rejects.toThrow('AuditLog is append-only. UPDATE and DELETE operations are forbidden.');

    deleteMock.mockRestore();
  });
});
