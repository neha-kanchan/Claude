-- SMA Housing System - normalized schema (v2, matches the SPA data shapes 1:1).
-- Portable SQL: runs unchanged on PostgreSQL and SQLite. All identifiers quoted.
-- Every table carries "env" ('prod' | 'test'). Dates ISO-8601 text; flags integer 0/1.

create table if not exists "students" (
  "env" text not null, "id" text not null,
  "name" text not null, "email" text, "phone" text, "college" text,
  "building" text, "room" text, "status" text default 'Active',
  "joined" text, "emergency" text, "photo_key" text,
  primary key ("env","id")
);

create table if not exists "buildings" (
  "env" text not null, "id" text not null,
  "name" text not null, "floors" integer,
  primary key ("env","id")
);

create table if not exists "rooms" (
  "env" text not null, "id" text not null,
  "building_id" text, "floor" integer, "number" text,
  "capacity" integer default 2, "active" integer default 1,
  primary key ("env","id")
);

create table if not exists "allocations" (
  "env" text not null, "id" text not null,
  "student_id" text not null, "room_id" text not null,
  "from" text, "to" text, "note" text,
  primary key ("env","id")
);

create table if not exists "attendance" (
  "env" text not null, "id" text not null,
  "date" text not null, "student_id" text not null,
  "status" text default 'Unknown', "note" text, "by" text, "at" text,
  primary key ("env","id")
);
create index if not exists "attendance_date_idx" on "attendance" ("env","date");

create table if not exists "movements" (
  "env" text not null, "id" text not null,
  "student_id" text not null, "type" text not null,
  "at" text not null, "expected_return" text, "returned_at" text,
  "purpose" text, "by" text, "late" integer default 0,
  primary key ("env","id")
);

create table if not exists "violations" (
  "env" text not null, "id" text not null,
  "student_id" text not null, "type" text not null,
  "date" text, "time" text, "location" text, "description" text,
  "staff" text, "action" text, "status" text default 'Open',
  "attachments" text, "history" text,
  primary key ("env","id")
);

create table if not exists "complaints" (
  "env" text not null, "id" text not null,
  "student_id" text not null, "category" text not null, "sub" text,
  "title" text, "description" text, "status" text default 'Submitted',
  "assignee" text, "priority" text,
  "created_at" text, "responded_at" text, "resolved_at" text,
  "attachments" text, "comments" text,
  primary key ("env","id")
);

create table if not exists "requests" (
  "env" text not null, "id" text not null,
  "student_id" text not null, "type" text not null, "details" text,
  "status" text default 'Submitted', "created_at" text, "decided_at" text,
  "history" text,
  primary key ("env","id")
);

create table if not exists "documents" (
  "env" text not null, "id" text not null,
  "student_id" text, "type" text, "name" text not null,
  "uploaded_at" text, "by" text, "size" text, "file_key" text,
  primary key ("env","id")
);

-- Full file bodies (data URLs), keyed by the SPA's file key. Requirement 5.
create table if not exists "files" (
  "env" text not null, "id" text not null,
  "name" text, "mime" text, "size" integer, "data" text not null,
  primary key ("env","id")
);

create table if not exists "calendar" (
  "env" text not null, "id" text not null,
  "date" text not null, "title" text not null, "type" text,
  primary key ("env","id")
);

create table if not exists "notifications" (
  "env" text not null, "id" text not null,
  "at" text not null, "type" text, "title" text, "body" text,
  "link" text, "read" integer default 0,
  primary key ("env","id")
);

create table if not exists "audit" (
  "env" text not null, "id" text not null,
  "at" text not null, "user" text, "role" text,
  "action" text not null, "entity" text, "entity_id" text, "details" text,
  primary key ("env","id")
);
create index if not exists "audit_at_idx" on "audit" ("env","at");

create table if not exists "master" (
  "env" text not null, "id" text not null,
  "type" text not null, "value" text not null,
  "from" text, "to" text, "active" integer default 1,
  primary key ("env","id")
);

create table if not exists "roles" (
  "env" text not null, "id" text not null,
  "name" text not null, "desc" text,
  "perms" text not null, "system" integer default 0,
  primary key ("env","id")
);

create table if not exists "users" (
  "env" text not null, "id" text not null,
  "name" text not null, "email" text, "role" text not null,
  "active" integer default 1,
  "username" text, "password_hash" text, "entra_oid" text,
  primary key ("env","id")
);
create index if not exists "users_username_idx" on "users" ("env","username");

create table if not exists "settings" (
  "env" text not null, "key" text not null, "value" text,
  primary key ("env","key")
);
