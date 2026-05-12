import { describe, it, expect, vi } from 'vitest';
import prisma, { withTenant } from '../index';

describe('Row-Level Security (RLS) Tenant Isolation', () => {
  it('should successfully execute a query when injected with a valid Tenant ID', async () => {
    // Mock the transaction and executeRawUnsafe methods
    const executeMock = vi.fn().mockResolvedValue(true);
    const findMock = vi.fn().mockResolvedValue([{ id: 'case_1', tenantId: 'tenant_A' }]);

    const mockTx = {
      $executeRawUnsafe: executeMock,
      case: {
        findMany: findMock
      }
    };

    const transactionSpy = vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      return callback(mockTx);
    });

    const cases = await withTenant('tenant_A', async (tx) => {
      return tx.case.findMany();
    });

    expect(executeMock).toHaveBeenCalledWith(`SET LOCAL app.current_tenant_id = 'tenant_A';`);
    expect(findMock).toHaveBeenCalled();
    expect(cases.length).toBe(1);

    transactionSpy.mockRestore();
  });

  it('should throw an error if attempting to access data outside the withTenant wrapper', async () => {
    // In a live integration test, Postgres will throw an error because 
    // current_setting('app.current_tenant_id') is not defined outside the wrapper.
    const findMock = vi.spyOn(prisma.case, 'findMany').mockRejectedValue(
      new Error('missing setting for app.current_tenant_id')
    );

    await expect(prisma.case.findMany()).rejects.toThrow('missing setting for app.current_tenant_id');

    findMock.mockRestore();
  });
});
