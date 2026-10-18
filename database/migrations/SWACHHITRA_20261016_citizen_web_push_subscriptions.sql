-- SWACHHITRA Citizen Web Push subscriptions
-- Additive and rerunnable. Apply to an existing database only after verifying
-- the target connection and taking a backup. Do NOT run schema.sql or seed.sql
-- against an existing production database.
-- Fresh databases receive this table from database/schema.sql.

CREATE TABLE IF NOT EXISTS `citizen_push_subscriptions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `endpoint_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `endpoint` TEXT COLLATE utf8mb4_bin NOT NULL,
  `p256dh_key` VARCHAR(200) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `auth_secret` VARCHAR(200) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `expiration_time` BIGINT UNSIGNED DEFAULT NULL,
  `disabled_at` DATETIME DEFAULT NULL,
  `last_success_at` DATETIME DEFAULT NULL,
  `last_error_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_citizen_push_endpoint_hash` (`endpoint_hash`),
  KEY `idx_citizen_push_user_active` (`user_id`, `disabled_at`),
  CONSTRAINT `fk_citizen_push_subscription_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verify after applying:
SELECT TABLE_NAME, ENGINE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'citizen_push_subscriptions';

SELECT COUNT(*) AS subscription_count FROM citizen_push_subscriptions;
