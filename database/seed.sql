-- =========================================================
-- SWACHHITRA DEMO / SEED DATA
-- Version: 4.0
-- Smart Waste Collection and Route Management System
-- =========================================================
--
-- Purpose:
--   Populate development/demo data for the current database schema.
--
-- IMPORTANT:
--   1. All operational records in this file are DEMO DATA.
--   2. This file DOES NOT create, delete, or modify the users table.
--   3. The existing user inspector@example.com is used as the
--      Sanitary Inspector account.
--   4. Passwords are not created or changed here.
--   5. Run this file ONLY after database/schema.sql has succeeded.
--
-- Current expected authentication user:
--   id    = 1
--   email = inspector@example.com
--   role  = sanitary_inspector
-- =========================================================

USE swachhitra;

START TRANSACTION;


-- =========================================================
-- 1. ZONES
-- =========================================================
-- Central / North / South / East / West are application-level
-- development zones used by the SWACHHITRA UI.
-- =========================================================

INSERT INTO zones
    (zone_code, zone_name, status)
VALUES
    ('CENTRAL', 'Central Zone', 'active'),
    ('NORTH',   'North Zone',   'active'),
    ('SOUTH',   'South Zone',   'active'),
    ('EAST',    'East Zone',    'active'),
    ('WEST',    'West Zone',    'active')
ON DUPLICATE KEY UPDATE
    zone_name = VALUES(zone_name),
    status = VALUES(status);


-- =========================================================
-- 2. WARDS
-- =========================================================
-- The original SWACHHITRA project already used Ward 8, Ward 9
-- and Ward 14 in the Inspector Dashboard.
--
-- Ward 21 / 31 / 41 are development/demo wards added so that
-- every selectable zone has at least one ward in the reference
-- data used by the profile and Inspector flows.
-- These are NOT presented as real municipal ward assignments.
-- =========================================================

INSERT INTO wards
    (zone_id, ward_number, ward_code, ward_name, status)
SELECT
    z.id,
    8,
    'WARD-8',
    'Ward 8 (Market & Commercial)',
    'active'
FROM zones z
WHERE z.zone_code = 'CENTRAL'
ON DUPLICATE KEY UPDATE
    zone_id = VALUES(zone_id),
    ward_name = VALUES(ward_name),
    status = VALUES(status);


INSERT INTO wards
    (zone_id, ward_number, ward_code, ward_name, status)
SELECT
    z.id,
    14,
    'WARD-14',
    'Ward 14 (Mixed Density)',
    'active'
FROM zones z
WHERE z.zone_code = 'CENTRAL'
ON DUPLICATE KEY UPDATE
    zone_id = VALUES(zone_id),
    ward_name = VALUES(ward_name),
    status = VALUES(status);


INSERT INTO wards
    (zone_id, ward_number, ward_code, ward_name, status)
SELECT
    z.id,
    9,
    'WARD-9',
    'Ward 9 (Residential West)',
    'active'
FROM zones z
WHERE z.zone_code = 'WEST'
ON DUPLICATE KEY UPDATE
    zone_id = VALUES(zone_id),
    ward_name = VALUES(ward_name),
    status = VALUES(status);


INSERT INTO wards
    (zone_id, ward_number, ward_code, ward_name, status)
SELECT
    z.id,
    21,
    'WARD-21',
    'Ward 21 (North Demo Area)',
    'active'
FROM zones z
WHERE z.zone_code = 'NORTH'
ON DUPLICATE KEY UPDATE
    zone_id = VALUES(zone_id),
    ward_name = VALUES(ward_name),
    status = VALUES(status);


INSERT INTO wards
    (zone_id, ward_number, ward_code, ward_name, status)
SELECT
    z.id,
    31,
    'WARD-31',
    'Ward 31 (South Demo Area)',
    'active'
FROM zones z
WHERE z.zone_code = 'SOUTH'
ON DUPLICATE KEY UPDATE
    zone_id = VALUES(zone_id),
    ward_name = VALUES(ward_name),
    status = VALUES(status);


INSERT INTO wards
    (zone_id, ward_number, ward_code, ward_name, status)
SELECT
    z.id,
    41,
    'WARD-41',
    'Ward 41 (East Demo Area)',
    'active'
FROM zones z
WHERE z.zone_code = 'EAST'
ON DUPLICATE KEY UPDATE
    zone_id = VALUES(zone_id),
    ward_name = VALUES(ward_name),
    status = VALUES(status);


-- =========================================================
-- 3. EXISTING SANITARY INSPECTOR ACCOUNT
-- =========================================================
-- The existing users row is intentionally reused.
-- No profile row is created here.
-- The inspector will complete the profile manually after login.
-- The backend will save the submitted profile in user_profiles
-- and load it again on future logins.
-- =========================================================

