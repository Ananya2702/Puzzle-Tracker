CREATE TABLE "achievements" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"icon" text NOT NULL,
	"unlocked" boolean DEFAULT false NOT NULL,
	"unlocked_date" text
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"pieces" integer NOT NULL,
	"target_time_seconds" integer NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"achieved" boolean DEFAULT false NOT NULL,
	"achieved_date" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_accounts" (
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"user_id" integer NOT NULL,
	CONSTRAINT "oauth_accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "puzzles" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand" text DEFAULT '' NOT NULL,
	"title" text NOT NULL,
	"piece_count" integer NOT NULL,
	"image_url" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"user_id" integer NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "settings_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "solves" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"puzzle_id" integer,
	"date" text NOT NULL,
	"pieces" integer NOT NULL,
	"time_seconds" integer NOT NULL,
	"scaled_time_seconds" real NOT NULL,
	"puzzle_name" text DEFAULT '' NOT NULL,
	"brand" text DEFAULT '' NOT NULL,
	"difficulty_rating" integer DEFAULT 3 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"tags" text DEFAULT '' NOT NULL,
	"is_personal_best" boolean DEFAULT false NOT NULL,
	"puzzle_type" text DEFAULT 'solo' NOT NULL,
	"first_attempt" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"source_id" text,
	"community_avg_time" integer,
	"community_best_time" integer,
	"player_rank" integer,
	"community_solvers" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "splits" (
	"id" serial PRIMARY KEY NOT NULL,
	"solve_id" integer NOT NULL,
	"phase" text NOT NULL,
	"seconds" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"theme" text DEFAULT 'midnight' NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "puzzles" ADD CONSTRAINT "puzzles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solves" ADD CONSTRAINT "solves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solves" ADD CONSTRAINT "solves_puzzle_id_puzzles_id_fk" FOREIGN KEY ("puzzle_id") REFERENCES "public"."puzzles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "splits" ADD CONSTRAINT "splits_solve_id_solves_id_fk" FOREIGN KEY ("solve_id") REFERENCES "public"."solves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_achievements_user_code" ON "achievements" USING btree ("user_id","code");--> statement-breakpoint
CREATE INDEX "idx_puzzles_piece_count" ON "puzzles" USING btree ("piece_count");--> statement-breakpoint
CREATE INDEX "idx_solves_user_date" ON "solves" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "idx_solves_user_pieces" ON "solves" USING btree ("user_id","pieces");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_solves_user_source" ON "solves" USING btree ("user_id","source_id");--> statement-breakpoint
CREATE INDEX "idx_splits_solve" ON "splits" USING btree ("solve_id");