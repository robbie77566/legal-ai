-- Support staff role (staff_console_access_model §4): sees every case's
-- customer-facing file — uploads, analysis, delivered reports — and can take
-- the unblocking actions (resume a stuck pipeline, mark a delay). Never money,
-- never deletion, never report approval.
-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SUPPORT';