SET @inspector_user_id = (
    SELECT id
    FROM users
    WHERE email = 'inspector@example.com'
      AND role = 'sanitary_inspector'
      AND status = 'active'
    LIMIT 1
);

SET @central_zone_id = (
    SELECT id
    FROM zones
    WHERE zone_code = 'CENTRAL'
    LIMIT 1
);

SET @ward8_id = (
    SELECT id
    FROM wards
    WHERE ward_code = 'WARD-8'
    LIMIT 1
);


-- =========================================================
-- 4. DRIVERS
-- =========================================================
-- Driver names and identifiers are based on the existing
-- Inspector Dashboard / seed data.
-- Driver status uses the CURRENT schema enum:
--   available / assigned / on_break / inactive
-- =========================================================

SET @ward9_id = (
    SELECT id
    FROM wards
    WHERE ward_code = 'WARD-9'
    LIMIT 1
);

SET @ward14_id = (
    SELECT id
    FROM wards
    WHERE ward_code = 'WARD-14'
    LIMIT 1
);


INSERT INTO drivers
    (
        employee_id,
        full_name,
        mobile_number,
        email,
        license_number,
        license_type,
        assigned_ward_id,
        status
    )
VALUES
    (
        'DRV-104',
        'Rajesh Kumar',
        '+91 98112-44210',
        'r.kumar@swachhitra.gov',
        'MH09DL104001',
        'HMV-Commercial',
        @ward8_id,
        'assigned'
    )
ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name),
    mobile_number = VALUES(mobile_number),
    email = VALUES(email),
    license_number = VALUES(license_number),
    license_type = VALUES(license_type),
    assigned_ward_id = VALUES(assigned_ward_id),
    status = VALUES(status);


INSERT INTO drivers
    (
        employee_id,
        full_name,
        mobile_number,
        email,
        license_number,
        license_type,
        assigned_ward_id,
        status
    )
VALUES
    (
        'DRV-118',
        'Sunil Verma',
        '+91 97220-33411',
        's.verma@swachhitra.gov',
        'MH09DL118002',
        'HMV-Commercial',
        @ward9_id,
        'assigned'
    )
ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name),
    mobile_number = VALUES(mobile_number),
    email = VALUES(email),
    license_number = VALUES(license_number),
    license_type = VALUES(license_type),
    assigned_ward_id = VALUES(assigned_ward_id),
    status = VALUES(status);


INSERT INTO drivers
    (
        employee_id,
        full_name,
        mobile_number,
        email,
        license_number,
        license_type,
        assigned_ward_id,
        status
    )
VALUES
    (
        'DEMO-DRV-001',
        'Amit Patil',
        '+91 90000-00001',
        NULL,
        'MH09DL001003',
        'HMV-Commercial',
        @ward14_id,
        'available'
    )
ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name),
    mobile_number = VALUES(mobile_number),
    license_number = VALUES(license_number),
    license_type = VALUES(license_type),
    assigned_ward_id = VALUES(assigned_ward_id),
    status = VALUES(status);


INSERT INTO drivers
    (
        employee_id,
        full_name,
        mobile_number,
        email,
        license_number,
        license_type,
        assigned_ward_id,
        status
    )
VALUES
    (
        'DEMO-DRV-002',
        'Sneha Das',
        '+91 90000-00002',
        NULL,
        'MH09DL002004',
        'HMV-Commercial',
        @ward14_id,
        'available'
    )
ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name),
    mobile_number = VALUES(mobile_number),
    license_number = VALUES(license_number),
    license_type = VALUES(license_type),
    assigned_ward_id = VALUES(assigned_ward_id),
    status = VALUES(status);


INSERT INTO drivers
    (
        employee_id,
        full_name,
        mobile_number,
        email,
        license_number,
        license_type,
        assigned_ward_id,
        status
    )
VALUES
    (
        'DEMO-DRV-003',
        'Manoj Yadav',
        '+91 90000-00003',
        NULL,
        'MH09DL003005',
        'HMV-Commercial',
        @ward14_id,
        'available'
    )
ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name),
    mobile_number = VALUES(mobile_number),
    license_number = VALUES(license_number),
    license_type = VALUES(license_type),
    assigned_ward_id = VALUES(assigned_ward_id),
    status = VALUES(status);


INSERT INTO drivers
    (
        employee_id,
        full_name,
        mobile_number,
        email,
        license_number,
        license_type,
        assigned_ward_id,
        status
    )
VALUES
    (
        'DEMO-DRV-004',
        'Amit Saxena',
        '+91 90000-00004',
        NULL,
        'MH09DL004006',
        'HMV-Commercial',
        NULL,
        'available'
    )
ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name),
    mobile_number = VALUES(mobile_number),
    license_number = VALUES(license_number),
    license_type = VALUES(license_type),
    assigned_ward_id = VALUES(assigned_ward_id),
    status = VALUES(status);


