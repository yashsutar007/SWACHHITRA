-- =========================================================
-- SWACHHITRA DATABASE SCHEMA
-- =========================================================
-- Purpose:
--   Rebuild the application tables cleanly while PRESERVING
--   the existing `users` table and its authentication data.
--
-- Current database state expected before running this file:
--   users table exists
--   other application tables may or may not exist
--
-- IMPORTANT:
--   This file intentionally DROPS every application table except
--   `users` and recreates them from scratch.
--
--   It does NOT drop or recreate `users`.
--
-- Main Inspector model:
--   user -> profile -> zone/ward scope
--   route -> zone/ward
--   route_assignment -> route + vehicle + driver
--   vehicle is NOT directly assigned to a ward
--
-- Vehicle image support:
--   vehicles.image_path stores the uploaded image path/URL.
--   Actual upload handling will be added in the server code later.
-- =========================================================

CREATE DATABASE IF NOT EXISTS swachhitra
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE swachhitra;


-- =========================================================
-- 1. CLEAN REBUILD OF NON-AUTHENTICATION TABLES
-- =========================================================

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS complaints;
DROP TABLE IF EXISTS collections;
DROP TABLE IF EXISTS route_stops;
DROP TABLE IF EXISTS route_assignments;
DROP TABLE IF EXISTS routes;
DROP TABLE IF EXISTS vehicles;
DROP TABLE IF EXISTS drivers;
DROP TABLE IF EXISTS user_profiles;
DROP TABLE IF EXISTS wards;
DROP TABLE IF EXISTS zones;

SET FOREIGN_KEY_CHECKS = 1;


-- =========================================================
-- 2. EXISTING USERS TABLE
-- =========================================================
-- DO NOT CREATE, DROP, OR MODIFY `users` here.
--
-- Your existing row such as:
--   inspector@example.com
-- must remain untouched.
--
-- Expected columns:
--   id
--   email
--   password_hash
--   role
--   status
--   created_at
--   updated_at
-- =========================================================


-- =========================================================
-- 3. ZONES
-- =========================================================

