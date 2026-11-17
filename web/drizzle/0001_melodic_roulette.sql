CREATE TABLE "price_points" (
	"user_id" uuid NOT NULL,
	"entry_id" text NOT NULL,
	"category" text NOT NULL,
	"store" text NOT NULL,
	"unit_price" integer NOT NULL,
	"unit" text NOT NULL,
	"seen_on" text NOT NULL,
	CONSTRAINT "price_points_user_id_entry_id_category_pk" PRIMARY KEY("user_id","entry_id","category")
);
--> statement-breakpoint
ALTER TABLE "price_points" ADD CONSTRAINT "price_points_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_points_cat_idx" ON "price_points" USING btree ("category","store");