INSERT INTO drivers
    (
        employee_id,
        full_name,
        mobile_number,
        email,
        license_number,
        license_type,
        assigned_ward_id,
        status
    )
VALUES
    (
        'DEMO-DRV-005',
        'Dharmendra Pal',
        '+91 90000-00005',
        NULL,
        'MH09DL005007',
        'HMV-Commercial',
        NULL,
        'available'
    )
ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name),
    mobile_number = VALUES(mobile_number),
    license_number = VALUES(license_number),
    license_type = VALUES(license_type),
    assigned_ward_id = VALUES(assigned_ward_id),
    status = VALUES(status);


-- =========================================================
-- 5. VEHICLES
-- =========================================================
-- Exact vehicle identifiers used by the current project are
-- preserved where they are present in the source data.
-- image_path is intentionally NULL until the real upload
-- feature is implemented.
-- =========================================================

INSERT INTO vehicles
    (
        vehicle_number,
        registration_number,
        vehicle_type,
        make,
        capacity_tons,
        current_load_tons,
        current_load_percent,
        eta_minutes,
        status,
        current_latitude,
        current_longitude,
        last_location_at,
        image_path
    )
VALUES
    (
        'TRK-024',
        'DL-1C-5582',
        'Compactor 8T',
        'Tata Signa 1923.K',
        8.00,
        5.44,
        68.00,
        14,
        'collecting',
        16.7059000,
        74.2432000,
        NOW(),
        NULL
    )
ON DUPLICATE KEY UPDATE
    registration_number = VALUES(registration_number),
    vehicle_type = VALUES(vehicle_type),
    make = VALUES(make),
    capacity_tons = VALUES(capacity_tons),
    current_load_tons = VALUES(current_load_tons),
    current_load_percent = VALUES(current_load_percent),
    eta_minutes = VALUES(eta_minutes),
    status = VALUES(status),
    current_latitude = VALUES(current_latitude),
    current_longitude = VALUES(current_longitude),
    last_location_at = VALUES(last_location_at);


INSERT INTO vehicles
    (
        vehicle_number,
        registration_number,
        vehicle_type,
        make,
        capacity_tons,
        current_load_tons,
        current_load_percent,
        eta_minutes,
        status,
        current_latitude,
        current_longitude,
        last_location_at,
        image_path
    )
VALUES
    (
        'TRK-045',
        'DL-1C-9901',
        'Hydraulic Tipper 6T',
        'Ashok Leyland Ecomet',
        6.00,
        2.52,
        42.00,
        6,
        'delayed',
        16.6969000,
        74.2318000,
        NOW(),
        NULL
    )
ON DUPLICATE KEY UPDATE
    registration_number = VALUES(registration_number),
    vehicle_type = VALUES(vehicle_type),
    make = VALUES(make),
    capacity_tons = VALUES(capacity_tons),
    current_load_tons = VALUES(current_load_tons),
    current_load_percent = VALUES(current_load_percent),
    eta_minutes = VALUES(eta_minutes),
    status = VALUES(status),
    current_latitude = VALUES(current_latitude),
    current_longitude = VALUES(current_longitude),
    last_location_at = VALUES(last_location_at);


INSERT INTO vehicles
    (
        vehicle_number,
        registration_number,
        vehicle_type,
        make,
        capacity_tons,
        current_load_tons,
        current_load_percent,
        eta_minutes,
        status,
        current_latitude,
        current_longitude,
        last_location_at,
        image_path
    )
VALUES
    (
        'TRK-011',
        'DL-1C-3211',
        'Compactor 8T',
        'Tata',
        8.00,
        0.00,
        0.00,
        NULL,
        'en_route',
        NULL,
        NULL,
        NULL,
        NULL
    )
ON DUPLICATE KEY UPDATE
    registration_number = VALUES(registration_number),
    vehicle_type = VALUES(vehicle_type),
    make = VALUES(make),
    capacity_tons = VALUES(capacity_tons),
    current_load_tons = VALUES(current_load_tons),
    current_load_percent = VALUES(current_load_percent),
    eta_minutes = VALUES(eta_minutes),
    status = VALUES(status),
    current_latitude = VALUES(current_latitude),
    current_longitude = VALUES(current_longitude),
    last_location_at = VALUES(last_location_at);


INSERT INTO vehicles
    (
        vehicle_number,
        registration_number,
        vehicle_type,
        make,
        capacity_tons,
        current_load_tons,
        current_load_percent,
        eta_minutes,
        status,
        current_latitude,
        current_longitude,
        last_location_at,
        image_path
    )