CREATE TABLE zones (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    zone_code VARCHAR(30) NOT NULL,
    zone_name VARCHAR(100) NOT NULL,

    status ENUM(
        'active',
        'inactive'
    ) NOT NULL DEFAULT 'active',

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_zones_code (zone_code),

    KEY idx_zones_name (zone_name),
    KEY idx_zones_status (status)
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE = utf8mb4_unicode_ci;


-- =========================================================
-- 4. WARDS
-- Every ward belongs to exactly one zone.
-- =========================================================

CREATE TABLE wards (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    zone_id BIGINT UNSIGNED NOT NULL,

    ward_number INT UNSIGNED NOT NULL,
    ward_code VARCHAR(30) NOT NULL,
    ward_name VARCHAR(120) NOT NULL,

    status ENUM(
        'active',
        'inactive'
    ) NOT NULL DEFAULT 'active',

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_wards_code (ward_code),

    UNIQUE KEY uq_wards_zone_number (
        zone_id,
        ward_number
    ),

    -- Required so routes/profiles can verify that a ward
    -- belongs to the same zone selected by the record.
    UNIQUE KEY uq_wards_id_zone (
        id,
        zone_id
    ),

    KEY idx_wards_zone (zone_id),
    KEY idx_wards_status (status),

    CONSTRAINT fk_wards_zone
        FOREIGN KEY (zone_id)
        REFERENCES zones(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE = utf8mb4_unicode_ci;


-- =========================================================
-- 5. USER PROFILES
--
-- Stores personal/official information plus the relational
-- operational scope used by role-based dashboards.
-- =========================================================

CREATE TABLE user_profiles (
    user_id BIGINT UNSIGNED NOT NULL,

    full_name VARCHAR(120) NOT NULL,
    mobile_number VARCHAR(20) NULL,

    official_email VARCHAR(190) NULL,
    employee_id VARCHAR(60) NULL,

    department VARCHAR(120) NULL,
    designation VARCHAR(120) NULL,

    office_location VARCHAR(180) NULL,
    working_shift VARCHAR(50) NULL,
    official_contact_number VARCHAR(20) NULL,

    address VARCHAR(255) NULL,
    city VARCHAR(100) NULL,
    preferred_language VARCHAR(40) NULL,
    notification_preference VARCHAR(40) NULL,

    -- Relational operational scope.
    zone_id BIGINT UNSIGNED NULL,
    ward_id BIGINT UNSIGNED NULL,

    license_number VARCHAR(80) NULL,
    license_type VARCHAR(80) NULL,
    vehicle_number VARCHAR(50) NULL,

    jurisdiction VARCHAR(180) NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id),

    UNIQUE KEY uq_user_profiles_employee_id (employee_id),

    KEY idx_profiles_zone (zone_id),
    KEY idx_profiles_ward (ward_id),

    CONSTRAINT fk_user_profiles_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    -- Ensures the selected ward belongs to the selected zone.
    CONSTRAINT fk_user_profiles_ward_zone
        FOREIGN KEY (ward_id, zone_id)
        REFERENCES wards(id, zone_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE = utf8mb4_unicode_ci;


-- =========================================================
-- 6. DRIVERS
-- Driver records are independent operational records.
-- assigned_ward_id is allowed here because a driver can have
-- an operational ward assignment independent of a current route.
-- =========================================================

CREATE TABLE drivers (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    user_id BIGINT UNSIGNED NULL,

    employee_id VARCHAR(60) NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    mobile_number VARCHAR(20) NULL,
    email VARCHAR(190) NULL,

    license_number VARCHAR(80) NULL,
    license_type VARCHAR(80) NULL,

    assigned_ward_id BIGINT UNSIGNED NULL,

    status ENUM(
        'available',
        'assigned',
        'on_break',
        'inactive'
    ) NOT NULL DEFAULT 'available',

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_drivers_user (user_id),
    UNIQUE KEY uq_drivers_employee_id (employee_id),

    KEY idx_drivers_ward (assigned_ward_id),
    KEY idx_drivers_status (status),

    CONSTRAINT fk_drivers_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_drivers_ward
        FOREIGN KEY (assigned_ward_id)
        REFERENCES wards(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE = utf8mb4_unicode_ci;


-- =========================================================
-- 7. VEHICLES
--
-- IMPORTANT:
--   There is NO assigned_ward_id column here.
--
--   A vehicle's current operational scope is determined by its
--   route assignment:
--
--      vehicle -> route_assignment -> route -> zone/ward
--
-- image_path is reserved for the later upload feature.
-- =========================================================

CREATE TABLE vehicles (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    vehicle_number VARCHAR(50) NOT NULL,
    registration_number VARCHAR(50) NULL,

    vehicle_type VARCHAR(60) NOT NULL,
    make VARCHAR(80) NULL,

    capacity_tons DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    current_load_tons DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    current_load_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,

    eta_minutes INT UNSIGNED NULL,

    status ENUM(
        'available',
        'en_route',
        'collecting',
        'delayed',
        'maintenance',
        'inactive'
    ) NOT NULL DEFAULT 'available',

    current_latitude DECIMAL(10,7) NULL,
    current_longitude DECIMAL(10,7) NULL,
    last_location_at DATETIME NULL,

    -- Uploaded vehicle image path or URL.
    image_path VARCHAR(255) NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_vehicles_number (vehicle_number),
    UNIQUE KEY uq_vehicles_registration (registration_number),

    KEY idx_vehicles_status (status)
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE = utf8mb4_unicode_ci;


-- =========================================================
-- 8. ROUTES
-- One route belongs to one zone and one ward.
-- =========================================================

CREATE TABLE routes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    route_code VARCHAR(30) NOT NULL,
    route_name VARCHAR(150) NOT NULL,

    zone_id BIGINT UNSIGNED NOT NULL,
    ward_id BIGINT UNSIGNED NOT NULL,

    status ENUM(
        'scheduled',
        'starting',
        'active',
        'delayed',
        'completed',
        'cancelled'
    ) NOT NULL DEFAULT 'scheduled',

    start_point VARCHAR(200) NULL,
    end_point VARCHAR(200) NULL,

    estimated_distance_km DECIMAL(8,2) NULL,
    estimated_duration_minutes INT UNSIGNED NULL,

    total_stops INT UNSIGNED NOT NULL DEFAULT 0,
    completed_stops INT UNSIGNED NOT NULL DEFAULT 0,
    delay_minutes INT NOT NULL DEFAULT 0,

    scheduled_start_time DATETIME NULL,
    scheduled_end_time DATETIME NULL,

    created_by BIGINT UNSIGNED NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_routes_code (route_code),

    KEY idx_routes_zone (zone_id),
    KEY idx_routes_ward (ward_id),
    KEY idx_routes_status (status),
    KEY idx_routes_created_by (created_by),

    CONSTRAINT fk_routes_zone
        FOREIGN KEY (zone_id)
        REFERENCES zones(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    -- Ensures the selected ward belongs to the same zone.
    CONSTRAINT fk_routes_ward_zone
        FOREIGN KEY (ward_id, zone_id)
        REFERENCES wards(id, zone_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_routes_created_by
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE = utf8mb4_unicode_ci;


-- =========================================================
-- 9. ROUTE STOPS
-- =========================================================

CREATE TABLE route_stops (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    route_id BIGINT UNSIGNED NOT NULL,

    stop_order INT UNSIGNED NOT NULL,
    stop_name VARCHAR(150) NOT NULL,
    address VARCHAR(255) NULL,

    latitude DECIMAL(10,7) NULL,
    longitude DECIMAL(10,7) NULL,

    status ENUM(
        'pending',
        'in_progress',
        'collected',
        'skipped'
    ) NOT NULL DEFAULT 'pending',

    collected_at DATETIME NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_route_stops_order (
        route_id,
        stop_order
    ),

    KEY idx_route_stops_status (status),

    CONSTRAINT fk_route_stops_route
        FOREIGN KEY (route_id)
        REFERENCES routes(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE = utf8mb4_unicode_ci;


-- =========================================================
-- 10. ROUTE ASSIGNMENTS
-- Connects a route to one vehicle and one driver.
-- =========================================================

CREATE TABLE route_assignments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    assignment_code VARCHAR(50) NOT NULL,

    route_id BIGINT UNSIGNED NOT NULL,
    vehicle_id BIGINT UNSIGNED NOT NULL,
    driver_id BIGINT UNSIGNED NOT NULL,

    assigned_by BIGINT UNSIGNED NOT NULL,

    status ENUM(
        'assigned',
        'active',
        'delayed',
        'completed',
        'cancelled'
    ) NOT NULL DEFAULT 'assigned',

    assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME NULL,
    completed_at DATETIME NULL,
    unassigned_at DATETIME NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_route_assignments_code (assignment_code),

    KEY idx_assignments_route (route_id),
    KEY idx_assignments_vehicle (vehicle_id),
    KEY idx_assignments_driver (driver_id),
    KEY idx_assignments_status (status),

    CONSTRAINT fk_assignments_route
        FOREIGN KEY (route_id)
        REFERENCES routes(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_assignments_vehicle
        FOREIGN KEY (vehicle_id)
        REFERENCES vehicles(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_assignments_driver
        FOREIGN KEY (driver_id)
        REFERENCES drivers(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_assignments_user
        FOREIGN KEY (assigned_by)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE = utf8mb4_unicode_ci;


-- =========================================================
-- 11. COLLECTIONS
-- Records actual waste collection work.
-- =========================================================

CREATE TABLE collections (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    route_id BIGINT UNSIGNED NOT NULL,
    route_stop_id BIGINT UNSIGNED NULL,
    ward_id BIGINT UNSIGNED NOT NULL,

    vehicle_id BIGINT UNSIGNED NULL,
    driver_id BIGINT UNSIGNED NULL,

    collection_date DATE NOT NULL,

    waste_tons DECIMAL(8,2) NOT NULL DEFAULT 0.00,

    status ENUM(
        'in_progress',
        'collected',
        'skipped'
    ) NOT NULL DEFAULT 'in_progress',

    notes TEXT NULL,
    collected_at DATETIME NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    KEY idx_collections_route (route_id),
    KEY idx_collections_stop (route_stop_id),
    KEY idx_collections_ward (ward_id),
    KEY idx_collections_date (collection_date),
    KEY idx_collections_status (status),

    CONSTRAINT fk_collections_route
        FOREIGN KEY (route_id)
        REFERENCES routes(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_collections_route_stop
        FOREIGN KEY (route_stop_id)
        REFERENCES route_stops(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_collections_ward
        FOREIGN KEY (ward_id)
        REFERENCES wards(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_collections_vehicle
        FOREIGN KEY (vehicle_id)
        REFERENCES vehicles(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_collections_driver
        FOREIGN KEY (driver_id)
        REFERENCES drivers(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE = utf8mb4_unicode_ci;


-- =========================================================
-- 12. COMPLAINTS
-- Citizen-reported waste collection/service issues.
-- =========================================================

CREATE TABLE complaints (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    complaint_code VARCHAR(40) NOT NULL,

    citizen_user_id BIGINT UNSIGNED NULL,

    complaint_type VARCHAR(80) NOT NULL,
    description TEXT NOT NULL,
    location_text VARCHAR(255) NULL,

    ward_id BIGINT UNSIGNED NULL,

    latitude DECIMAL(10,7) NULL,
    longitude DECIMAL(10,7) NULL,

    priority ENUM(
        'low',
        'medium',
        'high',
        'critical'
    ) NOT NULL DEFAULT 'medium',

    status ENUM(
        'open',
        'in_progress',
        'resolved',
        'cancelled'
    ) NOT NULL DEFAULT 'open',

    assigned_vehicle_id BIGINT UNSIGNED NULL,
    assigned_driver_id BIGINT UNSIGNED NULL,

    reported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_complaints_code (complaint_code),

    KEY idx_complaints_citizen (citizen_user_id),
    KEY idx_complaints_ward (ward_id),
    KEY idx_complaints_priority (priority),
    KEY idx_complaints_status (status),
    KEY idx_complaints_vehicle (assigned_vehicle_id),
    KEY idx_complaints_driver (assigned_driver_id),
    KEY idx_complaints_reported_at (reported_at),

    CONSTRAINT fk_complaints_citizen
        FOREIGN KEY (citizen_user_id)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_complaints_ward
        FOREIGN KEY (ward_id)
        REFERENCES wards(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_complaints_vehicle
        FOREIGN KEY (assigned_vehicle_id)
        REFERENCES vehicles(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_complaints_driver
        FOREIGN KEY (assigned_driver_id)
        REFERENCES drivers(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE = utf8mb4_unicode_ci;


-- =========================================================
-- 13. NOTIFICATIONS
-- =========================================================

CREATE TABLE notifications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    recipient_user_id BIGINT UNSIGNED NOT NULL,

    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,

    notification_type VARCHAR(50) NOT NULL DEFAULT 'general',

    priority ENUM(
        'low',
        'medium',
        'high'
    ) NOT NULL DEFAULT 'medium',

    is_read TINYINT(1) NOT NULL DEFAULT 0,
    read_at DATETIME NULL,

    related_route_id BIGINT UNSIGNED NULL,
    related_complaint_id BIGINT UNSIGNED NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    KEY idx_notifications_recipient (recipient_user_id),
    KEY idx_notifications_read (
        recipient_user_id,
        is_read
    ),
    KEY idx_notifications_route (related_route_id),
    KEY idx_notifications_complaint (related_complaint_id),

    CONSTRAINT fk_notifications_recipient
        FOREIGN KEY (recipient_user_id)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_notifications_route
        FOREIGN KEY (related_route_id)
        REFERENCES routes(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_notifications_complaint
        FOREIGN KEY (related_complaint_id)
        REFERENCES complaints(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE = utf8mb4_unicode_ci;


-- =========================================================
-- END OF SCHEMA
-- =========================================================
