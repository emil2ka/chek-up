CREATE TABLE "audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corrections" (
	"family_id" uuid NOT NULL,
	"store" text NOT NULL,
	"raw" text NOT NULL,
	"item" jsonb NOT NULL,
	"updated_at" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "corrections_family_id_store_raw_pk" PRIMARY KEY("family_id","store","raw")
);
--> statement-breakpoint
CREATE TABLE "email_codes" (
	"email" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"adults" integer DEFAULT 1 NOT NULL,
	"kids" integer DEFAULT 0 NOT NULL,
	"goal" integer DEFAULT 0 NOT NULL,
	"updated_at" bigint DEFAULT 0 NOT NULL,
	"rev" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identities" (
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identities_provider_subject_pk" PRIMARY KEY("provider","subject")
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"family_id" uuid NOT NULL,
	"role" text DEFAULT 'adult' NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"family_id" uuid NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage" (
	"key" text NOT NULL,
	"day" text NOT NULL,
	"n" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_key_day_pk" PRIMARY KEY("key","day")
);
--> statement-breakpoint
CREATE TABLE "week_marks" (
	"family_id" uuid NOT NULL,
	"week" text NOT NULL,
	"state" text NOT NULL,
	"updated_at" bigint DEFAULT 0 NOT NULL,
	"rev" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "week_marks_family_id_week_pk" PRIMARY KEY("family_id","week")
);
--> statement-breakpoint
ALTER TABLE "history" DROP CONSTRAINT "history_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "price_points" DROP CONSTRAINT "price_points_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "shop_items" DROP CONSTRAINT "shop_items_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "history" ADD COLUMN "off" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "history" ADD COLUMN "tag" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "history" ADD COLUMN "priv" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "history" ADD COLUMN "author_id" uuid;--> statement-breakpoint
ALTER TABLE "history" ADD COLUMN "rev" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "lang" text DEFAULT 'ru' NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_items" ADD COLUMN "rev" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stats" ADD COLUMN "best_weeks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Перенос старых данных: у каждого пользователя появляется семья с тем же id, он — владелец, его чеки получают автора.
INSERT INTO "families" ("id", "adults", "kids", "updated_at", "rev", "created_at")
	SELECT u."id", coalesce(p."adults", 1), coalesce(p."kids", 0), coalesce(p."updated_at", 0), 1, u."created_at"
	FROM "users" u LEFT JOIN "profiles" p ON p."user_id" = u."id";--> statement-breakpoint
INSERT INTO "members" ("user_id", "family_id", "role", "joined_at") SELECT "id", "id", 'owner', "created_at" FROM "users";--> statement-breakpoint
UPDATE "history" SET "author_id" = "user_id", "rev" = 1;--> statement-breakpoint
UPDATE "shop_items" SET "rev" = 1;--> statement-breakpoint
ALTER TABLE "audit" ADD CONSTRAINT "audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_marks" ADD CONSTRAINT "week_marks_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_user_idx" ON "audit" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "identities_user_idx" ON "identities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "members_family_idx" ON "members" USING btree ("family_id");--> statement-breakpoint
ALTER TABLE "history" ADD CONSTRAINT "history_user_id_families_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history" ADD CONSTRAINT "history_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_points" ADD CONSTRAINT "price_points_user_id_families_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_items" ADD CONSTRAINT "shop_items_user_id_families_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "history_rev_idx" ON "history" USING btree ("user_id","rev");