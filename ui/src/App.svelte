<script lang="ts">
    import Account from "./component/Account.svelte";
    import Addresses from "./component/Addresses.svelte";
    import Limits from "./component/Limits.svelte";
    import { onMount } from "svelte";
    import { encode } from "@msgpack/msgpack";
    import { ResponseCompact } from "./lib/Response";

    // Per-address identity attributes (name, homepage, type, …). The backend
    // keys these by email address (see mailboxmanager read_aliases()). `type`
    // is "alias" for an address the server added, "subaddress" for one the
    // user added.
    type Identity = {
        name?: string;
        homepage?: string;
        type?: string;
    };

    type Domain = {
        name: string;
    };

    type UserRole = {
        name: string;
        domain: string | null;
        user: string | null;
    };

    type UserInfoGetResponse = {
        admin: null | string;
        account: string;
        aliases: Record<string, Identity>;
        domains: Domain[];
        roles: UserRole[];
        name: string | null;
        homepage: string | null;
        default_identity: string | null;
    };

    type Page = "sender" | "addresses" | "limits" | "domains";
    const PAGES: Page[] = ["sender", "addresses", "limits", "domains"];

    let activeMenu: Page = $state("sender");
    let limits: Limits | null = $state(null);
    let navCollapsed: boolean = $state(false);
    let theme: "system" | "light" | "dark" = $state("system");

    const themeOptions: Array<"system" | "light" | "dark"> = [
        "system",
        "light",
        "dark",
    ];

    // properties coming from UserInfoGet
    let account: string = $state("");
    let name: string = $state("");
    let homepage: string = $state("");
    let admin: string = $state("");
    let aliases: string[] = $state([]);
    let subaddresses: string[] = $state([]);
    let defaultIdentity: string = $state("");
    let domains: Domain[] = $state([]);
    let roles: UserRole[] = $state([]);

    async function fetchUserInfo() {
        let buffer;
        try {
            const response = await fetch("/api/v2/object", {
                method: "POST",
                headers: { "Content-Type": "application/msgpack" },
                body: encode({
                    namespace: "https://sobamail.com/module/mailboxmanager/v1",
                    name: "UserInfoGet",
                    content: [0],
                }) as BodyInit,
            });

            buffer = await response.arrayBuffer();
        } catch (error) {
            console.error("Failed to fetch user info:", error);
        }

        if (!buffer) {
            return;
        }

        const object = new ResponseCompact(buffer);
        if (!object.content) {
            return;
        }

        const content = object.content as UserInfoGetResponse;

        // account
        account = content.account;

        // admin
        if (content.admin) {
            admin = content.admin;
        }

        // identities are keyed by address: pull the primary account's display
        // name + homepage, and expose every other address as an alias or, the
        // ones the user added, as a sub-address.
        const idents = content.aliases || {};
        for (const [address, attrs] of Object.entries(idents)) {
            if (address !== account) {
                continue;
            }

            if (attrs && attrs.name) {
                name = attrs.name;
            }

            if (attrs && attrs.homepage) {
                homepage = attrs.homepage;
            }
        }
        const others = Object.entries(idents).filter(
            ([address]) => address !== account,
        );
        aliases = others
            .filter(([, attrs]) => attrs?.type !== "subaddress")
            .map(([address]) => address);
        subaddresses = others
            .filter(([, attrs]) => attrs?.type === "subaddress")
            .map(([address]) => address);

        // default identity: the account itself when none was chosen, or when
        // the chosen address is gone
        defaultIdentity = account;
        if (
            content.default_identity &&
            (aliases.includes(content.default_identity) ||
                subaddresses.includes(content.default_identity))
        ) {
            defaultIdentity = content.default_identity;
        }

        // roles
        if (content.roles && content.roles.length > 0) {
            roles = content.roles;
        }

        // domains -- not every response carries them
        domains = content.domains || [];

        // name
        if (content.name) {
            name = content.name;
        }

        // homepage
        if (content.homepage) {
            homepage = content.homepage;
        }
    }

    onMount(async () => {
        await fetchUserInfo();
    });

    // The Account and Addresses pages save one object between them: the
    // display name, the homepage and the default sender.
    async function saveUserInfo() {
        try {
            const response = await fetch("/api/v2/object", {
                method: "POST",
                headers: { "Content-Type": "application/msgpack" },
                body: encode({
                    namespace: "https://sobamail.com/module/mailboxmanager/v1",
                    name: "UserInfoPut",
                    content: {
                        name,
                        homepage,
                        // nothing to send before the account has loaded
                        ...(defaultIdentity
                            ? { default_identity: defaultIdentity }
                            : {}),
                    },
                }) as BodyInit,
            });

            const object = new ResponseCompact(await response.arrayBuffer());
            console.log(`Put result: ${JSON.stringify(object)}`);
        } catch (error) {
            console.error("Failed to put user info:", error);
        }
    }

    function handleSave() {
        if (activeMenu == "sender" || activeMenu == "addresses") {
            saveUserInfo();
        }
        if (limits && activeMenu == "limits") {
            limits.saveLimits();
        }
    }

    onMount(() => {
        if (window && window.localStorage) {
            {
                const v = window.localStorage.getItem("navCollapsed");
                if (v !== null) {
                    navCollapsed = v !== "0";
                }
            }
            {
                const v = window.localStorage.getItem("activeMenu");
                if (PAGES.includes(v as Page)) {
                    activeMenu = v as Page;
                }
            }
        }

        // A link may name the page -- #account, #addresses or #limits -- over
        // the one remembered from the last visit.
        applyHash();
        window.addEventListener("hashchange", applyHash);
        return () => window.removeEventListener("hashchange", applyHash);
    });

    function applyHash() {
        const page = window.location.hash.replace(/^#/, "");
        if (page === "account") {
            activeMenu = "sender";
        } else if (page === "addresses" || page === "limits") {
            activeMenu = page;
        }
    }

    $effect(() => {
        if (window && window.localStorage) {
            window.localStorage.setItem(
                "navCollapsed",
                navCollapsed ? "1" : "0",
            );
        }
    });

    $effect(() => {
        if (window && window.localStorage) {
            window.localStorage.setItem("activeMenu", activeMenu);
        }
    });

    // ---- Theme (design-system dark mode via data-theme on <html>) ----
    function applyTheme() {
        if (typeof document === "undefined") {
            return;
        }
        const dark =
            theme === "dark" ||
            (theme === "system" &&
                window.matchMedia("(prefers-color-scheme: dark)").matches);
        document.documentElement.setAttribute(
            "data-theme",
            dark ? "dark" : "light",
        );
    }

    // Load the saved preference (default: follow the OS).
    onMount(() => {
        const v = window.localStorage?.getItem("theme");
        if (v === "system" || v === "light" || v === "dark") {
            theme = v;
        }
    });

    // Apply + persist whenever the preference changes.
    $effect(() => {
        applyTheme();
        window.localStorage?.setItem("theme", theme);
    });

    // Re-resolve live when the OS setting flips and we're following it.
    $effect(() => {
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const onChange = () => {
            if (theme === "system") {
                applyTheme();
            }
        };
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    });
</script>

<div class="app-container">
    <!-- Header -->
    <div class="header">
        <div class="header-content">
            <h1>Settings</h1>
            <div class="theme-toggle" role="group" aria-label="Appearance">
                {#each themeOptions as opt}
                    <button
                        class:active={theme === opt}
                        aria-pressed={theme === opt}
                        onclick={() => (theme = opt)}
                    >
                        {opt[0].toUpperCase() + opt.slice(1)}
                    </button>
                {/each}
            </div>
        </div>
    </div>

    <div class="main-content">
        <div class="content-wrapper">
            <!-- Left Sidebar Menu -->
            <div class="sidebar" class:collapsed={navCollapsed}>
                <nav>
                    <!-- collapse button in the margin between nav and content -->
                    <button
                        class="nav-toggle"
                        onclick={() => (navCollapsed = !navCollapsed)}
                        aria-label="Toggle icon text"
                        title="Toggle icon text"
                    >
                        {#if navCollapsed}
                            <span class="arrow">▶</span>
                        {:else}
                            <span class="arrow">◀</span>
                        {/if}
                    </button>

                    <button
                        class="nav-item"
                        class:active={activeMenu === "sender"}
                        onclick={() => (activeMenu = "sender")}
                    >
                        <svg
                            class="nav-icon"
                            height="480"
                            viewBox="0 0 127 127"
                            width="480"
                            xmlns="http://www.w3.org/2000/svg"
                            xmlns:xlink="http://www.w3.org/1999/xlink"
                            ><linearGradient
                                id="a"
                                gradientUnits="userSpaceOnUse"
                                x1="63.72385"
                                x2="63.874599"
                                y1="64.059652"
                                y2="127.446232"
                                ><stop offset="0" stop-color="#e1faff" /><stop
                                    offset=".69760984"
                                    stop-color="#e1faff"
                                /><stop
                                    offset="1"
                                    stop-color="#e1faff"
                                    stop-opacity="0"
                                /></linearGradient
                            ><circle
                                cx="63.5"
                                cy="38.100002"
                                r="25.4"
                                style="fill:#e1faff;fill-rule:evenodd;stroke:currentColor;stroke-width:12.7;stroke-linecap:round;stroke-linejoin:bevel"
                            /><circle
                                cx="63.873089"
                                cy="114.83726"
                                fill="url(#a)"
                                fill-rule="evenodd"
                                opacity=".821317"
                                r="45.508335"
                            /><path
                                d="m12.760174 114.14918a50.80397 50.722179 0 0 1 50.803971-50.72218 50.80397 50.722179 0 0 1 50.803965 50.72218"
                                fill="none"
                                stroke="currentColor"
                                stroke-linecap="round"
                                stroke-linejoin="bevel"
                                stroke-width="12.7"
                            /></svg
                        >
                        <span class="nav-text"> Account </span>
                        {#if activeMenu === "sender"}
                            <img
                                class="chevron"
                                src="/arrow.svg"
                                alt="selected"
                            />
                        {/if}
                    </button>

                    <button
                        class="nav-item"
                        class:active={activeMenu === "addresses"}
                        onclick={() => (activeMenu = "addresses")}
                    >
                        <svg
                            class="nav-icon"
                            fill="none"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                            ><g
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                ><circle cx="12" cy="12" r="4" /><path
                                    d="m16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"
                                /></g
                            ></svg
                        >
                        <span class="nav-text"> Addresses </span>
                        {#if activeMenu === "addresses"}
                            <img
                                class="chevron"
                                src="arrow.svg"
                                alt="selected"
                            />
                        {/if}
                    </button>

                    <button
                        class="nav-item"
                        class:active={activeMenu === "limits"}
                        onclick={() => (activeMenu = "limits")}
                    >
                        <svg
                            class="nav-icon"
                            fill="none"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                            ><g
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                ><ellipse cx="12" cy="5" rx="9" ry="3" /><path
                                    d="m21 12c0 1.66-4 3-9 3s-9-1.34-9-3"
                                /><path
                                    d="m3 5v14c0 1.66 4 3 9 3s9-1.34 9-3v-14"
                                /></g
                            ></svg
                        >
                        <span class="nav-text"> Mailbox Limits </span>
                        {#if activeMenu === "limits"}
                            <img
                                class="chevron"
                                src="arrow.svg"
                                alt="selected"
                            />
                        {/if}
                    </button>

                    {#if domains.length > 0}
                        <button
                            class="nav-item"
                            class:active={activeMenu === "domains"}
                            onclick={() => (activeMenu = "domains")}
                        >
                            <svg
                                class="nav-icon"
                                height="240"
                                viewBox="0 0 240 240"
                                width="240"
                                xmlns="http://www.w3.org/2000/svg"
                                ><g
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-dashoffset="2.63132"
                                    stroke-miterlimit="2"
                                    stroke-width="20"
                                    ><path
                                        d="m94.693285 215.89124c-28-66.25-20.616633-137.448729 1.633367-192.198729"
                                    /><path
                                        d="m30 80c39.05 28.05 114.25 41.25 180 0"
                                    /><circle
                                        cx="120.00001"
                                        cy="120"
                                        r="99.174393"
                                    /><path
                                        d="m23.029268 136.79028c60.446182 41.37512 153.770582 42.15996 195.073012-6.24709"
                                    /><path
                                        d="m144.07351 215.89124c28-66.25 20.61663-137.448729-1.63337-192.198729"
                                    /></g
                                ></svg
                            >

                            <span class="nav-text">Domains</span>
                            {#if activeMenu === "domains"}
                                <img
                                    class="chevron"
                                    src="arrow.svg"
                                    alt="selected"
                                />
                            {/if}
                        </button>
                    {/if}
                </nav>
            </div>

            <!-- Main Content Area -->
            <div class="content-area">
                <div class="card">
                    {#if activeMenu === "sender"}
                        <Account
                            {account}
                            bind:name
                            bind:homepage
                            {admin}
                            {roles}
                        />
                    {:else if activeMenu === "addresses"}
                        <Addresses
                            {account}
                            {aliases}
                            {subaddresses}
                            bind:defaultIdentity
                            onidentitieschange={fetchUserInfo}
                        />
                    {:else if activeMenu === "domains"}
                        <!-- <Domains bind:this={domains}> -->
                    {:else}
                        <Limits bind:this={limits} />
                    {/if}

                    <!-- Footer with Save Button -->
                    <div class="card-footer">
                        <button class="form-button" onclick={handleSave}>
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<style>
    /* ---------------- App shell ---------------- */
    .app-container {
        min-height: 100vh;
        width: 100%;
        background-color: var(--surface-app);
    }

    .header {
        background-color: var(--surface-panel);
        border-bottom: var(--bw-hair) solid var(--border-subtle);
    }

    .header-content {
        max-width: 1280px;
        margin: 0 auto;
        padding: var(--space-7) var(--space-8);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-6);
    }

    /* ---------------- Theme toggle ---------------- */
    .theme-toggle {
        display: inline-flex;
        gap: var(--space-1);
        padding: var(--space-1);
        background-color: var(--surface-sunken);
        border: var(--bw-hair) solid var(--border-subtle);
        border-radius: var(--radius-md);
        flex: none;
    }

    .theme-toggle button {
        font-family: var(--font-ui);
        font-size: var(--text-sm);
        line-height: 1;
        padding: var(--space-2) var(--space-4);
        border: none;
        border-radius: var(--radius-sm);
        background: transparent;
        color: var(--text-secondary);
        cursor: pointer;
        transition:
            background var(--dur-fast) var(--ease-standard),
            color var(--dur-fast) var(--ease-standard);
    }

    .theme-toggle button:hover {
        color: var(--text-primary);
        background-color: var(--surface-hover);
    }

    .theme-toggle button.active {
        background-color: var(--blue-500);
        color: var(--color-on-primary);
    }

    .theme-toggle button:focus-visible {
        outline: none;
        box-shadow: var(--focus-ring);
    }

    h1 {
        margin: 0;
        font-size: var(--text-2xl);
        font-weight: var(--weight-medium);
        color: var(--text-primary);
    }

    .main-content {
        max-width: 1280px;
        margin: 0 auto;
        padding: var(--space-8);
    }

    .content-wrapper {
        display: flex;
        position: relative;
        gap: var(--space-8);
    }

    /* ---------------- Sidebar / nav ---------------- */
    .sidebar {
        --sidebar-width: var(--sidebar-w);
        width: var(--sidebar-width);
        flex-shrink: 0;
        transition: width var(--dur-base) var(--ease-standard);
    }

    .sidebar.collapsed {
        --sidebar-width: 3.25rem;
    }

    .sidebar.collapsed .nav-text {
        display: none;
    }

    .sidebar.collapsed .nav-item {
        justify-content: center;
        padding-left: var(--space-4);
        padding-right: var(--space-4);
    }

    .sidebar.collapsed .chevron {
        display: none;
    }

    nav {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        transform: translateY(-1rem);
    }

    .nav-item {
        width: 100%;
        display: flex;
        align-items: center;
        gap: var(--space-4);
        padding: var(--space-4) var(--space-5);
        font-family: var(--font-ui);
        font-size: var(--text-base);
        font-weight: var(--weight-regular);
        border-radius: var(--radius-sm);
        border: var(--bw-base) solid transparent;
        background: none;
        cursor: pointer;
        color: var(--text-primary);
        transition:
            background var(--dur-fast) var(--ease-standard),
            color var(--dur-fast) var(--ease-standard);
    }

    .nav-icon {
        width: 20px;
        height: 20px;
        flex: none;
    }

    .nav-text {
        display: inline-flex;
        align-items: center;
        gap: var(--space-4);
    }

    .nav-item:hover {
        background-color: var(--surface-hover);
    }

    /* Selected section = the loudest state: solid brand blue, white text
       (mirrors FolderItem--active in the design system). */
    .nav-item.active {
        background-color: var(--blue-500);
        color: var(--color-on-primary);
        border-color: transparent;
    }

    .chevron {
        width: 16px;
        height: 16px;
        margin-left: auto;
    }

    /* arrow.svg ships black; invert it to white on the solid-blue active row */
    .nav-item.active .chevron {
        filter: brightness(0) invert(1);
    }

    /* Dark: active text is near-black, so the chevron follows (no invert) */
    :global([data-theme="dark"]) .nav-item.active .chevron {
        filter: brightness(0);
    }

    .nav-toggle {
        display: flex;
        width: 3.25rem;
        height: 1.25rem;
        padding: var(--space-6);
        border: transparent;
        background: transparent;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        align-self: start;
        color: var(--text-muted);
        font-size: var(--text-sm);
    }

    .nav-toggle:hover {
        color: var(--text-secondary);
    }

    .nav-toggle .arrow {
        display: inline-block;
        line-height: 1;
    }

    /* ---------------- Content card ---------------- */
    .content-area {
        flex: 1;
        margin-top: -1rem;
    }

    .card {
        background-color: var(--surface-raised);
        border: var(--bw-hair) solid var(--border-subtle);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-sm);
        width: 100%;
        max-width: 32rem;
    }

    .card-footer {
        display: flex;
        justify-content: flex-end;
        border-top: var(--bw-hair) solid var(--border-subtle);
        padding: var(--space-5) var(--space-8);
        background-color: var(--surface-app);
        border-radius: 0 0 var(--radius-md) var(--radius-md);
    }

    /* Save = confirm/"go" action -> the design system's green go button */
    .form-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-3);
        padding: 9px 16px;
        font-family: var(--font-ui);
        font-size: var(--text-base);
        line-height: 1;
        border-radius: var(--radius-sm);
        border: var(--bw-bold) solid transparent;
        background-color: var(--color-go);
        color: var(--color-on-go);
        cursor: pointer;
        white-space: nowrap;
        user-select: none;
        transition:
            background var(--dur-fast) var(--ease-standard),
            filter var(--dur-fast) var(--ease-standard);
    }

    .form-button:hover {
        background-color: var(--color-go-hover);
    }

    .form-button:active {
        background-color: var(--color-go-hover);
    }

    .form-button:focus-visible {
        outline: none;
        box-shadow: var(--focus-ring);
    }

    .form-button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }
</style>
