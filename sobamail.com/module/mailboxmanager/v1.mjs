
export const namespace = "https://sobamail.com/module/mailboxmanager/v1";

import "soba://computer/R2";

import {
    NotFoundError,
} from "https://sobamail.com/module/base/v1?sha224=FT31A9Ojcmu_lm2HSbwlKpw5FDVqfP2ESNjmrg";

// Folders whose name matches ?1 (locale-aware, case-insensitive). When ?2 is
// not null, only folders whose parent is ?2 match; a null ?2 matches folders
// with that name anywhere in the tree.
export const QSTR_GET_FOLDERS = `WITH` +
        ` l as (SELECT value as v FROM attr WHERE key='locale')` +
        ` SELECT f.uuid FROM folders f` +
        ` JOIN folder_attr fn ON fn.folder=f.uuid` +
        ` WHERE fn.key='name'` +
        ` AND lower(fn.value,(SELECT v FROM l))=lower(?1,(SELECT v FROM l))` +
        ` AND (?2 IS NULL OR ?2 IN` +
        ` (SELECT value FROM folder_attr fp WHERE fp.folder=f.uuid AND fp.key='parent'))`;

// Internal object not to be produced by user code
export class MessageTask {
    static KEY = `{${namespace}}${this.name}`;
};

/*
 * Mailbox Replica Initialization
 */

export class InitializeFolders {
    static KEY = `{${namespace}}${this.name}`;

    constructor({schema = null}) { this.schema = schema; }

    asText(locale) {
        return `Let MailboxManager know about local folders with schema version: ${this.schema}`;
    }

    toString() { return `InitializeFolders("${this.schema}")`; }
}

export class InitializeMessages {
    static KEY = `{${namespace}}${this.name}`;

    constructor({schema = null}) { this.schema = schema; }

    asText(locale) {
        return `Let MailboxManager know about local messages with schema version: ${this.schema}`;
    }

    toString() { return `InitializeMessages("${this.schema}")`; }
}

/*
 * Mailbox Attributes
 */

export class SetAttr {
    static KEY = `{${namespace}}${this.name}`;

    constructor({key = null, value = null}) {
        this.key = key;
        this.value = value;
    }

    process() { return soba.data.insert("attr", {key : this.key, value : this.value}); }

    asText(locale) { return `Set ${this.key}=${this.value}`; }

    toString() { return `SetAttr("${this.key}", "${this.value}")`; }
}

export class UnsetAttr {
    static KEY = `{${namespace}}${this.name}`;

    constructor({key = null}) { this.key = key; }

    process() {
        let parent = soba.data.find("attr", {key : this.key}).hash;
        return soba.data.delete("attr", parent);
    }

    asText(locale) { return `Unset ${this.key}`; }

    toString() { return `UnsetAttr("${this.key}")`; }
}

/*
 * Folder
 */

export class CreateFolder {
    static KEY = `{${namespace}}${this.name}`;

    constructor({uuid = null, name = null}) {
        this.uuid = uuid;
        this.name = name;
    }

    process() {
        const split_col = this.name.split(":");
        if (split_col.length !== 2) {
            throw new Error(`Invalid folder name '${this.name}'`);
        }

        const user_name = split_col[0];
        if (! soba.type.userName.isValid(user_name)) {
            throw new Error(`Invalid user name in folder name '${this.name}'`);
        }

        let fuuid_parent = null;

        const fnames = split_col[1].split("/");
        for (let i = 0, l = fnames.length - 1; i < l; ++i) {
            const fname = fnames[i];

            if (! soba.type.folderName.isValid(fname)) {
                throw new Error(`Invalid folder name fragment '${fname}' in '${this.name}'`);
            }

            const rows = soba.db.exec(QSTR_GET_FOLDERS, fname, fuuid_parent).data;
            if (rows.length < 1) {
                throw new NotFoundError({id : fname, type : fname});
            }

            fuuid_parent = rows[0][0];
        }

        const fuuid = this.uuid;
        const folder = soba.data.insert("folders", {uuid : this.uuid, mirror : 0});

        if (fuuid_parent) {
            soba.data.find("folders", {uuid : fuuid_parent, mirror : 0});
            soba.data.insert("folder_attr",
                             {folder : fuuid, key : "parent", value : fuuid_parent, mirror : 0});
        }
        else {
            soba.data.insert("folder_attr",
                             {folder : fuuid, key : "parent", value : null, mirror : 0});
        }

        soba.data.insert("folder_attr", {
            folder : fuuid,
            key : "name",
            value : split_col[1].split("/").at(-1),
            mirror : 0,
        });

        return folder;
    }

