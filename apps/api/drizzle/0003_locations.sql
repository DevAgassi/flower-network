CREATE TYPE "public"."location_kind" AS ENUM('store', 'warehouse');--> statement-breakpoint
CREATE TYPE "public"."location_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "location_hours" (
	"location_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL,
	CONSTRAINT "location_hours_location_id_weekday_pk" PRIMARY KEY("location_id","weekday"),
	CONSTRAINT "location_hours_weekday" CHECK ("location_hours"."weekday" between 1 and 7),
	CONSTRAINT "location_hours_interval" CHECK ("location_hours"."opens_at" < "location_hours"."closes_at")
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"kind" "location_kind" NOT NULL,
	"status" "location_status" DEFAULT 'active' NOT NULL,
	"address" varchar(500) NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"phone" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_latitude_range" CHECK ("locations"."latitude" between -90 and 90),
	CONSTRAINT "locations_longitude_range" CHECK ("locations"."longitude" between -180 and 180),
	CONSTRAINT "locations_coordinates_pair" CHECK (("locations"."latitude" is null) = ("locations"."longitude" is null)),
	CONSTRAINT "locations_store_coordinates" CHECK ("locations"."kind" <> 'store' or "locations"."latitude" is not null)
);
--> statement-breakpoint
ALTER TABLE "location_hours" ADD CONSTRAINT "location_hours_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "locations_name_unique" ON "locations" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "staff_locations" ADD CONSTRAINT "staff_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;