VALUES
    (
        'TRK-031',
        'DEMO-TRK-031',
        'Waste Collection Truck',
        'Demo Fleet',
        6.00,
        2.52,
        42.00,
        9,
        'en_route',
        16.7131000,
        74.2547000,
        NOW(),
        NULL
    )
ON DUPLICATE KEY UPDATE
    registration_number = VALUES(registration_number),
    vehicle_type = VALUES(vehicle_type),
    make = VALUES(make),
    capacity_tons = VALUES(capacity_tons),
    current_load_tons = VALUES(current_load_tons),
    current_load_percent = VALUES(current_load_percent),
    eta_minutes = VALUES(eta_minutes),
    status = VALUES(status),
    current_latitude = VALUES(current_latitude),
    current_longitude = VALUES(current_longitude),
    last_location_at = VALUES(last_location_at);


INSERT INTO vehicles
    (
        vehicle_number,
        registration_number,
        vehicle_type,
        make,
        capacity_tons,
        current_load_tons,
        current_load_percent,
        eta_minutes,
        status,
        current_latitude,
        current_longitude,
        last_location_at,
        image_path
    )
VALUES
    (
        'TRK-019',
        'DL-1C-4409',
        'Compactor 8T',
        'Demo Fleet',
        8.00,
        0.00,
        0.00,
        NULL,
        'available',
        NULL,
        NULL,
        NULL,
        NULL
    )
ON DUPLICATE KEY UPDATE
    registration_number = VALUES(registration_number),
    vehicle_type = VALUES(vehicle_type),
    make = VALUES(make),
    capacity_tons = VALUES(capacity_tons),
    current_load_tons = VALUES(current_load_tons),
    current_load_percent = VALUES(current_load_percent),
    eta_minutes = VALUES(eta_minutes),
    status = VALUES(status),
    current_latitude = VALUES(current_latitude),
    current_longitude = VALUES(current_longitude),
    last_location_at = VALUES(last_location_at);


INSERT INTO vehicles
    (
        vehicle_number,
        registration_number,
        vehicle_type,
        make,
        capacity_tons,
        current_load_tons,
        current_load_percent,
        eta_minutes,
        status,
        current_latitude,
        current_longitude,
        last_location_at,
        image_path
    )
VALUES
    (
        'TRK-022',
        'DL-1C-8812',
        'Hydraulic Tipper 6T',
        'Demo Fleet',
        6.00,
        0.00,
        0.00,
        NULL,
        'available',
        NULL,
        NULL,
        NULL,
        NULL
    )
ON DUPLICATE KEY UPDATE
    registration_number = VALUES(registration_number),
    vehicle_type = VALUES(vehicle_type),
    make = VALUES(make),
    capacity_tons = VALUES(capacity_tons),
    current_load_tons = VALUES(current_load_tons),
    current_load_percent = VALUES(current_load_percent),
    eta_minutes = VALUES(eta_minutes),
    status = VALUES(status),
    current_latitude = VALUES(current_latitude),
    current_longitude = VALUES(current_longitude),
    last_location_at = VALUES(last_location_at);


-- =========================================================
-- 6. ROUTES
-- =========================================================
-- Routes are scoped to a zone + ward.
--
-- The old Inspector Dashboard used these route codes:
--   R-017, R-009, R-022
--
-- The new records use four actual demo stops per route so
-- total_stops and completed_stops remain internally consistent.
-- =========================================================

SET @ward9_id = (
    SELECT id FROM wards WHERE ward_code = 'WARD-9' LIMIT 1
);

SET @ward14_id = (
    SELECT id FROM wards WHERE ward_code = 'WARD-14' LIMIT 1
);


INSERT INTO routes
    (
        route_code,
        route_name,
        zone_id,
        ward_id,
        status,
        start_point,
        end_point,
        estimated_distance_km,
        estimated_duration_minutes,
        total_stops,
        completed_stops,
        delay_minutes,
        scheduled_start_time,
        scheduled_end_time,
        created_by
    )
VALUES
    (
        'R-017',
        'Central Ward 8 Collection',
        @central_zone_id,
        @ward8_id,
        'active',
        'Ward 8 Collection Depot',
        'Ward 8 Market & Commercial Area',
        18.50,
        120,
        4,
        2,
        0,
        NOW(),
        DATE_ADD(NOW(), INTERVAL 2 HOUR),
        @inspector_user_id
    )