    asText(locale) { return `Create folder uuid '${this.uuid}' name '${this.name}'`; }

    toString() { return `CreateFolder("${this.uuid}", "${this.name}")`; }
}

export class InsertFolder {
    static KEY = `{${namespace}}${this.name}`;

    constructor({uuid = null, mirror = false}) {
        this.uuid = uuid;
        this.mirror = mirror;
    }

    process() { return soba.data.insert("folders", {uuid : this.uuid, mirror : this.mirror}); }

    asText(locale) { return `Insert folder uuid '${this.uuid}' mirror ${this.mirror}`; }

    toString() { return `InsertFolder("${this.uuid}", ${this.mirror})`; }
}

export class DeleteFolder {
    static KEY = `{${namespace}}${this.name}`;

    constructor({uuid = null} = {}) { this.uuid = uuid; }

    process() {
        /* clang-format off */
        const rows = soba.db.exec(
            `WITH RECURSIVE children as (`
            + ` SELECT 0 as l,key,folder FROM folder_attr WHERE key='parent' and value=?`
            + ` UNION`
            + ` SELECT c.l+1 as l,fs.key,fs.folder FROM folder_attr fs`
            + ` JOIN children c ON fs.value=c.folder WHERE fs.key=c.key`
            + `)`
            + `SELECT folder FROM children ORDER BY l DESC`,
            this.uuid)
            .data;
        /* clang-format on */

        for (let i = 0, l = rows.length; i < l; ++i) {
            const fuuid = rows[i][0];
            let parent = soba.data.find("folders", {uuid : fuuid}).hash;
            soba.data.delete("folders", parent);
        }

        let parent = soba.data.find("folders", {uuid : this.uuid}).hash;
        return soba.data.delete("folders", parent);
    }

    asText(locale) { return `Delete folder '${this.uuid}' and all its children`; }

    toString() { return `DeleteFolder("${this.uuid}")`; }
}

export class SetAttrFolder {
    static KEY = `{${namespace}}${this.name}`;

    constructor({folder = null, key = null, value = null, mirror = false}) {
        this.folder = folder;
        this.key = key;
        this.value = value;
        this.mirror = mirror;
    }

    process() {
        if (! this.key) {
            throw new Error("empty key");
        }

        if (this.key === "name" && ! this.value) {
            throw new Error("empty folder name");
        }

        if (this.key === "name" && this.value.includes(":")) {
            throw new Error(`Invalid folder name: ${this.value}`);
        }

        if (this.key === "name" && this.value === this.folder) {
            throw new Error(`Heuristic: Probably invalid folder name: ${this.value}`);
        }

        soba.data.find("folders", {uuid : this.folder});
        return soba.data.insert("folder_attr", {
            folder : this.folder,
            key : this.key,
            value : this.value,
            mirror : this.mirror,
        });
    }

    asText(locale) {
        return `Set state for folder ${this.folder} key '${this.key}' value '${this.value}'`;
    }

    toString() { return `SetAttrFolder(${this.folder}, '${this.key}', '${this.value}')`; }
}

export class UnsetAttrFolder {
    static KEY = `{${namespace}}${this.name}`;

