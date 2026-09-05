document.addEventListener("DOMContentLoaded", () => {

    const pages = document.querySelectorAll(".page");
    const navItems = document.querySelectorAll(".nav-item[data-page]");

    const sidebar = document.getElementById("sidebar");
    const mobileMenu = document.getElementById("mobileMenu");
    const mobileOverlay = document.getElementById("mobileOverlay");

    const notificationBtn =
        document.getElementById("notificationBtn");

    const notificationDrawer =
        document.getElementById("notificationDrawer");

    const closeDrawer =
        document.getElementById("closeDrawer");

    const modal =
        document.getElementById("truckModal");

    const modalClose =
        document.querySelector(".modal-close");

    const modalTruckId =
        document.getElementById("modalTruckId");


    /* =========================
       PAGE NAVIGATION
    ========================= */

    function showPage(pageId) {

        pages.forEach(page => {
            page.classList.remove("active");
        });

        const target =
            document.getElementById(pageId);

        if (target) {
            target.classList.add("active");
        }

        navItems.forEach(item => {

            item.classList.toggle(
                "active",
                item.dataset.page === pageId
            );

        });

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });

        closeMobileMenu();

    }


    navItems.forEach(item => {

        item.addEventListener("click", () => {

            showPage(item.dataset.page);

        });

    });


    /* =========================
       INTERNAL PAGE BUTTONS
    ========================= */

    document.querySelectorAll("[data-page-link]")
        .forEach(button => {

            button.addEventListener("click", () => {

                const page =
                    button.dataset.pageLink;

                showPage(page);

            });

        });


    /* =========================
       MOBILE MENU
    ========================= */

    function openMobileMenu() {

        sidebar.classList.add("open");
        mobileOverlay.classList.add("open");

    }


    function closeMobileMenu() {

        sidebar.classList.remove("open");
        mobileOverlay.classList.remove("open");

    }


    mobileMenu?.addEventListener(
        "click",
        openMobileMenu
    );


    mobileOverlay?.addEventListener(
        "click",
        closeMobileMenu
    );


    /* =========================
       NOTIFICATION DRAWER
    ========================= */

    notificationBtn?.addEventListener("click", () => {

        notificationDrawer.classList.add("open");

    });


    closeDrawer?.addEventListener("click", () => {

        notificationDrawer.classList.remove("open");

    });


    /* =========================
       TRUCK MODAL
    ========================= */

    const truckElements =
        document.querySelectorAll(
            ".truck-marker, .map-truck, .vehicle-item"
        );


    truckElements.forEach(element => {

        element.addEventListener("click", () => {

            const truck =
                element.dataset.truck ||
                element.querySelector("strong")?.textContent ||
                "TRK-024";

            modalTruckId.textContent =
                truck.trim();

            modal.classList.add("open");

        });

    });


    modalClose?.addEventListener("click", () => {

        modal.classList.remove("open");

    });


    modal?.addEventListener("click", event => {

        if (event.target === modal) {

            modal.classList.remove("open");

        }

    });


    /* =========================
       ESCAPE KEY
    ========================= */

    document.addEventListener("keydown", event => {

        if (event.key === "Escape") {

            modal?.classList.remove("open");

            notificationDrawer?.classList.remove("open");

            closeMobileMenu();

        }

    });


    /* =========================
       ROUTE FILTER
    ========================= */

    const routeSearch =
        document.getElementById("routeSearch");

    const routeStatus =
        document.getElementById("routeStatus");

    const routeRows =
        document.querySelectorAll(
            "#routeTable tr"
        );


    function filterRoutes() {

        const search =
            routeSearch?.value
                .toLowerCase()
                .trim() || "";

        const status =
            routeStatus?.value || "all";


        routeRows.forEach(row => {

            const text =
                row.textContent.toLowerCase();

            const rowStatus =
                row.dataset.status;

            const searchMatch =
                text.includes(search);

            const statusMatch =
                status === "all" ||
                rowStatus === status;

            row.style.display =
                searchMatch && statusMatch
                    ? ""
                    : "none";

        });

    }


    routeSearch?.addEventListener(
        "input",
        filterRoutes
    );


    routeStatus?.addEventListener(
        "change",
        filterRoutes
    );


    /* =========================
       REPORT SEARCH
    ========================= */

    const reportSearch =
        document.getElementById("reportSearch");

    const reportFilter =
        document.getElementById("reportFilter");

    const reportRows =
        document.querySelectorAll(".report-row");


    function filterReports() {

        const search =
            reportSearch?.value
                .toLowerCase()
                .trim() || "";

        const filter =
            reportFilter?.value || "all";


        reportRows.forEach(row => {

            const text =
                row.textContent.toLowerCase();

            const status =
                row.querySelector(".status")
                    ?.textContent
                    .toLowerCase()
                    .trim() || "";


            const searchMatch =
                text.includes(search);


            let statusMatch = true;


            if (filter === "open") {

                statusMatch =
                    status.includes("open");

            }

            if (filter === "progress") {

                statusMatch =
                    status.includes("progress");

            }

            if (filter === "resolved") {

                statusMatch =
                    status.includes("resolved");

            }


            row.style.display =
                searchMatch && statusMatch
                    ? ""
                    : "none";

        });

    }


    reportSearch?.addEventListener(
        "input",
        filterReports
    );


    reportFilter?.addEventListener(
        "change",
        filterReports
    );


    /* =========================
       REPORT SELECTION
    ========================= */

    reportRows.forEach(row => {

        row.addEventListener("click", () => {

            const reportId =
                row.dataset.report;

            const title =
                document.getElementById(
                    "selectedReportTitle"
                );

            if (title) {

                title.textContent =
                    reportId;

            }

        });

    });


    /* =========================
       GLOBAL SEARCH
    ========================= */

    const globalSearch =
        document.getElementById("globalSearch");


    globalSearch?.addEventListener(
        "keydown",
        event => {

            if (event.key !== "Enter") {
                return;
            }

            const query =
                globalSearch.value
                    .trim()
                    .toLowerCase();

            if (!query) {
                return;
            }


            if (
                query.includes("truck") ||
                query.includes("fleet")
            ) {

                showPage("tracking");

            } else if (
                query.includes("route")
            ) {

                showPage("routes");

            } else if (
                query.includes("bin")
            ) {

                showPage("bins");

            } else if (
                query.includes("report") ||
                query.includes("complaint")
            ) {

                showPage("reports");

            } else if (
                query.includes("staff") ||
                query.includes("driver")
            ) {

                showPage("staff");

            } else {

                showPage("overview");

            }

        }
    );


    /* =========================
       KPI COUNTER ANIMATION
    ========================= */

    function animateNumber(element) {

        const text =
            element.textContent.trim();

        const numeric =
            parseFloat(
                text.replace(/[^0-9.]/g, "")
            );

        if (Number.isNaN(numeric)) {
            return;
        }

        const suffix =
            text.replace(/[0-9.,]/g, "");

        const duration = 900;

        const start =
            performance.now();


        function update(time) {

            const progress =
                Math.min(
                    (time - start) / duration,
                    1
                );


            const eased =
                1 - Math.pow(
                    1 - progress,
                    3
                );


            const value =
                numeric * eased;


            element.textContent =
                Number.isInteger(numeric)
                    ? Math.floor(value).toLocaleString() + suffix
                    : value.toFixed(1) + suffix;


            if (progress < 1) {

                requestAnimationFrame(update);

            }

        }


        requestAnimationFrame(update);

    }


    const observer =
        new IntersectionObserver(
            entries => {

                entries.forEach(entry => {

                    if (!entry.isIntersecting) {
                        return;
                    }

                    const numberElements =
                        entry.target.querySelectorAll(
                            ".kpi-bottom strong, .analytic-card strong"
                        );

                    numberElements.forEach(
                        animateNumber
                    );

                    observer.unobserve(
                        entry.target
                    );

                });

            },
            {
                threshold: .25
            }
        );


    document
        .querySelectorAll(
            ".kpi-grid, .analytics-grid"
        )
        .forEach(section => {

            observer.observe(section);

        });


    /* =========================
       LIVE DEMO TELEMETRY
    ========================= */

    const liveValues = [
        "Operational",
        "Operational",
        "Monitoring",
        "Operational"
    ];

    let telemetryIndex = 0;


    setInterval(() => {

        telemetryIndex =
            (telemetryIndex + 1) %
            liveValues.length;

        const status =
            document.querySelector(
                ".network-status strong"
            );

        if (!status) {
            return;
        }

        status.style.opacity = "0";


        setTimeout(() => {

            status.textContent =
                liveValues[telemetryIndex];

            status.style.opacity = "1";

        }, 150);

    }, 5000);


    /* =========================
       ACTION ITEM FEEDBACK
    ========================= */

    document
        .querySelectorAll(".action-item")
        .forEach(item => {

            item.addEventListener("click", () => {

                item.animate(
                    [
                        {
                            transform: "translateX(4px)"
                        },
                        {
                            transform: "translateX(7px)"
                        },
                        {
                            transform: "translateX(4px)"
                        }
                    ],
                    {
                        duration: 280,
                        easing: "cubic-bezier(.2,.8,.2,1)"
                    }
                );

            });

        });


    /* =========================
       STAFF TABS
    ========================= */

    document
        .querySelectorAll(".staff-tabs button")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    document
                        .querySelectorAll(
                            ".staff-tabs button"
                        )
                        .forEach(btn => {
                            btn.classList.remove("active");
                        });

                    button.classList.add("active");

                }
            );

        });


    /* =========================
       INITIAL STATE
    ========================= */

    showPage("overview");

});