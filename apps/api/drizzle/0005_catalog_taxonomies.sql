CREATE TABLE "product_taxons" (
	"product_id" uuid NOT NULL,
	"taxon_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_taxons_product_id_taxon_id_pk" PRIMARY KEY("product_id","taxon_id")
);
--> statement-breakpoint
CREATE TABLE "taxonomies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "taxonomies_slug_format" CHECK ("taxonomies"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "taxons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"taxonomy_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"path" "ltree" NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "taxons_slug_format" CHECK ("taxons"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
ALTER TABLE "product_taxons" ADD CONSTRAINT "product_taxons_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_taxons" ADD CONSTRAINT "product_taxons_taxon_id_taxons_id_fk" FOREIGN KEY ("taxon_id") REFERENCES "public"."taxons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxons" ADD CONSTRAINT "taxons_taxonomy_id_taxonomies_id_fk" FOREIGN KEY ("taxonomy_id") REFERENCES "public"."taxonomies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxons" ADD CONSTRAINT "taxons_parent_id_taxons_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."taxons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_taxons_taxon_id_idx" ON "product_taxons" USING btree ("taxon_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomies_slug_unique" ON "taxonomies" USING btree ("slug") WHERE "taxonomies"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "taxons_path_unique" ON "taxons" USING btree ("taxonomy_id","path") WHERE "taxons"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "taxons_path_gist" ON "taxons" USING gist ("path");