    constructor({folder = null, key = null, mirror = false}) {
        this.folder = folder;
        this.key = key;
        this.mirror = mirror;
    }

    process() {
        if (! this.key) {
            throw new Error("empty key");
        }

        let parent = soba.data.find("folder_attr", {folder : this.folder, key : this.key}).hash;
        return soba.data.delete("folder_attr", parent);
    }

    asText(locale) { return `Unset state for folder ${this.folder} key '${this.key}'`; }

    toString() { return `UnsetAttrFolder(${this.folder}, ${this.key})`; }
}

/*
 * Message
 */

export class AddMessage {
    static KEY = `{${namespace}}${this.name}`;

    constructor({folder = null, message = null, mirror = false}) {
        this.folder = folder;
        this.message = message;
        this.mirror = mirror;
    }

    process() { return soba.data.insert("messages", this); }

    asText(locale) { return `Add message ${this.message} to folder '${this.folder}'`; }

    toString() { return `AddMessage("${this.folder}", "${this.message}")`; }
}

export class RemoveMessage {
    static KEY = `{${namespace}}${this.name}`;

    constructor({folder = null, message = null, mirror = false}) {
        this.folder = folder;
        this.message = message;
        this.mirror = mirror;
    }

    process() {
        let parent =
                soba.data.find("messages", {folder : this.folder, message : this.message}).hash;
        return soba.data.delete("messages", parent);
    }

    asText(locale) { return `Remove message ${this.message} from folder '${this.folder}'`; }

    toString() { return `RemoveMessage("${this.folder}", "${this.message}")`; }
}

export class SetAttrMessage {
    static KEY = `{${namespace}}${this.name}`;

    constructor({folder = null, message = null, key = null, value = null, mirror = false}) {
        this.folder = folder;
        this.message = message;
        this.key = key;
        this.value = value;
        this.mirror = mirror;
    }

    asText(locale) {
        return `Set state in folder ${this.folder} for message ${this.message} key '${
                this.key}' value '${this.value}'`;
    }

    toString() {
        return `SetAttrMessage(${this.folder}, ${this.message}, ${this.key}, ${this.value})`;
    }

    process() {
        if (! this.key) { // https://stackoverflow.com/a/154068
            throw new Error("empty key");
        }

        return soba.data.insert("message_attr", this);
    };
}

export class UnsetAttrMessage {
    static KEY = `{${namespace}}${this.name}`;

    constructor({folder = null, message = null, key = null, mirror = false}) {
        this.folder = folder;
        this.message = message;
        this.key = key;
        this.mirror = mirror;
    }

    asText(locale) {
        return `Unset state in folder ${this.folder} for message ${this.message} key '${this.key}'`;
    }

    toString() { return `UnsetAttrMessage(${this.folder}, ${this.message}, ${this.key})`; }

    process() {
        if (! this.key) {
            throw new Error("empty key");
        }

        let parent = soba.data
                             .find("message_attr", {
                                 folder : this.folder,
                                 message : this.message,
                                 key : this.key,
                             })
                             .hash;
        return soba.data.delete("message_attr", parent);
    }
}

/*
 * Delivery
 */

export class DeliverMessage {
    static KEY = `{${namespace}}${this.name}`;

    constructor({message = null} = {}) { this.message = message; }

    process() { soba.log.warning(`Ignoring DeliverMessage event for message ${this.message}`); }

    asText(locale) { return `Deliver message ${this.message}`; }

    toString() { return `DeliverMessage("${this.message}")`; }
}

export class DeliveryEvent {
    static KEY = `{${namespace}}${this.name}`;