ON DUPLICATE KEY UPDATE
    route_name = VALUES(route_name),
    zone_id = VALUES(zone_id),
    ward_id = VALUES(ward_id),
    status = VALUES(status),
    start_point = VALUES(start_point),
    end_point = VALUES(end_point),
    estimated_distance_km = VALUES(estimated_distance_km),
    estimated_duration_minutes = VALUES(estimated_duration_minutes),
    total_stops = VALUES(total_stops),
    completed_stops = VALUES(completed_stops),
    delay_minutes = VALUES(delay_minutes),
    scheduled_start_time = VALUES(scheduled_start_time),
    scheduled_end_time = VALUES(scheduled_end_time),
    created_by = VALUES(created_by);


INSERT INTO routes
    (
        route_code,
        route_name,
        zone_id,
        ward_id,
        status,
        start_point,
        end_point,
        estimated_distance_km,
        estimated_duration_minutes,
        total_stops,
        completed_stops,
        delay_minutes,
        scheduled_start_time,
        scheduled_end_time,
        created_by
    )
VALUES
    (
        'R-009',
        'West Ward 9 Collection',
        (SELECT id FROM zones WHERE zone_code = 'WEST' LIMIT 1),
        @ward9_id,
        'delayed',
        'Ward 9 Collection Depot',
        'Ward 9 Residential West',
        21.20,
        135,
        4,
        1,
        25,
        DATE_SUB(NOW(), INTERVAL 20 MINUTE),
        DATE_ADD(NOW(), INTERVAL 2 HOUR),
        @inspector_user_id
    )
ON DUPLICATE KEY UPDATE
    route_name = VALUES(route_name),
    zone_id = VALUES(zone_id),
    ward_id = VALUES(ward_id),
    status = VALUES(status),
    start_point = VALUES(start_point),
    end_point = VALUES(end_point),
    estimated_distance_km = VALUES(estimated_distance_km),
    estimated_duration_minutes = VALUES(estimated_duration_minutes),
    total_stops = VALUES(total_stops),
    completed_stops = VALUES(completed_stops),
    delay_minutes = VALUES(delay_minutes),
    scheduled_start_time = VALUES(scheduled_start_time),
    scheduled_end_time = VALUES(scheduled_end_time),
    created_by = VALUES(created_by);


INSERT INTO routes
    (
        route_code,
        route_name,
        zone_id,
        ward_id,
        status,
        start_point,
        end_point,
        estimated_distance_km,
        estimated_duration_minutes,
        total_stops,
        completed_stops,
        delay_minutes,
        scheduled_start_time,
        scheduled_end_time,
        created_by
    )
VALUES
    (
        'R-022',
        'Central Ward 14 Collection',
        @central_zone_id,
        @ward14_id,
        'starting',
        'Ward 14 Collection Depot',
        'Ward 14 Main Junction',
        16.80,
        110,
        4,
        0,
        0,
        NOW(),
        DATE_ADD(NOW(), INTERVAL 110 MINUTE),
        @inspector_user_id
    )
ON DUPLICATE KEY UPDATE
    route_name = VALUES(route_name),
    zone_id = VALUES(zone_id),
    ward_id = VALUES(ward_id),
    status = VALUES(status),
    start_point = VALUES(start_point),
    end_point = VALUES(end_point),
    estimated_distance_km = VALUES(estimated_distance_km),
    estimated_duration_minutes = VALUES(estimated_duration_minutes),
    total_stops = VALUES(total_stops),
    completed_stops = VALUES(completed_stops),
    delay_minutes = VALUES(delay_minutes),
    scheduled_start_time = VALUES(scheduled_start_time),
    scheduled_end_time = VALUES(scheduled_end_time),
    created_by = VALUES(created_by);


-- =========================================================
-- 7. ROUTE STOPS
-- =========================================================
-- Demo coordinates are around Kolhapur and are NOT live GPS data.
-- =========================================================

SET @route17_id = (
    SELECT id FROM routes WHERE route_code = 'R-017' LIMIT 1
);
SET @route9_id = (
    SELECT id FROM routes WHERE route_code = 'R-009' LIMIT 1
);
SET @route22_id = (
    SELECT id FROM routes WHERE route_code = 'R-022' LIMIT 1
);


-- R-017
DELETE FROM route_stops
WHERE route_id = @route17_id;

INSERT INTO route_stops
    (route_id, stop_order, stop_name, address, latitude, longitude, status, collected_at)
VALUES
    (@route17_id, 1, 'Ward 8 Depot', 'Central Collection Depot, Kolhapur', 16.7059000, 74.2432000, 'collected', NOW()),
    (@route17_id, 2, 'Market Junction', 'Central Market Area, Kolhapur', 16.7082000, 74.2470000, 'collected', NOW()),
    (@route17_id, 3, 'Commercial Block', 'Commercial Block, Kolhapur', 16.7110000, 74.2508000, 'in_progress', NULL),
    (@route17_id, 4, 'Ward 8 Residential', 'Ward 8 Residential Area, Kolhapur', 16.7131000, 74.2547000, 'pending', NULL);


