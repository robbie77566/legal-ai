-- Staff profile fields (ops /profile): first, last, phone. `name` remains the display name.
ALTER TABLE "User"
  ADD COLUMN "firstName" TEXT,
  ADD COLUMN "lastName" TEXT,
  ADD COLUMN "phone" TEXT;