    constructor({
        server = null,
        utctimeMs = null,
        message = null,
        destaddr = null,
        statuscode = null,
        statustext = null,
        statusdata = null,
        // the Message-IDs of the messages the event is about: the trailing field every
        // DeliveryEvent carries since 2026-10-15 (amp-apps MailboxManagerEvents.h `messageIds`),
        // what a holder of a copy finds the message by; `message` is the filer's own uuid
        messageIds = null,
    } = {}) {
        this.server = server;
        this.utctimeMs = utctimeMs;
        this.message = message;
        this.destaddr = destaddr;
        this.statuscode = statuscode;
        this.statustext = statustext;
        this.statusdata = statusdata;
        this.messageIds = messageIds;
    }

    process() { soba.log.warning(`Ignoring DeliveryEvent event: ${JSON.stringify(this)}`); }

    asText(locale) { return `Delivery event ${this.message} to address ${this.destaddr}`; }

    toString() {
        return `DeliveryEvent("${this.server}, ${this.utctimeMs}, ${this.message},` +
                ` ${this.destaddr}, ${this.statuscode}, ${this.statustext}, ${this.statusdata},` +
                ` ${this.messageIds}")`;
    }
}

/*
 * User Interface
 */

export class UserInfoGet {
    static KEY = `{${namespace}}${this.name}`;
    process() { soba.task.respond(new UserInfoGetResponse()); }
}

export class UserInfoGetResponse {
    static KEY = `{${namespace}}${this.name}`;
    constructor() {
        this.account = soba.app.account();
        this.aliases = this.read_aliases();
        this.roles = this.read_roles();
        this.name = this.read_name();
        this.homepage = this.read_homepage();
        this.default_identity = this.read_default_identity();
    }

    read_aliases() {
        const ret = soba.db.exec("select address,key,value from iden_attr order by address");
        if (ret.code != 0) {
            throw new Error(`Database error ${ret.code}`);
        }

        let aliases = {};
        for (const row of ret.data) {
            if (! aliases[row[0]]) {
                aliases[row[0]] = {};
            }

            aliases[row[0]][row[1]] = row[2];
        }

        return aliases;
    }

    read_name() {
        const ret = soba.db.exec("SELECT value FROM attr WHERE key='name'");
        if (ret.code != 0) {
            throw new Error(`Database error ${ret.code}`);
        }

        let retval = null;
        for (const row of ret.data) {
            retval = row[0];
            break;
        }

        return retval;
    }

    read_homepage() {
        const ret = soba.db.exec("SELECT value FROM attr WHERE key='homepage'");
        if (ret.code != 0) {
            throw new Error(`Database error ${ret.code}`);
        }

        let retval = null;
        for (const row of ret.data) {
            retval = row[0];
            break;
        }

        return retval;
    }

    // The address the client's compose window starts out with, null when none was chosen: the
    // account's own address is the default then.
    read_default_identity() {
        const ret = soba.db.exec("SELECT value FROM attr WHERE key='default_identity'");
        if (ret.code != 0) {
            throw new Error(`Database error ${ret.code}`);
        }

        let retval = null;
        for (const row of ret.data) {
            retval = row[0];
            break;
        }

        return retval;
    }

    read_roles() {
        const ret = soba.db.exec("SELECT name,domain,user FROM role_own");
        if (ret.code != 0) {
            throw new Error(`Database error ${ret.code}`);
        }

        let roles = [];
        for (const row of ret.data) {
            roles.push({name : row[0], domain : row[1], user : row[2]});
        }

        return roles;
    }
}

export class UserInfoPut {
    static KEY = `{${namespace}}${this.name}`;

    // An omitted default_identity leaves the one already chosen alone.
    constructor({name, homepage, aliases = null, default_identity = undefined} = {}) {
        this.name = name;
        this.homepage = homepage;
        this.aliases = aliases;
        this.default_identity = default_identity;
    }