-- R-009
DELETE FROM route_stops
WHERE route_id = @route9_id;

INSERT INTO route_stops
    (route_id, stop_order, stop_name, address, latitude, longitude, status, collected_at)
VALUES
    (@route9_id, 1, 'Ward 9 Depot', 'Ward 9 Collection Depot, Kolhapur', 16.6969000, 74.2318000, 'collected', NOW()),
    (@route9_id, 2, 'Sector 4 Market', 'Sector 4 Market Corner, Kolhapur', 16.6995000, 74.2350000, 'in_progress', NULL),
    (@route9_id, 3, 'Residential West', 'West Residential Area, Kolhapur', 16.7026000, 74.2381000, 'pending', NULL),
    (@route9_id, 4, 'Ward 9 Junction', 'Ward 9 Main Junction, Kolhapur', 16.7060000, 74.2414000, 'pending', NULL);


-- R-022
DELETE FROM route_stops
WHERE route_id = @route22_id;

INSERT INTO route_stops
    (route_id, stop_order, stop_name, address, latitude, longitude, status, collected_at)
VALUES
    (@route22_id, 1, 'Ward 14 Depot', 'Ward 14 Collection Depot, Kolhapur', 16.7018000, 74.2533000, 'pending', NULL),
    (@route22_id, 2, 'Main Junction', 'Ward 14 Main Junction, Kolhapur', 16.7045000, 74.2557000, 'pending', NULL),
    (@route22_id, 3, 'Residential Pocket', 'Ward 14 Residential Pocket, Kolhapur', 16.7080000, 74.2584000, 'pending', NULL),
    (@route22_id, 4, 'Commercial Edge', 'Ward 14 Commercial Edge, Kolhapur', 16.7115000, 74.2605000, 'pending', NULL);


-- =========================================================
-- 8. ROUTE ASSIGNMENTS
-- =========================================================
-- Correct relationship:
--   vehicle -> route_assignment -> route -> zone/ward
-- =========================================================

SET @vehicle24_id = (
    SELECT id FROM vehicles WHERE vehicle_number = 'TRK-024' LIMIT 1
);
SET @vehicle45_id = (
    SELECT id FROM vehicles WHERE vehicle_number = 'TRK-045' LIMIT 1
);
SET @vehicle11_id = (
    SELECT id FROM vehicles WHERE vehicle_number = 'TRK-011' LIMIT 1
);

SET @driver104_id = (
    SELECT id FROM drivers WHERE employee_id = 'DRV-104' LIMIT 1
);
SET @driver118_id = (
    SELECT id FROM drivers WHERE employee_id = 'DRV-118' LIMIT 1
);
SET @driverDemo003_id = (
    SELECT id FROM drivers WHERE employee_id = 'DEMO-DRV-003' LIMIT 1
);


INSERT INTO route_assignments
    (assignment_code, route_id, vehicle_id, driver_id, assigned_by, status, assigned_at, started_at)
VALUES
    ('PR-881', @route17_id, @vehicle24_id, @driver104_id, @inspector_user_id, 'active', NOW(), NOW())
ON DUPLICATE KEY UPDATE
    route_id = VALUES(route_id),
    vehicle_id = VALUES(vehicle_id),
    driver_id = VALUES(driver_id),
    assigned_by = VALUES(assigned_by),
    status = VALUES(status),
    started_at = VALUES(started_at);


INSERT INTO route_assignments
    (assignment_code, route_id, vehicle_id, driver_id, assigned_by, status, assigned_at)
VALUES
    ('PR-882', @route9_id, @vehicle45_id, @driver118_id, @inspector_user_id, 'delayed', NOW())
ON DUPLICATE KEY UPDATE
    route_id = VALUES(route_id),
    vehicle_id = VALUES(vehicle_id),
    driver_id = VALUES(driver_id),
    assigned_by = VALUES(assigned_by),
    status = VALUES(status);


INSERT INTO route_assignments
    (assignment_code, route_id, vehicle_id, driver_id, assigned_by, status, assigned_at)
VALUES
    ('PR-883', @route22_id, @vehicle11_id, @driverDemo003_id, @inspector_user_id, 'assigned', NOW())
ON DUPLICATE KEY UPDATE
    route_id = VALUES(route_id),
    vehicle_id = VALUES(vehicle_id),
    driver_id = VALUES(driver_id),
    assigned_by = VALUES(assigned_by),
    status = VALUES(status);


-- Keep the seeded driver state aligned with the assignments.
UPDATE drivers
SET status = 'assigned'
WHERE employee_id = 'DEMO-DRV-003';


