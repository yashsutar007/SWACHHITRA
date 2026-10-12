-- SWACHHITRA: retain browser-reported GPS quality/heading/speed with each vehicle fix.
-- Apply ONCE to an existing database after taking a verified backup.
-- Do not run this file if these three columns already exist; inspect/reconcile first.
-- Fresh databases receive the same fields from database/schema.sql.

ALTER TABLE vehicles
    ADD COLUMN current_location_accuracy_meters DECIMAL(8,2) NULL AFTER current_longitude,
    ADD COLUMN current_location_heading_degrees DECIMAL(6,2) NULL AFTER current_location_accuracy_meters,
    ADD COLUMN current_location_speed_mps DECIMAL(7,3) NULL AFTER current_location_heading_degrees;

SELECT
    current_location_accuracy_meters,
    current_location_heading_degrees,
    current_location_speed_mps
FROM vehicles
LIMIT 0;
