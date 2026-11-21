CREATE TYPE "public"."staff_role" AS ENUM('owner', 'admin', 'florist', 'courier');--> statement-breakpoint
CREATE TABLE "staff_locations" (
	"user_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_locations_user_id_location_id_pk" PRIMARY KEY("user_id","location_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "staff_role" NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_locations" ADD CONSTRAINT "staff_locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_locations_location_id_idx" ON "staff_locations" USING btree ("location_id");