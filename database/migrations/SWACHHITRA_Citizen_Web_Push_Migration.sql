-- SWACHHITRA Citizen-only Web Push subscriptions.
-- Run once against the Aiven `swachhitra` database using a migration/admin
-- account that has CREATE TABLE permission. Do not run with the app's
-- least-privilege `swachhitra_app` account if it lacks DDL grants.

CREATE TABLE IF NOT EXISTS `citizen_push_subscriptions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `endpoint_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `endpoint` text COLLATE utf8mb4_bin NOT NULL,
  `p256dh_key` varchar(200) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `auth_secret` varchar(200) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `expiration_time` bigint unsigned DEFAULT NULL,
  `disabled_at` datetime DEFAULT NULL,
  `last_success_at` datetime DEFAULT NULL,
  `last_error_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_citizen_push_endpoint_hash` (`endpoint_hash`),
  KEY `idx_citizen_push_user_active` (`user_id`, `disabled_at`),
  CONSTRAINT `fk_citizen_push_subscription_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
