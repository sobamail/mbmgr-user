<script lang="ts">
    let {
        account,
        name = $bindable(""),
        homepage = $bindable(""),
        roles,
        admin,
    } = $props();

    // `{dept.mailboxmanager.core.app.sobamail.com}Admin` names a role by the
    // app that defines it; the role's own name is what follows.
    const roleName = (name: string) => name.replace(/^\{[^}]*\}/, "");
    // What a role applies to: an address, every address of a domain, or all.
    const roleScope = (role: { domain: string | null; user: string | null }) =>
        role.user ?? (role.domain ? `Everyone at ${role.domain}` : "Everything");
</script>

<div class="card-content">
    <h2>Account Settings</h2>

    <div class="form-section">
        <div class="form-group">
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label>Email Address</label>
            <div class="email-display">
                <img class="mail-icon" src="/mail.svg" alt="mail icon" />
                <span>{account}</span>
            </div>
            <p class="help-text">
                This is also your user name.
                {#if admin}
                    <br /><span
                        >Your account administrator is: <a href="mailto:{admin}"
                            >{admin}</a
                        ></span
                    >
                {/if}
            </p>
        </div>

        <div class="form-group">
            <label for="name">Display Name</label>
            <input
                type="text"
                id="name"
                bind:value={name}
                placeholder="Enter your display name"
            />
        </div>

        <div class="form-group">
            <label for="url">Homepage</label>
            <input
                type="url"
                id="url"
                bind:value={homepage}
                placeholder="https://example.com/"
            />
        </div>

        {#if roles && roles.length > 0}
            <div class="form-group">
                <!-- svelte-ignore a11y_label_has_associated_control -->
                <label>Roles</label>
                <table>
                    <thead>
                        <tr>
                            <th>Role</th>
                            <th>Applies to</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each roles as role}
                            <tr>
                                <td>{roleName(role.name)}</td>
                                <td>{roleScope(role)}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
                <p class="help-text">
                    The roles you hold, such as access to a department's
                    mailbox. They are granted by your administrator.
                </p>
            </div>
        {/if}
    </div>
</div>