-- =========================================================
-- 9. COLLECTIONS
-- =========================================================
-- Three demonstration collection records correspond directly
-- to completed route stops above.
-- =========================================================

DELETE FROM collections
WHERE notes LIKE 'SWACHHITRA DEMO -%';


INSERT INTO collections
    (
        route_id,
        route_stop_id,
        ward_id,
        vehicle_id,
        driver_id,
        collection_date,
        waste_tons,
        status,
        notes,
        collected_at
    )
SELECT
    @route17_id,
    rs.id,
    @ward8_id,
    @vehicle24_id,
    @driver104_id,
    CURDATE(),
    2.60,
    'collected',
    'SWACHHITRA DEMO - Ward 8 depot collection',
    NOW()
FROM route_stops rs
WHERE rs.route_id = @route17_id
  AND rs.stop_order = 1;


INSERT INTO collections
    (
        route_id,
        route_stop_id,
        ward_id,
        vehicle_id,
        driver_id,
        collection_date,
        waste_tons,
        status,
        notes,
        collected_at
    )
SELECT
    @route17_id,
    rs.id,
    @ward8_id,
    @vehicle24_id,
    @driver104_id,
    CURDATE(),
    2.84,
    'collected',
    'SWACHHITRA DEMO - Ward 8 market collection',
    NOW()
FROM route_stops rs
WHERE rs.route_id = @route17_id
  AND rs.stop_order = 2;


INSERT INTO collections
    (
        route_id,
        route_stop_id,
        ward_id,
        vehicle_id,
        driver_id,
        collection_date,
        waste_tons,
        status,
        notes,
        collected_at
    )
SELECT
    @route9_id,
    rs.id,
    @ward9_id,
    @vehicle45_id,
    @driver118_id,
    CURDATE(),
    2.52,
    'collected',
    'SWACHHITRA DEMO - Ward 9 depot collection',
    NOW()
FROM route_stops rs
WHERE rs.route_id = @route9_id
  AND rs.stop_order = 1;


-- =========================================================
-- 10. COMPLAINTS
-- =========================================================
-- Complaint records support the Inspector complaint list and
-- status-update functionality.
-- =========================================================

SET @complaint_ward8 = @ward8_id;
SET @complaint_ward9 = @ward9_id;
SET @complaint_ward14 = @ward14_id;


INSERT INTO complaints
    (
        complaint_code,
        citizen_user_id,
        complaint_type,
        description,
        location_text,
        ward_id,
        latitude,
        longitude,
        priority,
        status,
        assigned_vehicle_id,
        assigned_driver_id,
        reported_at
    )
VALUES
    (
        'CMP-1001',
        NULL,
        'Missed Collection',
        'Waste was not collected during the scheduled pickup window.',
        'Ward 8 Market Road',
        @complaint_ward8,
        16.7082000,
        74.2470000,
        'high',
        'open',
        @vehicle24_id,
        @driver104_id,
        DATE_SUB(NOW(), INTERVAL 35 MINUTE)
    )
ON DUPLICATE KEY UPDATE
    complaint_type = VALUES(complaint_type),
    description = VALUES(description),
    location_text = VALUES(location_text),
    ward_id = VALUES(ward_id),
    latitude = VALUES(latitude),
    longitude = VALUES(longitude),
    priority = VALUES(priority),
    status = VALUES(status),
    assigned_vehicle_id = VALUES(assigned_vehicle_id),
    assigned_driver_id = VALUES(assigned_driver_id);


INSERT INTO complaints
    (
        complaint_code,
        citizen_user_id,
        complaint_type,
        description,
        location_text,
        ward_id,
        latitude,
        longitude,
        priority,
        status,
        assigned_vehicle_id,
        assigned_driver_id,
        reported_at
    )
VALUES
    (
        'CMP-1002',
        NULL,
        'Overflowing Bin',
        'Community waste bin is overflowing and requires collection.',
        'Ward 8 Commercial Block',
        @complaint_ward8,
        16.7110000,
        74.2508000,
        'medium',
        'in_progress',
        @vehicle24_id,
        @driver104_id,
        DATE_SUB(NOW(), INTERVAL 70 MINUTE)
    )
ON DUPLICATE KEY UPDATE
    complaint_type = VALUES(complaint_type),
    description = VALUES(description),
    location_text = VALUES(location_text),
    ward_id = VALUES(ward_id),
    latitude = VALUES(latitude),
    longitude = VALUES(longitude),
    priority = VALUES(priority),
    status = VALUES(status),
    assigned_vehicle_id = VALUES(assigned_vehicle_id),
    assigned_driver_id = VALUES(assigned_driver_id);