    process() {
        soba.data.insert("attr", {key : "name", value : this.name});
        soba.data.insert("attr", {key : "homepage", value : this.homepage});

        if (this.default_identity !== undefined) {
            this.put_default_identity();
        }

        if (this.aliases !== null) {
            for (const [alias, attrs] of Object.entries(this.aliases)) {
                if (alias != soba.app.account()) {
                    continue;
                }

                soba.data.insert("iden", {address : alias});
                for (const [key, val] of Object.entries(attrs)) {
                    soba.data.insert("iden_attr", {address : alias, key : key, value : val});
                }
            }
        }

        soba.task.respond(new UserInfoPutResponse({result : "OK!"}));
    }

    // Only an address this mailbox sends as can be its default: the account itself or one of its
    // identities. Anything else is logged and dropped -- throwing would have the runtime retry the
    // request forever.
    put_default_identity() {
        const address = this.default_identity;
        if (address !== soba.app.account()) {
            const ret = soba.db.exec("SELECT 1 FROM iden WHERE address=?", address);
            if (ret.code != 0) {
                throw new Error(`Database error ${ret.code}`);
            }

            if (ret.data.length < 1) {
                soba.log.warning(`Not an identity of this mailbox: '${address}'`);
                return;
            }
        }

        soba.data.insert("attr", {key : "default_identity", value : address});
    }
}

export class UserInfoPutResponse {
    static KEY = `{${namespace}}${this.name}`;
}

/*
 * Sub-addresses
 *
 * Mail to `alice+anything@example.com` or `alice-anything@example.com` reaches
 * `alice@example.com` with nothing set up. Adding one as an identity is what
 * makes it an address the user SENDS as: an `iden` row like the aliases the
 * server pushes, told apart by its `type` attr.
 */

export const IDEN_TYPE_SUBADDRESS = "subaddress";

// The addresses a sub-address may extend: the account and the aliases the
// server pushed -- not another sub-address.
function subaddress_bases() {
    const ret = soba.db.exec("SELECT i.address FROM iden i WHERE NOT EXISTS" +
                                     " (SELECT 1 FROM iden_attr a WHERE a.address=i.address" +
                                     " AND a.key='type' AND a.value=?)",
                             IDEN_TYPE_SUBADDRESS);
    if (ret.code != 0) {
        throw new Error(`Database error ${ret.code}`);
    }

    const account = soba.app.account();
    return [ account ].concat(ret.data.map((row) => row[0]).filter((addr) => addr !== account));
}

// The base `address` is a sub-address of: one of `bases` with a '+' or a '-'
// and a tag after its local part, on the same domain. Null when it is none.
export function subaddress_base(address, bases) {
    if (typeof address !== "string") {
        return null;
    }

    const at = address.lastIndexOf("@");
    if (at < 1) {
        return null;
    }

    const local = address.slice(0, at).toLowerCase();
    const domain = address.slice(at + 1).toLowerCase();
    if (local.length > 64) {
        return null;
    }

    for (const base of bases) {
        const bat = base.lastIndexOf("@");
        const blocal = base.slice(0, bat).toLowerCase();
        if (base.slice(bat + 1).toLowerCase() !== domain || ! local.startsWith(blocal)) {
            continue;
        }

        const sep = local.charAt(blocal.length);
        const tag = local.slice(blocal.length + 1);
        if ((sep === "+" || sep === "-") && /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/.test(tag)) {
            return base;
        }
    }

    return null;
}

function iden_type(address) {
    const ret = soba.db.exec("SELECT value FROM iden_attr WHERE address=? AND key='type'", address);
    if (ret.code != 0) {
        throw new Error(`Database error ${ret.code}`);
    }

    return ret.data.length > 0 ? ret.data[0][0] : null;
}

function iden_exists(address) {
    const ret = soba.db.exec("SELECT 1 FROM iden WHERE address=?", address);
    if (ret.code != 0) {
        throw new Error(`Database error ${ret.code}`);
    }

    return ret.data.length > 0;
}

// Adds a sub-address of the account or of one of its aliases. A refusal is
// answered, never thrown: a throw would have the runtime retry the request
// forever.
export class SubaddressAdd {
    static KEY = `{${namespace}}${this.name}`;

