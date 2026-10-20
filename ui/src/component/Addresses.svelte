<script lang="ts">
    import { encode } from "@msgpack/msgpack";
    import { ResponseCompact } from "../lib/Response";

    let {
        account,
        aliases,
        subaddresses = [],
        defaultIdentity = $bindable(""),
        onidentitieschange = async () => {},
    } = $props();

    type SubaddressResponse = {
        address: string;
        error: string | null;
    };

    const NAMESPACE = "https://sobamail.com/module/mailboxmanager/v1";

    // The addresses a sub-address extends: the account and its aliases.
    let bases: string[] = $derived([account, ...aliases]);
    let base: string = $state("");
    let separator: "+" | "-" = $state("+");
    let tag: string = $state("");
    let subaddressError: string = $state("");
    let busy: boolean = $state(false);

    // Follows the account once it has loaded, and an alias that went away.
    $effect(() => {
        if (!bases.includes(base)) {
            base = bases[0] ?? "";
        }
    });

    const localPart = (address: string) =>
        address.slice(0, address.lastIndexOf("@"));
    const domainPart = (address: string) =>
        address.slice(address.lastIndexOf("@") + 1);

    // What the server accepts after the separator, as the backend checks it.
    const TAG_PATTERN = /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/;

    let cleanTag: string = $derived(tag.trim().toLowerCase());
    let newAddress: string = $derived(
        base
            ? `${localPart(base)}${separator}${cleanTag || "tag"}@${domainPart(base)}`
            : "",
    );
    let tagValid: boolean = $derived(TAG_PATTERN.test(cleanTag));

    const ERRORS: Record<string, string> = {
        "not-a-subaddress":
            "Use letters, digits, dots, dashes and underscores, starting and ending with a letter or a digit.",
        exists: "You already have this address.",
        "not-found": "This address is already gone.",
    };

    async function post(objectName: string, content: object) {
        const response = await fetch("/api/v2/object", {
            method: "POST",
            headers: { "Content-Type": "application/msgpack" },
            body: encode({
                namespace: NAMESPACE,
                name: objectName,
                content,
            }) as BodyInit,
        });

        const object = new ResponseCompact(await response.arrayBuffer());
        return object.content as SubaddressResponse | null;
    }

    async function changeSubaddress(objectName: string, address: string) {
        busy = true;
        subaddressError = "";
        try {
            const content = await post(objectName, { address });
            if (!content) {
                subaddressError = "The mailbox manager did not answer.";
                return false;
            }

            if (content.error) {
                subaddressError = ERRORS[content.error] ?? content.error;
                return false;
            }

            await onidentitieschange();
            return true;
        } catch (error) {
            console.error(`${objectName} failed:`, error);
            subaddressError = "The mailbox manager did not answer.";
            return false;
        } finally {
            busy = false;
        }
    }

    async function addSubaddress() {
        if (!tagValid) {
            subaddressError = ERRORS["not-a-subaddress"];
            return;
        }

        if (await changeSubaddress("SubaddressAdd", newAddress)) {
            tag = "";
        }
    }

    async function removeSubaddress(address: string) {
        await changeSubaddress("SubaddressRemove", address);
    }
</script>

