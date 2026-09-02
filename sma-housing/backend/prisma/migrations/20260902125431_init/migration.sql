-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "college" TEXT,
    "building" TEXT,
    "room" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "joined" TEXT,
    "emergency" TEXT,
    "photo_key" TEXT
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "floors" INTEGER NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "building_id" TEXT,
    "floor" INTEGER,
    "number" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 2,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "allocations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "student_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "from" TEXT,
    "to" TEXT,
    "note" TEXT
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Unknown',
    "note" TEXT,
    "by" TEXT,
    "at" TEXT
);

-- CreateTable
CREATE TABLE "movements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "student_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "at" TEXT NOT NULL,
    "expected_return" TEXT,
    "returned_at" TEXT,
    "purpose" TEXT,
    "by" TEXT,
    "late" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "violations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "student_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" TEXT,
    "time" TEXT,
    "location" TEXT,
    "description" TEXT,
    "staff" TEXT,
    "action" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "attachments" TEXT,
    "history" TEXT
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "student_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sub" TEXT,
    "title" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Submitted',
    "assignee" TEXT,
    "priority" TEXT,
    "created_at" TEXT,
    "responded_at" TEXT,
    "resolved_at" TEXT,
    "attachments" TEXT,
    "comments" TEXT
);

-- CreateTable
CREATE TABLE "requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "student_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Submitted',
    "created_at" TEXT,
    "decided_at" TEXT,
    "history" TEXT
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "student_id" TEXT,
    "type" TEXT,
    "name" TEXT NOT NULL,
    "uploaded_at" TEXT,
    "by" TEXT,
    "size" TEXT,
    "file_key" TEXT
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "mime" TEXT,
    "size" INTEGER,
    "data" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "calendar" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "at" TEXT NOT NULL,
    "type" TEXT,
    "title" TEXT,
    "body" TEXT,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "audit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "at" TEXT NOT NULL,
    "user" TEXT,
    "role" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entity_id" TEXT,
    "details" TEXT
);

-- CreateTable
CREATE TABLE "master" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "from" TEXT,
    "to" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "desc" TEXT,
    "perms" TEXT NOT NULL DEFAULT '{}',
    "system" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "username" TEXT,
    "password_hash" TEXT,
    "entra_oid" TEXT
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "students_status_idx" ON "students"("status");

-- CreateIndex
CREATE INDEX "rooms_building_id_idx" ON "rooms"("building_id");

-- CreateIndex
CREATE INDEX "allocations_student_id_idx" ON "allocations"("student_id");

-- CreateIndex
CREATE INDEX "attendance_date_idx" ON "attendance"("date");

-- CreateIndex
CREATE INDEX "attendance_student_id_idx" ON "attendance"("student_id");

-- CreateIndex
CREATE INDEX "movements_student_id_idx" ON "movements"("student_id");

-- CreateIndex
CREATE INDEX "violations_student_id_idx" ON "violations"("student_id");

-- CreateIndex
CREATE INDEX "complaints_student_id_idx" ON "complaints"("student_id");

-- CreateIndex
CREATE INDEX "requests_student_id_idx" ON "requests"("student_id");

-- CreateIndex
CREATE INDEX "documents_student_id_idx" ON "documents"("student_id");

-- CreateIndex
CREATE INDEX "calendar_date_idx" ON "calendar"("date");

-- CreateIndex
CREATE INDEX "audit_at_idx" ON "audit"("at");

-- CreateIndex
CREATE INDEX "master_type_idx" ON "master"("type");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