    constructor({address = null} = {}) { this.address = address; }

    process() {
        const address = typeof this.address === "string" ? this.address.trim().toLowerCase() : "";

        let error = null;
        if (subaddress_base(address, subaddress_bases()) === null) {
            error = "not-a-subaddress";
        }
        else if (iden_exists(address)) {
            error = "exists";
        }

        if (error === null) {
            soba.data.insert("iden", {address});
            soba.data.insert("iden_attr", {address, key : "type", value : IDEN_TYPE_SUBADDRESS});
        }

        soba.task.respond(new SubaddressAddResponse({address, error}));
    }
}

export class SubaddressAddResponse {
    static KEY = `{${namespace}}${this.name}`;

    constructor({address = null, error = null} = {}) {
        this.address = address;
        this.error = error;
    }
}

// Removes a sub-address the user added -- never an alias the server pushed,
// which only the server retires. A default identity naming it goes with it.
export class SubaddressRemove {
    static KEY = `{${namespace}}${this.name}`;

    constructor({address = null} = {}) { this.address = address; }

    process() {
        const address = typeof this.address === "string" ? this.address : "";

        let error = null;
        if (! iden_exists(address)) {
            error = "not-found";
        }
        else if (iden_type(address) !== IDEN_TYPE_SUBADDRESS) {
            error = "not-a-subaddress";
        }

        if (error === null) {
            // the iden_attr rows go with the iden row
            soba.data.delete("iden", soba.data.find("iden", {address}).hash);

            const ret = soba.db.exec("SELECT value FROM attr WHERE key='default_identity'");
            if (ret.code != 0) {
                throw new Error(`Database error ${ret.code}`);
            }
            if (ret.data.length > 0 && ret.data[0][0] === address) {
                soba.data.delete("attr", soba.data.find("attr", {key : "default_identity"}).hash);
            }
        }

        soba.task.respond(new SubaddressRemoveResponse({address, error}));
    }
}

export class SubaddressRemoveResponse {
    static KEY = `{${namespace}}${this.name}`;

    constructor({address = null, error = null} = {}) {
        this.address = address;
        this.error = error;
    }
}

export class LimitsGet {
    static KEY = `{${namespace}}${this.name}`;

    process() {
        soba.task.respond(new LimitsGetResponse({
            inbound : LimitsGet.read_limit("inbound_limit"),
            outbound : LimitsGet.read_limit("outbound_limit"),
        }));
    }

    // A missing attr falls back to the default. A non-numeric value (e.g.
    // the string 'null' that LimitsPut writes for a null limit) means the
    // limit is not set at all, which the UI renders as infinity.
    static read_limit(key) {
        const ret = soba.db.exec("select value from attr where key=?", key);
        if (ret.data.length < 1) {
            return 32;
        }

        const value = Number(ret.data[0][0]);
        return Number.isFinite(value) ? value : null;
    }
}

export class LimitsGetResponse {
    static KEY = `{${namespace}}${this.name}`;

    constructor({inbound = null, outbound = null} = {}) {
        this.inbound = inbound;
        this.outbound = outbound;
    }
}

export class LimitsPut {
    static KEY = `{${namespace}}${this.name}`;

    // null is a valid limit value: it means there is no limit at all.
    // Only fields that were omitted entirely are left untouched.
    constructor({inbound, outbound} = {}) {
        this.inbound = inbound;
        this.outbound = outbound;
    }

    process() {
        if (this.inbound !== undefined) {
            soba.data.insert("attr", {key : "inbound_limit", value : String(this.inbound)});
        }
        if (this.outbound !== undefined) {
            soba.data.insert("attr", {key : "outbound_limit", value : String(this.outbound)});
        }
        soba.task.respond(new LimitsPutResponse());
    }
}

export class LimitsPutResponse {
    static KEY = `{${namespace}}${this.name}`;
}
