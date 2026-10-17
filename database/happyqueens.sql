CREATE DATABASE IF NOT EXISTS happyqueens CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE happyqueens;

CREATE TABLE IF NOT EXISTS users (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  first_name      VARCHAR(60)  NOT NULL,
  last_name       VARCHAR(60)  NOT NULL,
  contact_no      VARCHAR(15)  NOT NULL UNIQUE,
  email           VARCHAR(190) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NULL,
  role            ENUM('customer','admin') NOT NULL DEFAULT 'customer',
  is_verified     TINYINT(1)   NOT NULL DEFAULT 0,
  failed_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until    INT UNSIGNED NOT NULL DEFAULT 0,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS otp_codes (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  purpose    ENUM('register','reset') NOT NULL,
  code_hash  VARCHAR(255) NOT NULL,
  attempts   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  used       TINYINT(1) NOT NULL DEFAULT 0,
  created_at INT UNSIGNED NOT NULL,
  expires_at INT UNSIGNED NOT NULL,
  INDEX (user_id, purpose),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
