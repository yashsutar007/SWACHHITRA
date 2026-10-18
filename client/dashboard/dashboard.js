/*
 * SWACHHITRA
 * PUBLIC DEMONSTRATION DASHBOARD
 *
 * This page intentionally uses mock demonstration data.
 * It is not connected to the authenticated municipal MySQL data.
 */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const DEMO_CENTER = [16.7050, 74.2433];
    const DEMO_ZOOM = 13.7;

    const mobileMenu = document.getElementById("mobileMenu");
    const sidebar = document.getElementById("sidebar");
    const mobileBackdrop = document.getElementById("mobileBackdrop");

    const toast = document.getElementById("toast");
    const truckList = document.getElementById("truckList");
    const vehicleCount = document.getElementById("vehicleCount");
    const recenterMapButton = document.getElementById("recenterMap");
    const viewAllTrucksButton = document.getElementById("viewAllTrucks");

    /*
     * -------------------------------------------------------------
     * MOCK DEMONSTRATION DATA
     * -------------------------------------------------------------
     *
     * These values exist only to demonstrate the public dashboard.
     * They are deliberately kept separate from authenticated
     * Inspector dashboard data.
     */
    const trucks = [
        {
            id: "TRK-024",
            driver: "Rajesh Kumar",
            route: "R-017",
            zone: "Central Zone",
            status: "Collecting",
            fill: 68,
            eta: "14 min",
            position: [16.7050, 74.2433],
            // Public-demo waypoints are approximate and are snapped to real roads by OSRM.
            routeStops: [
                [16.7050, 74.2433],
                [16.7084, 74.2446],
                [16.7103, 74.2481],
                [16.7073, 74.2510],
                [16.7031, 74.2505],
                [16.7017, 74.2464],
                [16.7032, 74.2428],
                [16.7050, 74.2433]
            ],
            routeGeometry: [],
            routeStopPoints: [],
            routeProgressIndex: 0,
            routeDirection: 1
        },
        {
            id: "TRK-031",
            driver: "Amit Patil",
            route: "R-022",
            zone: "North Zone",
            status: "En route",
            fill: 42,
            eta: "09 min",
            position: [16.7135, 74.2352],
            routeStops: [
                [16.7135, 74.2352],
                [16.7168, 74.2364],
                [16.7185, 74.2408],
                [16.7156, 74.2440],
                [16.7116, 74.2413],
                [16.7102, 74.2377],
                [16.7135, 74.2352]
            ],
            routeGeometry: [],
            routeStopPoints: [],
            routeProgressIndex: 0,
            routeDirection: 1
        },
        {
            id: "TRK-045",
            driver: "Sneha Das",
            route: "R-009",
            zone: "East Zone",
            status: "Collecting",
            fill: 81,
            eta: "06 min",
            position: [16.6969, 74.2515],
            routeStops: [
                [16.6969, 74.2515],
                [16.6948, 74.2561],
                [16.6915, 74.2567],
                [16.6898, 74.2524],
                [16.6925, 74.2481],
                [16.6960, 74.2473],
                [16.6969, 74.2515]
            ],
            routeGeometry: [],
            routeStopPoints: [],
            routeProgressIndex: 0,
            routeDirection: 1
        }
    ];

    let activeMap = null;
    let toastTimer = null;
    let simulationTimer = null;

    const truckMarkers = new Map();
    /*
     * -------------------------------------------------------------
     * HELPERS
     * -------------------------------------------------------------
     */

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function showToast(message) {
        if (!toast) {
            return;
        }

        toast.textContent = message;
        toast.classList.add("show");

        clearTimeout(toastTimer);

        toastTimer = setTimeout(() => {
            toast.classList.remove("show");
        }, 2200);
    }

    /*
     * -------------------------------------------------------------
     * MOBILE NAVIGATION
     * -------------------------------------------------------------
     */

    function closeMobileMenu() {
        sidebar?.classList.remove("open");
        mobileBackdrop?.classList.remove("open");
        document.body.classList.remove("menu-open");
        mobileMenu?.setAttribute("aria-expanded", "false");
    }

    function openMobileMenu() {
        sidebar?.classList.add("open");
        mobileBackdrop?.classList.add("open");
        document.body.classList.add("menu-open");
        mobileMenu?.setAttribute("aria-expanded", "true");
    }

    mobileMenu?.addEventListener("click", () => {
        if (sidebar?.classList.contains("open")) {
            closeMobileMenu();
            return;
        }

        openMobileMenu();
    });

    mobileBackdrop?.addEventListener(
        "click",
        closeMobileMenu
    );

    /*
     * -------------------------------------------------------------
     * SECTION NAVIGATION
     * -------------------------------------------------------------
     */

    function updateActiveNav(targetId) {
        document
            .querySelectorAll(".nav-link[data-scroll]")
            .forEach((link) => {
                link.classList.toggle(
                    "active",
                    link.dataset.scroll === targetId
                );
            });
    }

    document
        .querySelectorAll("[data-scroll]")
        .forEach((link) => {
            link.addEventListener("click", (event) => {
                const targetId = link.dataset.scroll;
                const target =
                    document.getElementById(targetId);

                if (!target) {
                    return;
                }

                event.preventDefault();

                target.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });

                updateActiveNav(targetId);
                closeMobileMenu();
            });
        });

    const sections = document.querySelectorAll(
        "#overview, #tracking, #how-it-works"
    );

    if ("IntersectionObserver" in window) {
        const sectionObserver =
            new IntersectionObserver(
                (entries) => {
                    const visible = entries
                        .filter(
                            (entry) =>
                                entry.isIntersecting
                        )
                        .sort(
                            (a, b) =>
                                b.intersectionRatio -
                                a.intersectionRatio
                        )[0];

                    if (visible?.target?.id) {
                        updateActiveNav(
                            visible.target.id
                        );
                    }
                },
                {
                    rootMargin:
                        "-32% 0px -55% 0px",
                    threshold: [
                        0,
                        0.2,
                        0.4,
                        0.7
                    ]
                }
            );

        sections.forEach((section) => {
            sectionObserver.observe(section);
        });
    }

    /*
     * -------------------------------------------------------------
     * TRUCK LIST
     * -------------------------------------------------------------
     */

    function renderTruckList(list = trucks) {
        if (!truckList) {
            return;
        }

        if (!list.length) {
            truckList.innerHTML = `
                <div class="empty-state">
                    No demonstration vehicles available.
                </div>
            `;

            if (vehicleCount) {
                vehicleCount.textContent = "0";
            }

            return;
        }

        truckList.innerHTML = list
            .map(
                (truck) => `
                    <article
                        class="vehicle-item"
                        data-truck-id="${escapeHTML(
                            truck.id
                        )}"
                        tabindex="0"
                        role="button"
                        aria-label="View ${escapeHTML(
                            truck.id
                        )} on demo map"
                    >
                        <div class="vehicle-badge">
                            ▣
                        </div>

                        <div class="vehicle-copy">
                            <strong>
                                ${escapeHTML(truck.id)}
                            </strong>

                            <span class="vehicle-id">
                                ${escapeHTML(
                                    truck.driver
                                )}
                            </span>

                            <div class="truck-meta">
                                ${escapeHTML(
                                    truck.route
                                )}
                                ·
                                ${escapeHTML(
                                    truck.zone
                                )}
                                ·
                                ${Number(truck.fill)}% full
                            </div>
                        </div>

                        <span class="vehicle-status">
                            ${escapeHTML(
                                truck.status
                            )}
                        </span>
                    </article>
                `
            )
            .join("");

        if (vehicleCount) {
            vehicleCount.textContent =
                String(list.length);
        }

        bindTruckItems();
    }

    function bindTruckItems() {
        document
            .querySelectorAll(
                ".vehicle-item[data-truck-id]"
            )
            .forEach((item) => {
                const activate = () => {
                    const truck = trucks.find(
                        (entry) =>
                            entry.id ===
                            item.dataset.truckId
                    );

                    if (truck) {
                        focusTruck(truck);
                    }
                };

                item.addEventListener(
                    "click",
                    activate
                );

                item.addEventListener(
                    "keydown",
                    (event) => {
                        if (
                            event.key === "Enter" ||
                            event.key === " "
                        ) {
                            event.preventDefault();
                            activate();
                        }
                    }
                );
            });
    }

    /*
     * -------------------------------------------------------------
     * LEAFLET MAP
     * -------------------------------------------------------------
     */

    function truckIcon(truck) {
        const markerLabel = `${truck.id}, simulated public demonstration vehicle`;
        const statusClass = truck.status === "En route" ? "enroute" : "collecting";

        return L.divIcon({
            className: "",
            html: `
                <div class="custom-truck-marker gps-live ${statusClass}"
                     role="img"
                     aria-label="${escapeHTML(markerLabel)}"
                     title="${escapeHTML(truck.id)} · demo movement">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M3 6.5h11v9H3z"></path>
                        <path d="M14 10h4l3 3v2.5h-7z"></path>
                        <circle cx="7" cy="18" r="2"></circle>
                        <circle cx="18" cy="18" r="2"></circle>
                    </svg>
                </div>
            `,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            popupAnchor: [0, -14]
        });
    }

    function truckPopup(truck) {
        return `
            <div class="truck-map-popup">
                <strong>
                    ${escapeHTML(truck.id)}
                </strong>

                <span>
                    ${escapeHTML(
                        truck.driver
                    )}
                    •
                    ${escapeHTML(
                        truck.route
                    )}
                </span>

                <span>
                    ${escapeHTML(
                        truck.zone
                    )}
                    •
                    ${escapeHTML(
                        truck.status
                    )}
                </span>

                <span>
                    Fill level:
                    ${Number(truck.fill)}%
                    • ETA:
                    ${escapeHTML(
                        truck.eta
                    )}
                </span>
            </div>
        `;
    }

    function clearTruckMarkers() {
        truckMarkers.forEach(
            (marker) => marker.remove()
        );

        truckMarkers.clear();
    }

    function addTruckMarkers() {
        if (!activeMap) {
            return;
        }

        clearTruckMarkers();

        trucks.forEach((truck) => {
            const marker = L.marker(
                truck.position,
                {
                    icon: truckIcon(truck),
                    title: truck.id,
                    riseOnHover: true
                }
            ).addTo(activeMap);

            marker.bindPopup(
                truckPopup(truck),
                {
                    closeButton: true,
                    className:
                        "swachhitra-popup"
                }
            );

            marker.on("click", () => {
                showToast(
                    `${truck.id} selected on the demo map.`
                );
            });

            truckMarkers.set(
                truck.id,
                marker
            );
            updateTruckHeading(truck, marker);
        });
    }

    function validDemoRoutePoints(points) {
        return Array.isArray(points) && points.length >= 2 && points.every(point =>
            Array.isArray(point) && point.length >= 2 &&
            Number.isFinite(Number(point[0])) && Number(point[0]) >= -90 && Number(point[0]) <= 90 &&
            Number.isFinite(Number(point[1])) && Number(point[1]) >= -180 && Number(point[1]) <= 180
        );
    }

    async function fetchDemoRoadGeometry(truck) {
        if (!validDemoRoutePoints(truck.routeStops)) {
            return null;
        }

        const coordinates = truck.routeStops
            .map(([latitude, longitude]) => `${Number(longitude)},${Number(latitude)}`)
            .join(";");
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 8500);

        try {
            const response = await fetch(
                `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`,
                {
                    method: "GET",
                    headers: { Accept: "application/json" },
                    credentials: "omit",
                    signal: controller.signal
                }
            );

            if (!response.ok) {
                throw new Error(`OSRM returned HTTP ${response.status}.`);
            }

            const payload = await response.json();
            const geometry = payload?.routes?.[0]?.geometry?.coordinates;

            if (payload?.code !== "Ok" || !Array.isArray(geometry) || geometry.length < 2) {
                throw new Error(payload?.message || "OSRM returned no usable road geometry.");
            }

            const points = geometry
                .map(coordinate => [Number(coordinate[1]), Number(coordinate[0])])
                .filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1]));

            if (points.length < 2) {
                throw new Error("OSRM road geometry contained too few valid points.");
            }

            const snappedStops = Array.isArray(payload?.waypoints)
                ? payload.waypoints
                    .map(waypoint => waypoint?.location)
                    .filter(location => Array.isArray(location) && location.length >= 2)
                    .map(([longitude, latitude]) => [Number(latitude), Number(longitude)])
                    .filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1]))
                : [];

            return { points, snappedStops };
        } catch (error) {
            console.warn(
                `Public demo road route unavailable for ${truck.id}; no straight-line substitute will be drawn.`,
                error?.name === "AbortError" ? "Routing request timed out." : (error?.message || error)
            );
            return null;
        } finally {
            window.clearTimeout(timeoutId);
        }
    }

    async function loadDemoRoadRoutes() {
        await Promise.all(trucks.map(async truck => {
            const result = await fetchDemoRoadGeometry(truck);
            if (!result) {
                truck.routeGeometry = [];
                truck.routeStopPoints = [];
                return;
            }

            truck.routeGeometry = result.points;
            truck.routeStopPoints = result.snappedStops;
            truck.routeProgressIndex = 0;
            truck.routeDirection = 1;
            // Begin exactly on the road-routed geometry returned by OSRM.
            truck.position = [...result.points[0]];
        }));
    }

    function routeColor(truck) {
        return truck.status === "En route" ? "#b18728" : "#2f8f43";
    }

    function drawDemoRoutes() {
        if (!activeMap) {
            return;
        }

        trucks.forEach(truck => {
            const points = truck.routeGeometry;
            if (!Array.isArray(points) || points.length < 2) {
                return;
            }

            const color = routeColor(truck);
            const casing = L.polyline(points, {
                color: "#ffffff",
                weight: 9,
                opacity: 0.94,
                lineCap: "round",
                lineJoin: "round",
                interactive: false
            }).addTo(activeMap);

            const route = L.polyline(points, {
                color,
                weight: 4.5,
                opacity: 0.94,
                dashArray: truck.status === "En route" ? "8 7" : null,
                lineCap: "round",
                lineJoin: "round"
            }).addTo(activeMap);

            route.bindPopup(`
                <div class="truck-map-popup">
                    <strong>${escapeHTML(truck.route)} · ${escapeHTML(truck.id)}</strong>
                    <span>${escapeHTML(truck.zone)} · ${escapeHTML(truck.status)}</span>
                    <span>Illustrative route snapped to the road network for this public demo.</span>
                </div>
            `);
            route.on("click", () => focusTruck(truck));

            const stopMarkers = [];
            const stopPoints = truck.routeStopPoints || [];
            stopPoints.slice(1, -1).forEach((point, index) => {
                const stop = L.circleMarker(point, {
                    radius: 3.5,
                    color,
                    weight: 2,
                    fillColor: "#ffffff",
                    fillOpacity: 1
                }).addTo(activeMap);
                stop.bindTooltip(`${escapeHTML(truck.route)} · Demo stop ${index + 1}`);
                stopMarkers.push(stop);
            });

        });
    }

    function getDemoMapBounds() {
        const points = trucks.flatMap(truck =>
            Array.isArray(truck.routeGeometry) && truck.routeGeometry.length >= 2
                ? truck.routeGeometry
                : [truck.position]
        );
        return L.latLngBounds(points);
    }

    function updateTruckHeading(truck, marker) {
        const path = truck.routeGeometry;
        if (!Array.isArray(path) || path.length < 2) {
            return;
        }

        const currentIndex = Math.max(0, Math.min(path.length - 1, truck.routeProgressIndex));
        const nextIndex = Math.max(0, Math.min(path.length - 1, currentIndex + truck.routeDirection));
        const start = path[currentIndex];
        const end = path[nextIndex];
        const averageLatitude = ((start[0] + end[0]) / 2) * Math.PI / 180;
        const screenDeltaX = (end[1] - start[1]) * Math.cos(averageLatitude);
        const screenDeltaY = -(end[0] - start[0]);
        if (Math.abs(screenDeltaX) + Math.abs(screenDeltaY) < 1e-10) {
            return;
        }

        const heading = Math.atan2(screenDeltaY, screenDeltaX) * 180 / Math.PI;
        const svg = marker.getElement()?.querySelector(".custom-truck-marker svg");
        if (svg) {
            svg.style.transformOrigin = "50% 50%";
            svg.style.transform = `rotate(${heading}deg)`;
        }
    }

    function focusTruck(truck) {
        const marker =
            truckMarkers.get(truck.id);

        if (!activeMap || !marker) {
            showToast(
                `${truck.id} is part of the Kolhapur demonstration.`
            );
            return;
        }

        activeMap.flyTo(
            marker.getLatLng(),
            15,
            {
                duration: 0.9
            }
        );

        marker.openPopup();

        showToast(
            `${truck.id} • ${truck.route} • ${truck.status}`
        );
    }

    function createFallbackMap() {
        const mapFrame =
            document.getElementById(
                "trackingMap"
            );

        if (!mapFrame) {
            return;
        }

        mapFrame.classList.add(
            "is-fallback"
        );

        mapFrame.innerHTML = `
            <div class="fallback-map">
                <span class="road r1"></span>
                <span class="road r2"></span>
                <span class="road r3"></span>
                <span class="road r4"></span>
                <span class="road r5"></span>

                <span class="park p1"></span>
                <span class="park p2"></span>

                <span class="fallback-pin p-a">
                    024
                </span>

                <span class="fallback-pin p-b">
                    031
                </span>

                <span class="fallback-pin p-c">
                    045
                </span>
            </div>
        `;

        recenterMapButton?.addEventListener(
            "click",
            () => {
                showToast(
                    "Kolhapur demonstration map centered."
                );
            },
            { once: true }
        );
    }

    async function initMap() {
        const mapElement =
            document.getElementById(
                "trackingMap"
            );

        if (!mapElement) {
            return;
        }

        if (
            typeof window.L ===
            "undefined"
        ) {
            createFallbackMap();
            return;
        }

        try {
            activeMap = L.map(
                mapElement,
                {
                    zoomControl: true,
                    attributionControl: true,
                    scrollWheelZoom: false,
                    zoomAnimation: true,
                    preferCanvas: true
                }
            ).setView(
                DEMO_CENTER,
                DEMO_ZOOM
            );

            L.tileLayer(
                "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                {
                    maxZoom: 19,
                    attribution:
                        "&copy; OpenStreetMap contributors"
                }
            ).addTo(activeMap);

            await loadDemoRoadRoutes();
            drawDemoRoutes();
            addTruckMarkers();

            const bounds = getDemoMapBounds();

            const failedRoutes = trucks.filter(
                truck => !Array.isArray(truck.routeGeometry) || truck.routeGeometry.length < 2
            ).length;
            if (failedRoutes > 0) {
                showToast(
                    failedRoutes === trucks.length
                        ? "Road route preview is temporarily unavailable. Demo trucks remain visible."
                        : `${failedRoutes} demo road route(s) could not be loaded.`
                );
            }

            if (trucks.length) {
                activeMap.fitBounds(
                    bounds.pad(0.12),
                    {
                        padding: [
                            20,
                            20
                        ],
                        maxZoom: 14
                    }
                );
            }

            recenterMapButton?.addEventListener(
                "click",
                () => {
                    if (!activeMap) {
                        return;
                    }

                    activeMap.flyToBounds(
                        bounds.pad(0.35),
                        {
                            duration: 0.8,
                            maxZoom: 14
                        }
                    );
                }
            );
        } catch (error) {
            console.error(
                "Map initialization failed:",
                error
            );

            createFallbackMap();
        }
    }

    /*
     * -------------------------------------------------------------
     * DEMONSTRATION MOVEMENT
     * -------------------------------------------------------------
     *
     * This simulates movement for the public demo only.
     */
    function simulateTruckMovement() {
        if (!activeMap) {
            return;
        }

        trucks.forEach(truck => {
            const path = truck.routeGeometry;
            const marker = truckMarkers.get(truck.id);
            if (!marker || !Array.isArray(path) || path.length < 2) {
                return;
            }

            const step = Math.max(1, Math.ceil((path.length - 1) / 50));
            let nextIndex = truck.routeProgressIndex + (truck.routeDirection * step);

            if (nextIndex >= path.length - 1) {
                nextIndex = path.length - 1;
                truck.routeDirection = -1;
            } else if (nextIndex <= 0) {
                nextIndex = 0;
                truck.routeDirection = 1;
            }

            truck.routeProgressIndex = nextIndex;
            const nextPosition = path[nextIndex];
            marker.setLatLng(nextPosition);
            truck.position = [...nextPosition];
            updateTruckHeading(truck, marker);
        });
    }

    /*
     * -------------------------------------------------------------
     * VIEW ALL DEMO VEHICLES
     * -------------------------------------------------------------
     */

    viewAllTrucksButton?.addEventListener(
        "click",
        () => {
            renderTruckList(trucks);

            if (
                activeMap &&
                trucks.length
            ) {
                const bounds = getDemoMapBounds();

                activeMap.flyToBounds(
                    bounds.pad(0.12),
                    {
                        duration: 0.8,
                        maxZoom: 14
                    }
                );
            }

            showToast(
                "Showing all demonstration vehicles in Kolhapur."
            );
        }
    );

    /*
     * -------------------------------------------------------------
     * KEYBOARD / RESIZE
     * -------------------------------------------------------------
     */

    window.addEventListener(
        "keydown",
        (event) => {
            if (
                event.key === "Escape"
            ) {
                closeMobileMenu();
            }
        }
    );

    window.addEventListener(
        "resize",
        () => {
            if (window.innerWidth > 760) {
                closeMobileMenu();
            }

            activeMap?.invalidateSize();
        }
    );

    /*
     * -------------------------------------------------------------
     * START
     * -------------------------------------------------------------
     */

    renderTruckList();
    initMap();

    simulationTimer =
        window.setInterval(
            simulateTruckMovement,
            5000
        );

    /*
     * Stop the demo timer when the page is being unloaded.
     */
    window.addEventListener(
        "pagehide",
        () => {
            if (simulationTimer) {
                window.clearInterval(
                    simulationTimer
                );

                simulationTimer = null;
            }
        },
        { once: true }
    );
});
