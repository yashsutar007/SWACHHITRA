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
            position: [16.7050, 74.2433]
        },
        {
            id: "TRK-031",
            driver: "Amit Patil",
            route: "R-022",
            zone: "North Zone",
            status: "En route",
            fill: 42,
            eta: "09 min",
            position: [16.7135, 74.2352]
        },
        {
            id: "TRK-045",
            driver: "Sneha Das",
            route: "R-009",
            zone: "East Zone",
            status: "Collecting",
            fill: 81,
            eta: "06 min",
            position: [16.6969, 74.2515]
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

    function truckIcon(status) {
        return L.divIcon({
            className: "",
            html: `
                <div
                    class="custom-truck-marker ${
                        status === "En route"
                            ? "enroute"
                            : ""
                    }"
                    title="${escapeHTML(status)}"
                >
                    <span>▣</span>
                </div>
            `,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
            popupAnchor: [0, -17]
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
                    icon: truckIcon(
                        truck.status
                    ),
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
        });
    }

    function drawDemoRoutes() {
        if (!activeMap || trucks.length < 2) {
            return;
        }

        /*
         * Demonstration route lines only.
         * They do not represent municipal database routes.
         */
        trucks.forEach((truck, index) => {
            const next =
                trucks[
                    (index + 1) % trucks.length
                ];

            L.polyline(
                [
                    truck.position,
                    [
                        (
                            truck.position[0] +
                            next.position[0]
                        ) / 2 + 0.006,

                        (
                            truck.position[1] +
                            next.position[1]
                        ) / 2 - 0.004
                    ],
                    next.position
                ],
                {
                    color:
                        index === 1
                            ? "#9a7928"
                            : "#547f36",
                    weight: 4,
                    opacity: 0.62,
                    dashArray:
                        index === 1
                            ? "8 8"
                            : "2 0",
                    lineCap: "round",
                    lineJoin: "round"
                }
            ).addTo(activeMap);
        });
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

    function initMap() {
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

            addTruckMarkers();
            drawDemoRoutes();

            const bounds =
                L.latLngBounds(
                    trucks.map(
                        (truck) =>
                            truck.position
                    )
                );

            if (trucks.length) {
                activeMap.fitBounds(
                    bounds.pad(0.35),
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

        const offsets = [
            [0.00075, 0.00050],
            [-0.00048, 0.00082],
            [0.00055, -0.00066]
        ];

        trucks.forEach(
            (truck, index) => {
                const marker =
                    truckMarkers.get(
                        truck.id
                    );

                if (!marker) {
                    return;
                }

                const current =
                    marker.getLatLng();

                const nextLat =
                    current.lat +
                    offsets[index][0];

                const nextLng =
                    current.lng +
                    offsets[index][1];

                const nextPosition = [
                    nextLat,
                    nextLng
                ];

                marker.setLatLng(
                    nextPosition
                );

                truck.position =
                    nextPosition;
            }
        );
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
                const bounds =
                    L.latLngBounds(
                        trucks.map(
                            (truck) =>
                                truck.position
                        )
                    );

                activeMap.flyToBounds(
                    bounds.pad(0.4),
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
