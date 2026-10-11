-- ================================================================
-- SWACHHITRA SAFE REFERENCE SEED
-- Based on the current database's geographic reference data
-- ================================================================
-- PURPOSE
--   Add missing zones, divisions, and ward reference rows only.
--
-- SAFETY
--   * No DROP, DELETE, TRUNCATE, UPDATE, or REPLACE statements.
--   * Existing rows are left exactly as they are; no status/name/location
--     values are overwritten.
--   * Operational data (users, drivers, vehicles, routes, assignments,
--     route stops, complaints, collections, notifications, GIS boundaries,
--     and audit/history records) is deliberately not seeded or reset.
--   * Run against a database created from the current schema baseline.
--   * The WARD-8 / WARD-14 / WARD-9 / WARD-21 / WARD-31 / WARD-41 entries
--     are legacy placeholder/demo wards and are inserted as INACTIVE, as in
--     the current database. Do not manually activate them without verifying
--     the operational geography.
-- ================================================================

USE swachhitra;
START TRANSACTION;

-- 1. Zones: insert only missing zone codes.
INSERT INTO zones (zone_code, zone_name, status)
SELECT seed.zone_code, seed.zone_name, seed.status
FROM (
    SELECT 'CENTRAL' AS zone_code, 'Central Zone' AS zone_name, 'active' AS status
    UNION ALL SELECT 'NORTH', 'North Zone', 'active'
    UNION ALL SELECT 'SOUTH', 'South Zone', 'active'
    UNION ALL SELECT 'EAST', 'East Zone', 'active'
    UNION ALL SELECT 'WEST', 'West Zone', 'active'
) AS seed
WHERE NOT EXISTS (
    SELECT 1 FROM zones existing WHERE existing.zone_code = seed.zone_code
);

-- 2. Divisions: insert only missing division codes.
INSERT INTO divisions
    (division_code, division_name, office_location, status,
     source_name, source_url, source_checked_at)
SELECT seed.division_code, seed.division_name, seed.office_location, seed.status,
       seed.source_name, seed.source_url, seed.source_checked_at
FROM (
    SELECT
        'DIV-1' AS division_code,
        'Divisional Office 1' AS division_name,
        'Gandhi Maidan' AS office_location,
        'active' AS status,
        'Kolhapur Municipal Corporation - About Kolhapur' AS source_name,
        'https://web.kolhapurcorporation.gov.in/aboutKolhapur' AS source_url,
        CAST('2026-10-04 16:05:35' AS DATETIME) AS source_checked_at
    UNION ALL SELECT
        'DIV-2', 'Divisional Office 2', 'Chhatrapati Shivaji Market', 'active',
        'Kolhapur Municipal Corporation - About Kolhapur',
        'https://web.kolhapurcorporation.gov.in/aboutKolhapur',
        CAST('2026-10-04 16:05:35' AS DATETIME)
    UNION ALL SELECT
        'DIV-3', 'Divisional Office 3', 'Rajarampuri', 'active',
        'Kolhapur Municipal Corporation - About Kolhapur',
        'https://web.kolhapurcorporation.gov.in/aboutKolhapur',
        CAST('2026-10-04 16:05:35' AS DATETIME)
    UNION ALL SELECT
        'DIV-4', 'Divisional Office 4', 'Kawala Naka', 'active',
        'Kolhapur Municipal Corporation - About Kolhapur',
        'https://web.kolhapurcorporation.gov.in/aboutKolhapur',
        CAST('2026-10-04 16:05:35' AS DATETIME)
) AS seed
WHERE NOT EXISTS (
    SELECT 1 FROM divisions existing WHERE existing.division_code = seed.division_code
);

-- 3. Legacy placeholders and current wards.
-- Existing rows are not updated, including the existing inactive statuses.
INSERT INTO wards
    (zone_id, division_id, ward_number, ward_code, ward_name, status)
SELECT z.id, d.id, seed.ward_number, seed.ward_code, seed.ward_name, seed.status
FROM (
    SELECT 'CENTRAL' AS zone_code, CAST(NULL AS CHAR(30)) AS division_code,
           8 AS ward_number, 'WARD-8' AS ward_code,
           'Ward 8 (Market & Commercial)' AS ward_name, 'inactive' AS status
    UNION ALL SELECT 'CENTRAL', 'DIV-1', 14, 'WARD-14', 'Ward 14 (Mixed Density)', 'inactive'
    UNION ALL SELECT 'WEST',    'DIV-1', 9,  'WARD-9',  'Ward 9 (Residential West)', 'inactive'
    UNION ALL SELECT 'NORTH',   'DIV-1', 21, 'WARD-21', 'Ward 21 (North Demo Area)', 'inactive'
    UNION ALL SELECT 'SOUTH',   'DIV-1', 31, 'WARD-31', 'Ward 31 (South Demo Area)', 'inactive'
    UNION ALL SELECT 'EAST',    'DIV-1', 41, 'WARD-41', 'Ward 41 (East Demo Area)', 'inactive'
    UNION ALL SELECT 'CENTRAL', 'DIV-1', 10, 'WARD-10', 'Ward 10', 'active'
    UNION ALL SELECT 'CENTRAL', 'DIV-1', 1, 'ward-01', 'Rankala Sandhyamath Area', 'active'
) AS seed
JOIN zones z ON z.zone_code = seed.zone_code
LEFT JOIN divisions d ON d.division_code = seed.division_code
WHERE NOT EXISTS (
    SELECT 1
    FROM wards existing
    WHERE existing.ward_code = seed.ward_code
       OR (existing.zone_id = z.id AND existing.ward_number = seed.ward_number)
);

COMMIT;

-- Verify only reference-table row counts (this does not modify data).
SELECT 'zones' AS table_name, COUNT(*) AS row_count FROM zones
UNION ALL SELECT 'divisions', COUNT(*) FROM divisions
UNION ALL SELECT 'wards', COUNT(*) FROM wards;