INSERT INTO complaints
    (
        complaint_code,
        citizen_user_id,
        complaint_type,
        description,
        location_text,
        ward_id,
        latitude,
        longitude,
        priority,
        status,
        assigned_vehicle_id,
        assigned_driver_id,
        reported_at,
        resolved_at
    )
VALUES
    (
        'CMP-1003',
        NULL,
        'Open Dumping',
        'Waste has been dumped near the road edge and needs clearance.',
        'Ward 9 Residential West',
        @complaint_ward9,
        16.7026000,
        74.2381000,
        'high',
        'resolved',
        @vehicle45_id,
        @driver118_id,
        DATE_SUB(NOW(), INTERVAL 2 HOUR),
        DATE_SUB(NOW(), INTERVAL 35 MINUTE)
    )
ON DUPLICATE KEY UPDATE
    complaint_type = VALUES(complaint_type),
    description = VALUES(description),
    location_text = VALUES(location_text),
    ward_id = VALUES(ward_id),
    latitude = VALUES(latitude),
    longitude = VALUES(longitude),
    priority = VALUES(priority),
    status = VALUES(status),
    assigned_vehicle_id = VALUES(assigned_vehicle_id),
    assigned_driver_id = VALUES(assigned_driver_id),
    resolved_at = VALUES(resolved_at);


INSERT INTO complaints
    (
        complaint_code,
        citizen_user_id,
        complaint_type,
        description,
        location_text,
        ward_id,
        latitude,
        longitude,
        priority,
        status,
        assigned_vehicle_id,
        assigned_driver_id,
        reported_at
    )
VALUES
    (
        'CMP-1004',
        NULL,
        'Missed Collection',
        'Scheduled collection has not started for the assigned route.',
        'Ward 14 Main Junction',
        @complaint_ward14,
        16.7045000,
        74.2557000,
        'medium',
        'open',
        @vehicle11_id,
        @driverDemo003_id,
        DATE_SUB(NOW(), INTERVAL 25 MINUTE)
    )
ON DUPLICATE KEY UPDATE
    complaint_type = VALUES(complaint_type),
    description = VALUES(description),
    location_text = VALUES(location_text),
    ward_id = VALUES(ward_id),
    latitude = VALUES(latitude),
    longitude = VALUES(longitude),
    priority = VALUES(priority),
    status = VALUES(status),
    assigned_vehicle_id = VALUES(assigned_vehicle_id),
    assigned_driver_id = VALUES(assigned_driver_id);


-- =========================================================
-- 11. NOTIFICATIONS
-- =========================================================

DELETE FROM notifications
WHERE recipient_user_id = @inspector_user_id
  AND notification_type = 'demo_seed';


INSERT INTO notifications
    (
        recipient_user_id,
        title,
        message,
        notification_type,
        priority,
        is_read,
        related_route_id,
        related_complaint_id
    )
VALUES
    (
        @inspector_user_id,
        'Route delayed',
        'Route R-009 is currently delayed by approximately 25 minutes.',
        'demo_seed',
        'high',
        0,
        @route9_id,
        NULL
    ),
    (
        @inspector_user_id,
        'New complaint',
        'Complaint CMP-1001 was reported in Ward 8.',
        'demo_seed',
        'high',
        0,
        NULL,
        (SELECT id FROM complaints WHERE complaint_code = 'CMP-1001' LIMIT 1)
    ),
    (
        @inspector_user_id,
        'Route R-022 assigned',
        'Vehicle TRK-011 and driver Manoj Yadav are assigned to route R-022.',
        'demo_seed',
        'medium',
        1,
        @route22_id,
        NULL
    );


-- =========================================================
-- 12. FINAL CONSISTENCY UPDATES
-- =========================================================

UPDATE routes
SET total_stops = (
        SELECT COUNT(*)
        FROM route_stops rs
        WHERE rs.route_id = routes.id
    ),
    completed_stops = (
        SELECT COUNT(*)
        FROM route_stops rs
        WHERE rs.route_id = routes.id
          AND rs.status = 'collected'
    )
WHERE route_code IN ('R-017', 'R-009', 'R-022');


-- =========================================================
-- COMMIT
-- =========================================================

COMMIT;


-- =========================================================
-- OPTIONAL VERIFICATION QUERIES
-- Run these manually after seed.sql if you want to verify.
-- =========================================================
-- SELECT * FROM users;
-- SELECT * FROM user_profiles;
-- SELECT * FROM zones;
-- SELECT * FROM wards;
-- SELECT * FROM drivers;
-- SELECT * FROM vehicles;
-- SELECT * FROM routes;
-- SELECT * FROM route_stops;
-- SELECT * FROM route_assignments;
-- SELECT * FROM collections;
-- SELECT * FROM complaints;
-- SELECT * FROM notifications;
-- =========================================================
