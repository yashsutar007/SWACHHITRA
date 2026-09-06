document.addEventListener("DOMContentLoaded", () => {
    const mobileMenu = document.getElementById("mobileMenu");
    const sidebar = document.getElementById("sidebar");
    const mobileBackdrop = document.getElementById("mobileBackdrop");
    const toast = document.getElementById("toast");
    const truckList = document.getElementById("truckList");
    const vehicleCount = document.getElementById("vehicleCount");
    const recenterMapButton = document.getElementById("recenterMap");
    const viewAllTrucksButton = document.getElementById("viewAllTrucks");

    const trucks = [
        {
            id: "TRK-024",
            driver: "Rajesh Kumar",
            route: "R-017",
            zone: "Central Zone",
            status: "Collecting",
            fill: 68,
            eta: "14 min",
            position: [22.5726, 88.3639]
        },
        {
            id: "TRK-031",
            driver: "Amit Patil",
            route: "R-022",
            zone: "North Zone",
            status: "En route",
            fill: 42,
            eta: "09 min",
            position: [22.5838, 88.3701]
        },
        {
            id: "TRK-045",
            driver: "Sneha Das",
            route: "R-009",
            zone: "East Zone",
            status: "Collecting",
            fill: 81,
            eta: "06 min",
            position: [22.5637, 88.3825]
        }
    ];

    let activeMap = null;
    const truckMarkers = new Map();
    let toastTimer = null;

    function showToast(message) {
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
    }

    function closeMobileMenu() {
        sidebar?.classList.remove("open");
        mobileBackdrop?.classList.remove("open");
        document.body.classList.remove("menu-open");
    }

    function openMobileMenu() {
        sidebar?.classList.add("open");
        mobileBackdrop?.classList.add("open");
        document.body.classList.add("menu-open");
    }

    mobileMenu?.addEventListener("click", () => {
        if (sidebar?.classList.contains("open")) {
            closeMobileMenu();
        } else {
            openMobileMenu();
        }
    });

    mobileBackdrop?.addEventListener("click", closeMobileMenu);

    function updateActiveNav(targetId) {
        document.querySelectorAll(".nav-link[data-scroll]").forEach(link => {
            link.classList.toggle("active", link.dataset.scroll === targetId);
        });
    }

    document.querySelectorAll("[data-scroll]").forEach(link => {
        link.addEventListener("click", event => {
            const targetId = link.dataset.scroll;
            const target = document.getElementById(targetId);
            if (!target) return;

            event.preventDefault();
            target.scrollIntoView({ behavior: "smooth", block: "start" });
            updateActiveNav(targetId);
            closeMobileMenu();
        });
    });

    const sectionObserver = new IntersectionObserver(entries => {
        const visible = entries
            .filter(entry => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visible?.target?.id) {
            updateActiveNav(visible.target.id);
        }
    }, {
        rootMargin: "-32% 0px -55% 0px",
        threshold: [0, .2, .4, .7]
    });

    document.querySelectorAll("#overview, #tracking, #how-it-works")
        .forEach(section => sectionObserver.observe(section));

    function truckIcon(status) {
        return L.divIcon({
            className: "",
            html: `<div class="custom-truck-marker ${status === "En route" ? "enroute" : ""}" title="${status}"><span>▣</span></div>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
            popupAnchor: [0, -17]
        });
    }

    function truckPopup(truck) {
        return `
            <div class="truck-map-popup">
                <strong>${truck.id}</strong>
                <span>${truck.driver} • ${truck.route}</span>
                <span>${truck.zone} • ${truck.status}</span>
                <span>Fill level: ${truck.fill}% • ETA: ${truck.eta}</span>
            </div>
        `;
    }

    function renderTruckList(list = trucks) {
        if (!truckList) return;

        truckList.innerHTML = list.map(truck => `
            <article class="vehicle-item" data-truck-id="${truck.id}" tabindex="0" role="button" aria-label="View ${truck.id} on map">
                <div class="vehicle-badge">▣</div>
                <div class="vehicle-copy">
                    <strong>${truck.id}</strong>
                    <span class="vehicle-id">${truck.driver}</span>
                    <div class="truck-meta">${truck.route} · ${truck.zone} · ${truck.fill}% full</div>
                </div>
                <span class="vehicle-status">${truck.status}</span>
            </article>
        `).join("");

        vehicleCount.textContent = String(list.length);
        bindTruckItems();
    }

    function focusTruck(truck) {
        if (!activeMap || !truckMarkers.has(truck.id)) {
            showToast(`${truck.id} is shown in the demo map.`);
            return;
        }

        activeMap.flyTo(truckMarkers.get(truck.id).getLatLng(), 15, {
            duration: .9
        });
        truckMarkers.get(truck.id).openPopup();
        showToast(`${truck.id} • ${truck.route} • ${truck.status}`);
    }

    function bindTruckItems() {
        document.querySelectorAll(".vehicle-item[data-truck-id]").forEach(item => {
            const activate = () => {
                const truck = trucks.find(t => t.id === item.dataset.truckId);
                if (truck) focusTruck(truck);
            };

            item.addEventListener("click", activate);
            item.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    activate();
                }
            });
        });
    }

    function createFallbackMap() {
        const mapFrame = document.getElementById("trackingMap");
        if (!mapFrame) return;

        mapFrame.classList.add("is-fallback");
        mapFrame.innerHTML = `
            <div class="fallback-map">
                <span class="road r1"></span>
                <span class="road r2"></span>
                <span class="road r3"></span>
                <span class="road r4"></span>
                <span class="road r5"></span>
                <span class="park p1"></span>
                <span class="park p2"></span>
                <span class="fallback-pin p-a">024</span>
                <span class="fallback-pin p-b">031</span>
                <span class="fallback-pin p-c">045</span>
            </div>
        `;

        recenterMapButton?.addEventListener("click", () => {
            showToast("Demo map centered on the collection area.");
        });
    }

    function initMap() {
        const mapElement = document.getElementById("trackingMap");
        if (!mapElement) return;

        if (typeof window.L === "undefined") {
            createFallbackMap();
            return;
        }

        try {
            activeMap = L.map(mapElement, {
                zoomControl: true,
                attributionControl: true,
                scrollWheelZoom: false,
                zoomAnimation: true,
                preferCanvas: true
            }).setView(trucks[0].position, 13.7);

            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 19,
                attribution: "© OpenStreetMap contributors",
                crossOrigin: true
            }).addTo(activeMap);

            trucks.forEach(truck => {
                const marker = L.marker(truck.position, {
                    icon: truckIcon(truck.status),
                    title: truck.id,
                    riseOnHover: true
                }).addTo(activeMap);

                marker.bindPopup(truckPopup(truck), {
                    closeButton: true,
                    className: "swachhitra-popup"
                });

                marker.on("click", () => showToast(`${truck.id} selected on the demo map.`));
                truckMarkers.set(truck.id, marker);
            });

            trucks.forEach((truck, index) => {
                const next = trucks[(index + 1) % trucks.length];
                L.polyline([
                    truck.position,
                    [
                        (truck.position[0] + next.position[0]) / 2 + 0.006,
                        (truck.position[1] + next.position[1]) / 2 - 0.004
                    ],
                    next.position
                ], {
                    color: index === 1 ? "#9a7928" : "#547f36",
                    weight: 4,
                    opacity: .62,
                    dashArray: index === 1 ? "8 8" : "2 0",
                    lineCap: "round",
                    lineJoin: "round"
                }).addTo(activeMap);
            });

            const bounds = L.latLngBounds(trucks.map(truck => truck.position));
            activeMap.fitBounds(bounds.pad(.35), { padding: [20, 20], maxZoom: 14 });

            recenterMapButton?.addEventListener("click", () => {
                activeMap.flyToBounds(bounds.pad(.35), { duration: .8, maxZoom: 14 });
            });
        } catch (error) {
            console.error("Map initialization failed:", error);
            createFallbackMap();
        }
    }

    function simulateTruckMovement() {
        if (!activeMap) return;

        const offsets = [
            [0.00075, 0.0005],
            [-0.00048, 0.00082],
            [0.00055, -0.00066]
        ];

        trucks.forEach((truck, index) => {
            const marker = truckMarkers.get(truck.id);
            if (!marker) return;

            const current = marker.getLatLng();
            const nextLat = current.lat + offsets[index][0];
            const nextLng = current.lng + offsets[index][1];
            const nextPosition = [nextLat, nextLng];

            marker.setLatLng(nextPosition);
            truck.position = nextPosition;
        });
    }

    viewAllTrucksButton?.addEventListener("click", () => {
        if (truckList) {
            renderTruckList(trucks);
        }
        if (activeMap) {
            const bounds = L.latLngBounds(trucks.map(truck => truck.position));
            activeMap.flyToBounds(bounds.pad(.4), { duration: .8, maxZoom: 14 });
        }
        showToast("Showing all demo vehicles currently in the system.");
    });

    window.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeMobileMenu();
        }
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth > 760) {
            closeMobileMenu();
        }
        activeMap?.invalidateSize();
    });

    renderTruckList();
    initMap();
    setInterval(simulateTruckMovement, 5000);
});
