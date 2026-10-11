-- MySQL dump 10.13  Distrib 8.0.44, for Win64 (x86_64)
--
-- Host: localhost    Database: swachhitra
-- ------------------------------------------------------
-- Server version	8.0.44

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `citizen_account_security`
--

DROP TABLE IF EXISTS `citizen_account_security`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `citizen_account_security` (
  `user_id` bigint unsigned NOT NULL,
  `email_verified_at` datetime(3) DEFAULT NULL,
  `session_version` int unsigned NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_citizen_account_security_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `citizen_account_tokens`
--

DROP TABLE IF EXISTS `citizen_account_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `citizen_account_tokens` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `purpose` enum('email_verification','password_reset') COLLATE utf8mb4_unicode_ci NOT NULL,
  `token_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `expires_at` datetime(3) NOT NULL,
  `used_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_citizen_account_tokens_hash` (`token_hash`),
  KEY `idx_citizen_account_tokens_user_purpose` (`user_id`,`purpose`,`used_at`,`expires_at`),
  KEY `idx_citizen_account_tokens_expiry` (`expires_at`),
  CONSTRAINT `fk_citizen_account_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `collections`
--

DROP TABLE IF EXISTS `collections`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `collections` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `route_id` bigint unsigned NOT NULL,
  `route_stop_id` bigint unsigned DEFAULT NULL,
  `ward_id` bigint unsigned NOT NULL,
  `vehicle_id` bigint unsigned DEFAULT NULL,
  `driver_id` bigint unsigned DEFAULT NULL,
  `collection_date` date NOT NULL,
  `waste_tons` decimal(8,2) NOT NULL DEFAULT '0.00',
  `status` enum('in_progress','collected','skipped') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'in_progress',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `collected_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_collections_route` (`route_id`),
  KEY `idx_collections_stop` (`route_stop_id`),
  KEY `idx_collections_ward` (`ward_id`),
  KEY `idx_collections_date` (`collection_date`),
  KEY `idx_collections_status` (`status`),
  KEY `fk_collections_vehicle` (`vehicle_id`),
  KEY `fk_collections_driver` (`driver_id`),
  CONSTRAINT `fk_collections_driver` FOREIGN KEY (`driver_id`) REFERENCES `drivers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_collections_route` FOREIGN KEY (`route_id`) REFERENCES `routes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_collections_route_stop` FOREIGN KEY (`route_stop_id`) REFERENCES `route_stops` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_collections_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_collections_ward` FOREIGN KEY (`ward_id`) REFERENCES `wards` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `complaints`
--

DROP TABLE IF EXISTS `complaints`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `complaints` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `complaint_code` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `citizen_user_id` bigint unsigned DEFAULT NULL,
  `complaint_type` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `location_text` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ward_id` bigint unsigned DEFAULT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `priority` enum('low','medium','high','critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `status` enum('open','in_progress','resolved','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `assigned_vehicle_id` bigint unsigned DEFAULT NULL,
  `assigned_driver_id` bigint unsigned DEFAULT NULL,
  `reported_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_complaints_code` (`complaint_code`),
  KEY `idx_complaints_citizen` (`citizen_user_id`),
  KEY `idx_complaints_ward` (`ward_id`),
  KEY `idx_complaints_priority` (`priority`),
  KEY `idx_complaints_status` (`status`),
  KEY `idx_complaints_vehicle` (`assigned_vehicle_id`),
  KEY `idx_complaints_driver` (`assigned_driver_id`),
  KEY `idx_complaints_reported_at` (`reported_at`),
  CONSTRAINT `fk_complaints_citizen` FOREIGN KEY (`citizen_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_complaints_driver` FOREIGN KEY (`assigned_driver_id`) REFERENCES `drivers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_complaints_vehicle` FOREIGN KEY (`assigned_vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_complaints_ward` FOREIGN KEY (`ward_id`) REFERENCES `wards` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `division_operational_areas`
--

DROP TABLE IF EXISTS `division_operational_areas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `division_operational_areas` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `division_id` bigint unsigned NOT NULL,
  `boundary_geojson` json NOT NULL,
  `source` varchar(40) NOT NULL DEFAULT 'assistant_defined',
  `assigned_by` bigint unsigned DEFAULT NULL,
  `assigned_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_division_operational_area_division` (`division_id`),
  KEY `idx_division_operational_area_assigned_by` (`assigned_by`),
  CONSTRAINT `fk_division_operational_area_division` FOREIGN KEY (`division_id`) REFERENCES `divisions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_division_operational_area_user` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `divisions`
--

DROP TABLE IF EXISTS `divisions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `divisions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `division_code` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `division_name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `office_location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `source_name` varchar(180) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_checked_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_divisions_code` (`division_code`),
  KEY `idx_divisions_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `drivers`
--

DROP TABLE IF EXISTS `drivers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `drivers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned DEFAULT NULL,
  `employee_id` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `full_name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mobile_number` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(190) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `license_number` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `license_type` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assigned_ward_id` bigint unsigned DEFAULT NULL,
  `status` enum('available','assigned','on_break','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'available',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_drivers_employee_id` (`employee_id`),
  UNIQUE KEY `uq_drivers_user` (`user_id`),
  KEY `idx_drivers_ward` (`assigned_ward_id`),
  KEY `idx_drivers_status` (`status`),
  CONSTRAINT `fk_drivers_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_drivers_ward` FOREIGN KEY (`assigned_ward_id`) REFERENCES `wards` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `inspector_operational_areas`
--

DROP TABLE IF EXISTS `inspector_operational_areas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inspector_operational_areas` (
  `inspector_user_id` bigint unsigned NOT NULL,
  `division_id` bigint unsigned NOT NULL,
  `ward_id` bigint unsigned NOT NULL,
  `boundary_geojson` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `source` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'assistant_selected',
  `assigned_by` bigint unsigned NOT NULL,
  `assigned_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`inspector_user_id`),
  KEY `idx_inspector_operational_area_division_ward` (`division_id`,`ward_id`),
  KEY `idx_inspector_operational_area_assigned_by` (`assigned_by`,`assigned_at`),
  KEY `fk_inspector_operational_area_ward_division` (`ward_id`,`division_id`),
  CONSTRAINT `fk_inspector_operational_area_assigned_by` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_inspector_operational_area_division` FOREIGN KEY (`division_id`) REFERENCES `divisions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_inspector_operational_area_inspector` FOREIGN KEY (`inspector_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_inspector_operational_area_ward_division` FOREIGN KEY (`ward_id`, `division_id`) REFERENCES `wards` (`id`, `division_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `chk_inspector_operational_area_json` CHECK (json_valid(`boundary_geojson`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `inspector_scope_history`
--

DROP TABLE IF EXISTS `inspector_scope_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inspector_scope_history` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `inspector_user_id` bigint unsigned NOT NULL,
  `previous_division_id` bigint unsigned DEFAULT NULL,
  `previous_ward_id` bigint unsigned DEFAULT NULL,
  `new_division_id` bigint unsigned NOT NULL,
  `new_ward_id` bigint unsigned NOT NULL,
  `assigned_by` bigint unsigned NOT NULL,
  `reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_scope_history_inspector` (`inspector_user_id`,`created_at`),
  KEY `idx_scope_history_assigner` (`assigned_by`,`created_at`),
  KEY `fk_scope_history_previous_division` (`previous_division_id`),
  KEY `fk_scope_history_previous_ward` (`previous_ward_id`),
  KEY `fk_scope_history_new_division` (`new_division_id`),
  KEY `fk_scope_history_new_ward` (`new_ward_id`),
  CONSTRAINT `fk_scope_history_assigned_by` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_scope_history_inspector` FOREIGN KEY (`inspector_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_scope_history_new_division` FOREIGN KEY (`new_division_id`) REFERENCES `divisions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_scope_history_new_ward` FOREIGN KEY (`new_ward_id`) REFERENCES `wards` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_scope_history_previous_division` FOREIGN KEY (`previous_division_id`) REFERENCES `divisions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_scope_history_previous_ward` FOREIGN KEY (`previous_ward_id`) REFERENCES `wards` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `recipient_user_id` bigint unsigned NOT NULL,
  `title` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `notification_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'general',
  `priority` enum('low','medium','high') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `read_at` datetime DEFAULT NULL,
  `related_route_id` bigint unsigned DEFAULT NULL,
  `related_complaint_id` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notifications_recipient` (`recipient_user_id`),
  KEY `idx_notifications_read` (`recipient_user_id`,`is_read`),
  KEY `idx_notifications_route` (`related_route_id`),
  KEY `idx_notifications_complaint` (`related_complaint_id`),
  CONSTRAINT `fk_notifications_complaint` FOREIGN KEY (`related_complaint_id`) REFERENCES `complaints` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_notifications_recipient` FOREIGN KEY (`recipient_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_notifications_route` FOREIGN KEY (`related_route_id`) REFERENCES `routes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `route_assignments`
--

DROP TABLE IF EXISTS `route_assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `route_assignments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `assignment_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `route_id` bigint unsigned NOT NULL,
  `vehicle_id` bigint unsigned NOT NULL,
  `driver_id` bigint unsigned NOT NULL,
  `assigned_by` bigint unsigned NOT NULL,
  `status` enum('assigned','active','delayed','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'assigned',
  `assigned_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `started_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `unassigned_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_route_assignments_code` (`assignment_code`),
  KEY `idx_assignments_route` (`route_id`),
  KEY `idx_assignments_vehicle` (`vehicle_id`),
  KEY `idx_assignments_driver` (`driver_id`),
  KEY `idx_assignments_status` (`status`),
  KEY `fk_assignments_user` (`assigned_by`),
  CONSTRAINT `fk_assignments_driver` FOREIGN KEY (`driver_id`) REFERENCES `drivers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_assignments_route` FOREIGN KEY (`route_id`) REFERENCES `routes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_assignments_user` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_assignments_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `route_change_requests`
--

DROP TABLE IF EXISTS `route_change_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `route_change_requests` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `route_id` bigint unsigned NOT NULL,
  `request_type` enum('route_creation','route_update','route_reassignment','route_cancellation') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('pending','approved','rejected','withdrawn') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `requested_by` bigint unsigned NOT NULL,
  `requested_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `before_state` longtext COLLATE utf8mb4_unicode_ci,
  `after_state` longtext COLLATE utf8mb4_unicode_ci,
  `reviewed_by` bigint unsigned DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `review_notes` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_route_change_route_status` (`route_id`,`status`),
  KEY `idx_route_change_requester` (`requested_by`,`requested_at`),
  KEY `idx_route_change_reviewer` (`reviewed_by`,`reviewed_at`),
  CONSTRAINT `fk_route_change_requester` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_route_change_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_route_change_route` FOREIGN KEY (`route_id`) REFERENCES `routes` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `route_stops`
--

DROP TABLE IF EXISTS `route_stops`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `route_stops` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `route_id` bigint unsigned NOT NULL,
  `stop_order` int unsigned NOT NULL,
  `stop_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `status` enum('pending','in_progress','collected','skipped') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `collected_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_route_stops_order` (`route_id`,`stop_order`),
  KEY `idx_route_stops_status` (`status`),
  CONSTRAINT `fk_route_stops_route` FOREIGN KEY (`route_id`) REFERENCES `routes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=66 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `routes`
--

DROP TABLE IF EXISTS `routes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `routes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `route_code` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `route_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `zone_id` bigint unsigned NOT NULL,
  `division_id` bigint unsigned DEFAULT NULL,
  `ward_id` bigint unsigned NOT NULL,
  `status` enum('scheduled','starting','active','delayed','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'scheduled',
  `approval_status` enum('legacy_unreviewed','pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'legacy_unreviewed',
  `approval_requested_by` bigint unsigned DEFAULT NULL,
  `approval_requested_at` datetime DEFAULT NULL,
  `approved_by` bigint unsigned DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `approval_notes` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `start_point` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `end_point` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estimated_distance_km` decimal(8,2) DEFAULT NULL,
  `estimated_duration_minutes` int unsigned DEFAULT NULL,
  `total_stops` int unsigned NOT NULL DEFAULT '0',
  `completed_stops` int unsigned NOT NULL DEFAULT '0',
  `delay_minutes` int NOT NULL DEFAULT '0',
  `scheduled_start_time` datetime DEFAULT NULL,
  `scheduled_end_time` datetime DEFAULT NULL,
  `created_by` bigint unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_routes_code` (`route_code`),
  KEY `idx_routes_zone` (`zone_id`),
  KEY `idx_routes_ward` (`ward_id`),
  KEY `idx_routes_status` (`status`),
  KEY `idx_routes_created_by` (`created_by`),
  KEY `fk_routes_ward_zone` (`ward_id`,`zone_id`),
  KEY `idx_routes_division` (`division_id`),
  KEY `idx_routes_approval_status` (`approval_status`),
  KEY `fk_routes_ward_division` (`ward_id`,`division_id`),
  KEY `fk_routes_approval_requested_by` (`approval_requested_by`),
  KEY `fk_routes_approved_by` (`approved_by`),
  CONSTRAINT `fk_routes_approval_requested_by` FOREIGN KEY (`approval_requested_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_routes_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_routes_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_routes_division` FOREIGN KEY (`division_id`) REFERENCES `divisions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_routes_ward_division` FOREIGN KEY (`ward_id`, `division_id`) REFERENCES `wards` (`id`, `division_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_routes_ward_zone` FOREIGN KEY (`ward_id`, `zone_id`) REFERENCES `wards` (`id`, `zone_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_routes_zone` FOREIGN KEY (`zone_id`) REFERENCES `zones` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=29 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sessions`
--

DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessions` (
  `session_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires` datetime(3) DEFAULT NULL,
  `data` mediumtext COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`session_id`),
  KEY `idx_sessions_expires` (`expires`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_profiles`
--

DROP TABLE IF EXISTS `user_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_profiles` (
  `user_id` bigint unsigned NOT NULL,
  `full_name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mobile_number` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `official_email` varchar(190) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `employee_id` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `department` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `designation` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `office_location` varchar(180) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `working_shift` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `official_contact_number` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `postal_code` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_latitude` decimal(10,7) DEFAULT NULL,
  `address_longitude` decimal(10,7) DEFAULT NULL,
  `preferred_language` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notification_preference` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `zone_id` bigint unsigned DEFAULT NULL,
  `division_id` bigint unsigned DEFAULT NULL,
  `scope_assigned_by` bigint unsigned DEFAULT NULL,
  `scope_assigned_at` datetime DEFAULT NULL,
  `ward_id` bigint unsigned DEFAULT NULL,
  `license_number` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `license_type` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_number` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `jurisdiction` varchar(180) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_user_profiles_employee_id` (`employee_id`),
  KEY `idx_profiles_zone` (`zone_id`),
  KEY `idx_profiles_ward` (`ward_id`),
  KEY `fk_user_profiles_ward_zone` (`ward_id`,`zone_id`),
  KEY `idx_profiles_division` (`division_id`),
  KEY `fk_user_profiles_scope_assigned_by` (`scope_assigned_by`),
  KEY `fk_user_profiles_ward_division` (`ward_id`,`division_id`),
  CONSTRAINT `fk_user_profiles_division` FOREIGN KEY (`division_id`) REFERENCES `divisions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_user_profiles_scope_assigned_by` FOREIGN KEY (`scope_assigned_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_user_profiles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_user_profiles_ward_division` FOREIGN KEY (`ward_id`, `division_id`) REFERENCES `wards` (`id`, `division_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_user_profiles_ward_zone` FOREIGN KEY (`ward_id`, `zone_id`) REFERENCES `wards` (`id`, `zone_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `email` varchar(190) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('deputy_commissioner','assistant_commissioner','sanitary_inspector','driver','citizen') NOT NULL,
  `status` enum('active','inactive') NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_users_role` (`role`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `vehicles`
--

DROP TABLE IF EXISTS `vehicles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vehicles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `vehicle_number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `registration_number` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_type` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `make` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `capacity_tons` decimal(8,2) NOT NULL DEFAULT '0.00',
  `current_load_tons` decimal(8,2) NOT NULL DEFAULT '0.00',
  `current_load_percent` decimal(5,2) NOT NULL DEFAULT '0.00',
  `eta_minutes` int unsigned DEFAULT NULL,
  `status` enum('available','en_route','collecting','delayed','maintenance','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'available',
  `current_latitude` decimal(10,7) DEFAULT NULL,
  `current_longitude` decimal(10,7) DEFAULT NULL,
  `last_location_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_vehicles_number` (`vehicle_number`),
  UNIQUE KEY `uq_vehicles_registration` (`registration_number`),
  KEY `idx_vehicles_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `ward_boundaries`
--

DROP TABLE IF EXISTS `ward_boundaries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ward_boundaries` (
  `ward_id` bigint unsigned NOT NULL,
  `boundary_geojson` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_name` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_document_date` date DEFAULT NULL,
  `source_version` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_official` tinyint(1) NOT NULL DEFAULT '0',
  `verified_by` bigint unsigned DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL,
  `checksum_sha256` char(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ward_id`),
  KEY `idx_ward_boundaries_official` (`is_official`),
  KEY `fk_ward_boundaries_verified_by` (`verified_by`),
  CONSTRAINT `fk_ward_boundaries_verified_by` FOREIGN KEY (`verified_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_ward_boundaries_ward` FOREIGN KEY (`ward_id`) REFERENCES `wards` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `wards`
--

DROP TABLE IF EXISTS `wards`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wards` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `zone_id` bigint unsigned NOT NULL,
  `division_id` bigint unsigned DEFAULT NULL,
  `ward_number` int unsigned NOT NULL,
  `ward_code` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ward_name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wards_code` (`ward_code`),
  UNIQUE KEY `uq_wards_zone_number` (`zone_id`,`ward_number`),
  UNIQUE KEY `uq_wards_id_zone` (`id`,`zone_id`),
  UNIQUE KEY `uq_wards_id_division` (`id`,`division_id`),
  KEY `idx_wards_zone` (`zone_id`),
  KEY `idx_wards_status` (`status`),
  KEY `idx_wards_division` (`division_id`),
  CONSTRAINT `fk_wards_division` FOREIGN KEY (`division_id`) REFERENCES `divisions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_wards_zone` FOREIGN KEY (`zone_id`) REFERENCES `zones` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `zones`
--

DROP TABLE IF EXISTS `zones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `zones` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `zone_code` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `zone_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_zones_code` (`zone_code`),
  KEY `idx_zones_name` (`zone_name`),
  KEY `idx_zones_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-11 12:50:20
