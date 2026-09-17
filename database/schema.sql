CREATE DATABASE IF NOT EXISTS swachhitra
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE swachhitra;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM(
    'deputy_commissioner',
    'assistant_commissioner',
    'sanitary_inspector',
    'driver',
    'citizen'
  ) NOT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id BIGINT UNSIGNED PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  mobile_number VARCHAR(20) NOT NULL,
  official_email VARCHAR(190) NULL,
  employee_id VARCHAR(60) NULL,
  assigned_ward VARCHAR(100) NULL,
  department VARCHAR(120) NULL,
  zone VARCHAR(100) NULL,
  office_location VARCHAR(180) NULL,
  working_shift VARCHAR(50) NULL,
  official_contact_number VARCHAR(20) NULL,
  address VARCHAR(255) NULL,
  city VARCHAR(100) NULL,
  ward VARCHAR(100) NULL,
  preferred_language VARCHAR(40) NULL,
  notification_preference VARCHAR(40) NULL,
  license_number VARCHAR(80) NULL,
  license_type VARCHAR(80) NULL,
  vehicle_number VARCHAR(50) NULL,
  designation VARCHAR(120) NULL,
  jurisdiction VARCHAR(180) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_profile_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_profiles_employee_id ON user_profiles(employee_id);
CREATE INDEX idx_profiles_zone ON user_profiles(zone);