<div class="card-content">
    <h2>Addresses</h2>

    <div class="form-section">
        <div class="form-group">
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label>Additional Addresses</label>
            {#each aliases as alias}
                <div class="email-display">
                    <span>{alias}</span>
                </div>
            {:else}
                <p class="empty-text">None yet.</p>
            {/each}
            <p class="help-text">
                You can receive and send email as these addresses. Your
                administrator sets them up.
            </p>
        </div>

        <div class="form-group">
            <label for="subaddress-tag">Sub-addresses</label>
            {#each subaddresses as address}
                <div class="email-display subaddress">
                    <span>{address}</span>
                    <button
                        class="remove-button"
                        disabled={busy}
                        onclick={() => removeSubaddress(address)}
                        aria-label="Remove {address}"
                    >
                        Remove
                    </button>
                </div>
            {/each}
            <div class="subaddress-new">
                {#if bases.length > 1}
                    <select
                        class="subaddress-base"
                        bind:value={base}
                        aria-label="Address"
                    >
                        {#each bases as address}
                            <option value={address}>{localPart(address)}</option
                            >
                        {/each}
                    </select>
                {:else}
                    <span class="subaddress-fixed">{localPart(base)}</span>
                {/if}
                <select
                    class="subaddress-separator"
                    bind:value={separator}
                    aria-label="Separator"
                >
                    <option value="+">+</option>
                    <option value="-">-</option>
                </select>
                <input
                    type="text"
                    id="subaddress-tag"
                    class="subaddress-tag"
                    bind:value={tag}
                    placeholder="tag"
                    onkeydown={(e) => {
                        if (e.key === "Enter") {
                            addSubaddress();
                        }
                    }}
                />
            </div>
            <div class="subaddress-preview">
                <span class="preview-address" class:placeholder={!cleanTag}
                    >{newAddress}</span
                >
                <button
                    class="add-button"
                    disabled={busy || !cleanTag}
                    onclick={addSubaddress}
                >
                    Add
                </button>
            </div>
            {#if subaddressError}
                <p class="error-text" role="alert">{subaddressError}</p>
            {/if}
            <p class="help-text">
                Mail sent to {localPart(base) || "you"}+<em>anything</em> or
                {localPart(base) || "you"}-<em>anything</em> reaches you without
                any setup. Add the ones you also want to send from: they appear
                in the composer's From list, and a reply to mail sent to one of
                them is sent from it.
            </p>
        </div>

        {#if aliases.length > 0 || subaddresses.length > 0}
            <div class="form-group">
                <label for="default-identity">Default Sender</label>
                <select id="default-identity" bind:value={defaultIdentity}>
                    {#each [account, ...aliases, ...subaddresses] as address}
                        <option value={address}>{address}</option>
                    {/each}
                </select>
                <p class="help-text">
                    New messages are sent from this address. A reply is sent
                    from the address the message was sent to.
                </p>
            </div>
        {/if}
    </div>
</div>

<style>
    .subaddress {
        justify-content: space-between;
    }

    .subaddress-new,
    .subaddress-preview {
        display: flex;
        align-items: center;
        gap: var(--space-2);
    }

    .subaddress-base {
        flex: 0 1 auto;
        min-width: 0;
    }

    .subaddress-separator {
        flex: none;
        width: 3.5rem;
    }

    .subaddress-tag {
        flex: 1 1 6rem;
        min-width: 0;
    }

    .subaddress-fixed {
        color: var(--text-secondary);
        font-size: var(--text-base);
    }

    .preview-address {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: var(--text-sm);
        color: var(--text-primary);
    }

    .preview-address.placeholder {
        color: var(--text-muted);
    }

    .empty-text {
        margin: 0;
        font-size: var(--text-sm);
        color: var(--text-muted);
    }

    .add-button,
    .remove-button {
        font-family: var(--font-ui);
        font-size: var(--text-sm);
        line-height: 1;
        padding: 8px 12px;
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: background var(--dur-fast) var(--ease-standard);
    }

    .add-button {
        flex: none;
        border: var(--bw-base) solid transparent;
        background-color: var(--blue-500);
        color: var(--color-on-primary);
    }

    .remove-button {
        border: var(--bw-base) solid var(--border-default);
        background: transparent;
        color: var(--text-secondary);
    }

    .remove-button:hover {
        background-color: var(--surface-hover);
        color: var(--text-primary);
    }

    .add-button:disabled,
    .remove-button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }

    .add-button:focus-visible,
    .remove-button:focus-visible {
        outline: none;
        box-shadow: var(--focus-ring);
    }

    .error-text {
        margin: 0;
        font-size: var(--text-sm);
        color: var(--color-danger);
    }
</style>
