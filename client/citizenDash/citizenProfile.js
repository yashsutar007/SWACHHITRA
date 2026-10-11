(() => {
    "use strict";

    const form = document.getElementById("citizenProfileForm");
    const pageNotice = document.getElementById("pageNotice");
    const wardResolution = document.getElementById("wardResolution");
    const saveButton = document.getElementById("saveProfile");
    const latitudeInput = document.getElementById("addressLatitude");
    const longitudeInput = document.getElementById("addressLongitude");

    let map = null;
    let marker = null;
    let accuracyCircle = null;
    let locationWatchId = null;
    let locationSearchTimer = null;
    let bestLocationFix = null;
    let locationSearchFinished = true;
    let areas = [];
    let csrfToken = "";
    let currentProfile = null;
    let mapTileSuccessCount = 0;
    let mapTileErrorCount = 0;
    let mapTileStatusElement = null;

    const KOLHAPUR_CENTER = [16.7055, 74.2433];
    const LOCATION_SEARCH_WINDOW_MS = 20000;
    const GOOD_LOCATION_ACCURACY_METRES = 100;
    const EXCELLENT_LOCATION_ACCURACY_METRES = 25;

    function showNotice(message, kind = "") {
        pageNotice.textContent = String(message || "");
        pageNotice.className = `notice ${kind}`.trim();
    }

    function setWardPreview(message, kind = "") {
        wardResolution.textContent = String(message || "");
        wardResolution.className = `ward-resolution ${kind}`.trim();
    }

    function insidePolygon(point, polygon) {
        if (!Array.isArray(polygon) || polygon.length < 3) return false;
        const [lat, lng] = point;
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const [yi, xi] = polygon[i];
            const [yj, xj] = polygon[j];
            const intersects = ((yi > lat) !== (yj > lat)) &&
                (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi);
            if (intersects) inside = !inside;
        }
        return inside;
    }

    function areaRank(source) {
        if (source === "official") return 3;
        if (source === "assistant_defined") return 2;
        if (source === "development") return 1;
        return 0;
    }

    function describeSource(source) {
        if (source === "official") return "saved official boundary";
        if (source === "assistant_defined") return "AC-defined operational boundary (not verified official KMC geography)";
        if (source === "development") return "development/demo boundary (not official KMC geography)";
        return "unknown boundary source";
    }

    function updateWardPreview() {
        const lat = Number(latitudeInput.value);
        const lng = Number(longitudeInput.value);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            setWardPreview("Place a pin to check whether a supported Ward covers this location.");
            return;
        }

        const matches = areas.filter(area => insidePolygon([lat, lng], area.polygon));
        if (!matches.length) {
            setWardPreview("No supported operational Ward boundary contains this pin. You can save your address, but your Ward will remain unconfirmed until a supported boundary covers the location.", "warning");
            return;
        }

        const highest = Math.max(...matches.map(area => areaRank(area.boundary_source)));
        const best = matches.filter(area => areaRank(area.boundary_source) === highest);
        if (best.length !== 1) {
            setWardPreview("This pin is on an overlapping/shared Ward boundary. Move it slightly inside the Ward where your address is located.", "warning");
            return;
        }

        const area = best[0];
        const label = `Ward ${area.ward_number} — ${area.ward_name}`;
        setWardPreview(`Detected: ${label}. Source: ${describeSource(area.boundary_source)}. The server will verify this match again when you save.`, area.boundary_is_official ? "success" : "warning");
    }

    function clearAccuracyCircle() {
        if (accuracyCircle && map) {
            map.removeLayer(accuracyCircle);
            accuracyCircle = null;
        }
    }

    function stopLocationWatch() {
        if (locationWatchId !== null && navigator.geolocation) {
            navigator.geolocation.clearWatch(locationWatchId);
            locationWatchId = null;
        }
        if (locationSearchTimer !== null) {
            window.clearTimeout(locationSearchTimer);
            locationSearchTimer = null;
        }
    }

    function formatAccuracy(metres) {
        const accuracy = Number(metres);
        if (!Number.isFinite(accuracy)) return "unknown accuracy";
        if (accuracy >= 1000) return `±${(accuracy / 1000).toFixed(1)} km`;
        return `±${Math.round(accuracy)} m`;
    }

    function setLocationButtonIdle() {
        const button = document.getElementById("useMyLocation");
        if (button) {
            button.disabled = false;
            button.textContent = "Use my location";
        }
    }

    function finishLocationLookup() {
        if (locationSearchFinished) return;
        locationSearchFinished = true;
        stopLocationWatch();
        setLocationButtonIdle();

        if (!bestLocationFix) {
            showNotice(
                "Your device did not provide a location fix. Check that Location Services are enabled for your device and browser, then try again. You can also click the map or drag the pin manually.",
                "error"
            );
            return;
        }

        const { latitude, longitude, accuracy } = bestLocationFix;
        map.setView([latitude, longitude], accuracy <= 50 ? 17 : accuracy <= 150 ? 16 : accuracy <= 500 ? 15 : 12);
        movePin(latitude, longitude);

        accuracyCircle = L.circle([latitude, longitude], {
            radius: Math.max(accuracy, 5),
            color: accuracy <= GOOD_LOCATION_ACCURACY_METRES ? "#247544" : "#b7791f",
            weight: 2,
            fillColor: accuracy <= GOOD_LOCATION_ACCURACY_METRES ? "#36a269" : "#e7a23b",
            fillOpacity: 0.12,
            interactive: false
        }).addTo(map);

        map.fitBounds(accuracyCircle.getBounds(), {
            padding: [24, 24],
            maxZoom: accuracy <= 25 ? 18 : accuracy <= 50 ? 17 : accuracy <= 150 ? 16 : accuracy <= 500 ? 15 : 12
        });

        const accuracyText = formatAccuracy(accuracy);
        if (accuracy <= GOOD_LOCATION_ACCURACY_METRES) {
            showNotice(
                `Device location found (${accuracyText} reported accuracy). The circle shows the device's estimated uncertainty, not an exact boundary. Check that the pin is at your home before saving.`,
                "success"
            );
        } else {
            showNotice(
                `Your device only provided an approximate location (${accuracyText} reported accuracy). This may be the computer's Wi-Fi/network estimate rather than GPS. The map is zoomed to show the uncertainty circle. For a more accurate fix, enable device Location Services and try from a phone or outdoors, or move the pin manually to your home.`,
                "warning"
            );
        }
    }

    function cancelLocationLookupForManualPin() {
        if (locationSearchFinished) return;
        locationSearchFinished = true;
        stopLocationWatch();
        setLocationButtonIdle();
        showNotice("Location lookup stopped because you selected a point manually.", "");
    }

    function movePin(lat, lng) {
        clearAccuracyCircle();
        const latitude = Number(lat);
        const longitude = Number(lng);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            setWardPreview("The selected location is invalid.", "error");
            return;
        }

        latitudeInput.value = latitude.toFixed(7);
        longitudeInput.value = longitude.toFixed(7);

        const point = [latitude, longitude];
        if (marker) marker.setLatLng(point);
        else marker = L.marker(point, { draggable: true }).addTo(map);

        marker.off("dragend");
        marker.on("dragend", () => {
            clearAccuracyCircle();
            const position = marker.getLatLng();
            latitudeInput.value = position.lat.toFixed(7);
            longitudeInput.value = position.lng.toFixed(7);
            updateWardPreview();
        });

        updateWardPreview();
    }

    async function loadJson(url, options = {}) {
        const response = await fetch(url, {
            credentials: "same-origin",
            cache: "no-store",
            ...options
        });
        const body = await response.json().catch(() => null);
        if (!response.ok || body?.success !== true) {
            throw new Error(body?.message || `Request failed (${response.status}).`);
        }
        return body;
    }

    function setMapTileStatus(message) {
        const container = document.getElementById("citizenLocationMap");
        if (!container) return;
        if (!mapTileStatusElement) {
            mapTileStatusElement = document.createElement("div");
            mapTileStatusElement.id = "citizenMapTileStatus";
            mapTileStatusElement.className = "citizen-map-tile-status";
            mapTileStatusElement.setAttribute("role", "status");
            mapTileStatusElement.setAttribute("aria-live", "polite");
            container.appendChild(mapTileStatusElement);
        }
        mapTileStatusElement.textContent = String(message || "");
        mapTileStatusElement.hidden = !message;
    }

    function initializeMap(profile) {
        if (typeof L === "undefined") throw new Error("The Leaflet map library did not load. Check internet access or the browser console, then refresh this page.");

        const mapElement = document.getElementById("citizenLocationMap");
        if (!mapElement) throw new Error("The Citizen map container is missing from the profile page.");
        mapTileSuccessCount = 0;
        mapTileErrorCount = 0;
        mapTileStatusElement = null;
        map = L.map(mapElement, { scrollWheelZoom: true }).setView(KOLHAPUR_CENTER, 14);

        // The host is also explicitly permitted in the profile page CSP below.
        const tileLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors",
            crossOrigin: true
        });
        tileLayer.on("tileload", () => {
            mapTileSuccessCount += 1;
            if (mapTileSuccessCount > 0) setMapTileStatus("");
        });
        tileLayer.on("tileerror", () => {
            mapTileErrorCount += 1;
            if (mapTileSuccessCount === 0 && mapTileErrorCount >= 2) {
                window.setTimeout(() => {
                    if (map && mapTileSuccessCount === 0) {
                        setMapTileStatus("Map tiles could not load. Check your internet connection and browser Console for Content Security Policy or network errors. Your location pin and Ward check may still be used once the map loads.");
                    }
                }, 1200);
            }
        });
        tileLayer.addTo(map);
        window.setTimeout(() => {
            if (map && mapTileSuccessCount === 0) {
                setMapTileStatus("The base map has not loaded yet. Check internet access and the browser Console. If tiles are blocked, confirm that tile.openstreetmap.org is allowed by the page's Content Security Policy.");
            }
        }, 7000);

        for (const area of areas) {
            const color = area.boundary_source === "official" ? "#2e7d32" : area.boundary_source === "assistant_defined" ? "#5c7f3a" : "#b7791f";
            L.polygon(area.polygon, {
                color,
                weight: 2,
                fillColor: color,
                fillOpacity: area.boundary_source === "development" ? 0.08 : 0.12,
                dashArray: area.boundary_source === "official" ? null : "6 5"
            }).addTo(map).bindTooltip(`Ward ${area.ward_number} · ${area.ward_name}${area.boundary_is_official ? "" : " · non-official geometry"}`);
        }

        map.on("click", event => {
            cancelLocationLookupForManualPin();
            movePin(event.latlng.lat, event.latlng.lng);
        });

        const existingLat = Number(profile?.address_latitude);
        const existingLng = Number(profile?.address_longitude);
        if (profile?.address_latitude !== null && profile?.address_latitude !== undefined && Number.isFinite(existingLat) && Number.isFinite(existingLng)) {
            map.setView([existingLat, existingLng], 17);
            movePin(existingLat, existingLng);
        } else {
            const firstArea = areas[0];
            if (firstArea?.polygon?.length) {
                const centerLat = firstArea.polygon.reduce((sum, p) => sum + Number(p[0]), 0) / firstArea.polygon.length;
                const centerLng = firstArea.polygon.reduce((sum, p) => sum + Number(p[1]), 0) / firstArea.polygon.length;
                map.setView([centerLat, centerLng], 16);
            }
        }

        window.requestAnimationFrame(() => map && map.invalidateSize({ pan: false }));
        setTimeout(() => map && map.invalidateSize({ pan: false }), 150);
        setTimeout(() => map && map.invalidateSize({ pan: false }), 650);
    }

    async function initialize() {
        const me = await loadJson("/api/auth/me");
        if (me.user?.role !== "citizen") {
            window.location.replace("/login");
            return;
        }

        const csrf = await loadJson("/api/citizen/security/csrf-token");
        csrfToken = String(csrf.csrfToken || "");

        // Profile data is required, but a boundary API hiccup must not prevent
        // the basemap itself from appearing. Load Ward overlays independently.
        const profileResponse = await loadJson("/api/citizen/profile");
        let boundaryResponse = { areas: [] };
        let boundaryLoadFailed = false;
        try {
            boundaryResponse = await loadJson("/api/citizen/ward-areas");
        } catch (boundaryError) {
            boundaryLoadFailed = true;
            console.warn("Citizen Ward boundary data could not be loaded; initializing the base map without Ward overlays.");
        }

        currentProfile = profileResponse.profile || null;
        areas = Array.isArray(boundaryResponse.areas) ? boundaryResponse.areas : [];
        document.getElementById("email").value = profileResponse.user?.email || me.user?.email || "";

        const profile = currentProfile || {};
        document.getElementById("fullName").value = profile.full_name || "";
        document.getElementById("mobileNumber").value = profile.mobile_number || "";
        document.getElementById("address").value = profile.address || "";
        document.getElementById("city").value = profile.city || "Kolhapur";
        document.getElementById("postalCode").value = profile.postal_code || "";
        document.getElementById("preferredLanguage").value = profile.preferred_language || "";
        document.getElementById("notificationPreference").value = profile.notification_preference || "";

        initializeMap(profile);

        if (boundaryLoadFailed) {
            showNotice("The base map is available, but Ward boundary data could not be loaded. You can place your pin, but Ward confirmation requires the boundary API to be working. Refresh and try again before saving.", "warning");
        } else if (!areas.length) {
            showNotice("No active mapped Ward boundary is available yet. The address can be prepared, but automatic Ward assignment requires operational Ward boundary data.", "warning");
        } else if (profileResponse.profileComplete) {
            showNotice(`Your saved Ward is ${profile.ward?.name || "assigned"}. Move the pin if you have moved to a new address, then save to update the Ward.`, "success");
        }
    }

    document.getElementById("useMyLocation")?.addEventListener("click", () => {
        if (!navigator.geolocation) {
            showNotice("This browser does not support location access. Click the map to place the pin manually.", "error");
            return;
        }

        if (locationWatchId !== null) stopLocationWatch();
        locationSearchFinished = false;
        bestLocationFix = null;
        clearAccuracyCircle();

        const button = document.getElementById("useMyLocation");
        button.disabled = true;
        button.textContent = "Improving location…";
        showNotice(
            "Requesting a fresh, high-accuracy device location. Keep this page open while it checks for up to 20 seconds. Browser location accuracy depends on your device and its Location Services; SWACHHITRA cannot make an approximate device location exact.",
            "warning"
        );

        locationSearchTimer = window.setTimeout(finishLocationLookup, LOCATION_SEARCH_WINDOW_MS);
        try {
            locationWatchId = navigator.geolocation.watchPosition(position => {
                if (locationSearchFinished) return;
                const latitude = Number(position.coords.latitude);
                const longitude = Number(position.coords.longitude);
                const accuracy = Number(position.coords.accuracy);

                if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
                    latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 ||
                    !Number.isFinite(accuracy) || accuracy <= 0) {
                    return;
                }

                if (!bestLocationFix || accuracy < bestLocationFix.accuracy) {
                    bestLocationFix = { latitude, longitude, accuracy };
                    showNotice(
                        `Checking for a better location fix. Best reported accuracy so far: ${formatAccuracy(accuracy)}. Please wait or select your home directly on the map.`,
                        "warning"
                    );
                }

                if (bestLocationFix.accuracy <= EXCELLENT_LOCATION_ACCURACY_METRES) {
                    finishLocationLookup();
                }
            }, error => {
                if (locationSearchFinished) return;
                if (error.code === 1) {
                    locationSearchFinished = true;
                    stopLocationWatch();
                    setLocationButtonIdle();
                    showNotice("Location permission was denied. Allow location access for this site in your browser settings, then try again. You can also place the pin manually.", "error");
                } else if (error.code === 2) {
                    showNotice("The device has not provided a location fix yet. Check system Location Services; the app will keep waiting briefly for a usable result.", "warning");
                } else if (error.code === 3) {
                    finishLocationLookup();
                }
            }, { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 });
        } catch (error) {
            locationSearchFinished = true;
            stopLocationWatch();
            setLocationButtonIdle();
            showNotice("The browser could not start location lookup. Check browser and device Location Services, or place the pin manually.", "error");
        }
    });

    form?.addEventListener("submit", async event => {
        event.preventDefault();
        showNotice("");
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }
        if (!latitudeInput.value || !longitudeInput.value) {
            showNotice("Place a pin at your residential address before saving.", "error");
            return;
        }

        saveButton.disabled = true;
        saveButton.textContent = "Saving profile…";
        const data = Object.fromEntries(new FormData(form).entries());
        data.address_latitude = Number(data.address_latitude);
        data.address_longitude = Number(data.address_longitude);

        try {
            const result = await loadJson("/api/citizen/profile", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": csrfToken
                },
                body: JSON.stringify(data)
            });

            if (!result.profileComplete) {
                const resolutionMessage = result.wardResolution?.message || result.message || "Ward could not be confirmed.";
                showNotice(`${result.message} ${resolutionMessage}`, "warning");
                setWardPreview(resolutionMessage, "warning");
                saveButton.disabled = false;
                saveButton.textContent = "Save profile and confirm Ward";
                return;
            }

            showNotice(`${result.message} Ward: ${result.wardResolution.ward.name}.`, "success");
            setWardPreview(`${result.wardResolution.ward.name} — ${describeSource(result.wardResolution.ward.boundary_source)}.`, result.wardResolution.ward.boundary_is_official ? "success" : "warning");
            window.setTimeout(() => window.location.replace("/citizenDash"), 900);
        } catch (error) {
            showNotice(error.message || "Unable to save your profile.", "error");
            saveButton.disabled = false;
            saveButton.textContent = "Save profile and confirm Ward";
        }
    });

    document.getElementById("backToDashboard")?.addEventListener("click", () => window.location.replace("/citizenDash"));
    document.getElementById("cancelProfile")?.addEventListener("click", () => window.location.replace("/citizenDash"));

    initialize().catch(error => {
        console.error("Citizen profile initialization failed:", error);
        showNotice(error.message || "Unable to initialize the Citizen profile.", "error");
    });
})();
