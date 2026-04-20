/*
  Warnings:

  - Added the required column `token_mint` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `token_symbol` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "token_mint" TEXT NOT NULL,
ADD COLUMN     "token_symbol" TEXT NOT NULL;
