CREATE TABLE "devices" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "history" (
	"user_id" uuid NOT NULL,
	"id" text NOT NULL,
	"receipt_id" text NOT NULL,
	"store" text DEFAULT '' NOT NULL,
	"date" text DEFAULT '' NOT NULL,
	"cubes" integer DEFAULT 0 NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"swaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"receipt" jsonb,
	"updated_at" bigint DEFAULT 0 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "history_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "link_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"adults" integer DEFAULT 1 NOT NULL,
	"kids" integer DEFAULT 0 NOT NULL,
	"onboarded" boolean DEFAULT false NOT NULL,
	"seen" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_items" (
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"instead" text DEFAULT '' NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"updated_at" bigint DEFAULT 0 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "shop_items_user_id_name_pk" PRIMARY KEY("user_id","name")
);
--> statement-breakpoint
CREATE TABLE "stats" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"barcodes" integer DEFAULT 0 NOT NULL,
	"shop_done" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history" ADD CONSTRAINT "history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_codes" ADD CONSTRAINT "link_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_items" ADD CONSTRAINT "shop_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stats" ADD CONSTRAINT "stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "devices_user_idx" ON "devices" USING btree ("user_id");