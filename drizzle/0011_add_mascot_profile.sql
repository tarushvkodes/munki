CREATE TABLE `mascot_profile` (
  `id` integer PRIMARY KEY NOT NULL,
  `name` text DEFAULT 'Munki' NOT NULL,
  `spent_xp` integer DEFAULT 0 NOT NULL,
  `owned_accessory_ids_json` text DEFAULT '[]' NOT NULL,
  `equipped_hat` text,
  `equipped_glasses` text,
  `equipped_outfit` text,
  `equipped_background` text,
  `last_interaction_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
