-- SWACHHITRA Citizen Part 6: email verification and password recovery
-- Additive and rerunnable. Do NOT run database/schema.sql or database/seed.sql.
-- Existing Citizen accounts are treated as legacy-verified to preserve access.

CREATE TABLE IF NOT EXISTS citizen_account_security (
    user_id BIGINT UNSIGNED NOT NULL,
    email_verified_at DATETIME(3) NULL,
    session_version INT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (user_id),
    CONSTRAINT fk_citizen_account_security_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS citizen_account_tokens (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    purpose ENUM('email_verification', 'password_reset') NOT NULL,
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    used_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_citizen_account_tokens_hash (token_hash),
    KEY idx_citizen_account_tokens_user_purpose (user_id, purpose, used_at, expires_at),
    KEY idx_citizen_account_tokens_expiry (expires_at),
    CONSTRAINT fk_citizen_account_tokens_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Preserve existing Citizens' ability to sign in. Newly registered Citizens
-- receive a NULL email_verified_at and must verify their mailbox before login.
INSERT INTO citizen_account_security (user_id, email_verified_at, session_version)
SELECT id, UTC_TIMESTAMP(3), 0
FROM users
WHERE role = 'citizen'
ON DUPLICATE KEY UPDATE user_id = VALUES(user_id);

SELECT 'citizen_account_security' AS created_table, COUNT(*) AS rows_ready
FROM citizen_account_security;
SELECT 'citizen_account_tokens' AS created_table, COUNT(*) AS rows_ready
FROM citizen_account_tokens;
