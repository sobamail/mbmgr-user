
export const namespace = "https://sobamail.com/module/user/filter/v1";

import "soba://computer/R2";

import {
    DeleteRow,
} from "https://sobamail.com/module/base/v1?sha224=FT31A9Ojcmu_lm2HSbwlKpw5FDVqfP2ESNjmrg";

/*
 * Filter
 */

export class AddFilter {
    static KEY = `{${namespace}}${this.name}`;

    constructor({uuid = null, name = null, enabled = true, conditions = [], actions = []} = {}) {
        this.uuid = uuid;
        this.name = name;
        this.enabled = enabled;
        this.conditions = conditions;
        this.actions = actions;
    }

    process() {
        soba.data.insert("filters", {uuid : this.uuid});
        soba.data.insert("filter_attr", {filter : this.uuid, key : "name", value : this.name});
        soba.data.insert("filter_attr",
                         {filter : this.uuid, key : "enabled", value : this.enabled ? 1 : 0});

        for (const cond of this.conditions) {
            soba.data.insert("filter_cond", {
                filter : this.uuid,
                field : cond.field,
                op : cond.op,
                value : cond.value,
            });
        }

        for (const act of this.actions) {
            if (act.type === "fileinto") {
                soba.data.insert("filter_action_fileinto",
                                 {filter : this.uuid, folder : act.folder});
            }
            else if (act.type === "delete") {
                soba.data.insert("filter_action_delete", {filter : this.uuid});
            }
            else {
                throw new Error(`Unknown filter action type '${act.type}'`);
            }
        }
    }

    asText(locale) { return `Add filter '${this.name}' (${this.uuid})`; }

    toString() { return `AddFilter("${this.uuid}", "${this.name}")`; }
}

export class AddFilterAttr {
    static KEY = `{${namespace}}${this.name}`;

    constructor({filter = null, key = null, value = null} = {}) {
        this.filter = filter;
        this.key = key;
        this.value = value;
    }

    process() { return soba.data.insert("filter_attr", this); }

    asText(locale) { return `Set filter ${this.filter} attr '${this.key}'='${this.value}'`; }

    toString() { return `AddFilterAttr("${this.filter}", "${this.key}")`; }
}

export class AddFilterCond {
    static KEY = `{${namespace}}${this.name}`;

    constructor({filter = null, field = null, op = null, value = null} = {}) {
        this.filter = filter;
        this.field = field;
        this.op = op;
        this.value = value;
    }

    process() { return soba.data.insert("filter_cond", this); }

    asText(locale) {
        return `Add condition to filter ${this.filter}: ${this.field} ${this.op} ${this.value}`;
    }

    toString() { return `AddFilterCond("${this.filter}", "${this.field}", "${this.op}")`; }
}

export class AddFilterActionFileinto {
    static KEY = `{${namespace}}${this.name}`;

    constructor({filter = null, folder = null} = {}) {
        this.filter = filter;
        this.folder = folder;
    }

    process() { return soba.data.insert("filter_action_fileinto", this); }

    asText(locale) {
        return `Add fileinto action to filter ${this.filter}: folder '${this.folder}'`;
    }

    toString() { return `AddFilterActionFileinto("${this.filter}", "${this.folder}")`; }
}

export class AddFilterActionDelete {
    static KEY = `{${namespace}}${this.name}`;

    constructor({filter = null} = {}) { this.filter = filter; }

    process() { return soba.data.insert("filter_action_delete", this); }

    asText(locale) { return `Add delete action to filter ${this.filter}`; }

    toString() { return `AddFilterActionDelete("${this.filter}")`; }
}

export class RemoveFilter {
    static KEY = `{${namespace}}${this.name}`;

    constructor({uuid = null} = {}) { this.uuid = uuid; }

    process() {
        const condRet = soba.db.exec(`SELECT field FROM filter_cond WHERE filter=?`, this.uuid);
        for (const row of condRet.data) {
            const hash = soba.data.find("filter_cond", {filter : this.uuid, field : row[0]}).hash;
            soba.data.delete("filter_cond", hash);
        }

        const fileintoRet =
                soba.db.exec(`SELECT folder FROM filter_action_fileinto WHERE filter=?`, this.uuid);
        for (const row of fileintoRet.data) {
            const hash =
                    soba.data.find("filter_action_fileinto", {filter : this.uuid, folder : row[0]})
                            .hash;
            soba.data.delete("filter_action_fileinto", hash);
        }

        const deleteRet =
                soba.db.exec(`SELECT filter FROM filter_action_delete WHERE filter=?`, this.uuid);
        if (deleteRet.data.length > 0) {
            const hash = soba.data.find("filter_action_delete", {filter : this.uuid}).hash;
            soba.data.delete("filter_action_delete", hash);
        }

        const attrRet = soba.db.exec(`SELECT key FROM filter_attr WHERE filter=?`, this.uuid);
        for (const row of attrRet.data) {
            const hash = soba.data.find("filter_attr", {filter : this.uuid, key : row[0]}).hash;
            soba.data.delete("filter_attr", hash);
        }

        const filterHash = soba.data.find("filters", {uuid : this.uuid}).hash;
        return soba.data.delete("filters", filterHash);
    }

    asText(locale) { return `Remove filter '${this.uuid}'`; }

    toString() { return `RemoveFilter("${this.uuid}")`; }
}

export class Filter {
    constructor() {
        soba.schema.table({
            name : "filters",
            insertEvent : AddFilter,
            deleteEvent : DeleteRow,
            columns : [
                {
                    name : "uuid",
                    checks : [
                        {op : "!=", value : null},
                        {op : "typeof", value : "text"},
                        {op : "lww", value : true},
                        {op : "regexp", value : soba.type.uuid.pattern},
                    ],
                },
            ],
        });

        soba.schema.table({
            name : "filter_attr",
            insertEvent : AddFilterAttr,
            deleteEvent : DeleteRow,
            columns : [
                {
                    name : "filter",
                    checks : [
                        {op : "!=", value : null},
                        {op : "fk", table : "filters", column : "uuid"},
                    ],
                },
                {
                    name : "key",
                    checks : [
                        {op : "!=", value : null},
                        {op : "typeof", value : "text"},
                        {op : "regexp", value : "^[a-zA-Z0-9_-]+$"},
                    ],
                },
                {
                    name : "value",
                    checks : [],
                },
            ],
            checks : [
                {
                    columns : [ "filter", "key" ],
                    op : "lww",
                    value : true,
                },
            ],
        });

        soba.schema.table({
            name : "filter_cond",
            insertEvent : AddFilterCond,
            deleteEvent : DeleteRow,
            columns : [
                {
                    name : "filter",
                    checks : [
                        {op : "!=", value : null},
                        {op : "fk", table : "filters", column : "uuid"},
                    ],
                },
                {
                    name : "field",
                    checks : [
                        {op : "!=", value : null},
                        {op : "typeof", value : "text"},
                    ],
                },
                {
                    name : "op",
                    checks : [
                        {op : "!=", value : null},
                        {op : "typeof", value : "text"},
                    ],
                },
                {
                    name : "value",
                    checks : [],
                },
            ],
            checks : [
                {
                    columns : [ "filter", "field" ],
                    op : "lww",
                    value : true,
                },
            ],
        });

        soba.schema.table({
            name : "filter_action_fileinto",
            insertEvent : AddFilterActionFileinto,
            deleteEvent : DeleteRow,
            columns : [
                {
                    name : "filter",
                    checks : [
                        {op : "!=", value : null},
                        {op : "fk", table : "filters", column : "uuid"},
                    ],
                },
                {
                    name : "folder",
                    checks : [
                        {op : "!=", value : null},
                        {op : "typeof", value : "text"},
                    ],
                },
            ],
            checks : [
                {
                    columns : [ "filter", "folder" ],
                    op : "lww",
                    value : true,
                },
            ],
        });

        soba.schema.table({
            name : "filter_action_delete",
            insertEvent : AddFilterActionDelete,
            deleteEvent : DeleteRow,
            columns : [
                {
                    name : "filter",
                    checks : [
                        {op : "!=", value : null},
                        {op : "fk", table : "filters", column : "uuid"},
                        {op : "lww", value : true},
                    ],
                },
            ],
        });
    }

    evaluate_filters(message) {
        const ret = soba.db.exec(`SELECT f.uuid FROM filters f` +
                                 ` JOIN filter_attr fa ON fa.filter=f.uuid` +
                                 ` WHERE fa.key='enabled' AND fa.value=1`);

        if (ret.code !== 0 || ret.data.length === 0) {
            return [ "inbox" ];
        }

        let matchedFolders = [];

        for (const filterRow of ret.data) {
            const filterUuid = filterRow[0];

            const condRet = soba.db.exec(`SELECT field, op, value FROM filter_cond WHERE filter=?`,
                                         filterUuid);
            if (condRet.code !== 0)
                continue;

            let allMatch = true;
            for (const cond of condRet.data) {
                if (! this.eval_condition(message, cond[0], cond[1], cond[2])) {
                    allMatch = false;
                    break;
                }
            }
            if (! allMatch)
                continue;

            const fileintoRet = soba.db.exec(
                    `SELECT folder FROM filter_action_fileinto WHERE filter=?`, filterUuid);
            if (fileintoRet.code === 0) {
                for (const row of fileintoRet.data) {
                    matchedFolders.push(row[0]);
                }
            }

            const deleteRet = soba.db.exec(`SELECT filter FROM filter_action_delete WHERE filter=?`,
                                           filterUuid);
            if (deleteRet.code === 0 && deleteRet.data.length > 0) {
                return []; // silently discard
            }
        }

        return matchedFolders.length > 0 ? matchedFolders : [ "inbox" ];
    }

    eval_condition(message, field, op, value) {
        const f = field.toLowerCase();

        if (f === "from") {
            return this.eval_op(message.fromAddress, op, value);
        }

        if (f === "subject") {
            return this.eval_op(message.subject, op, value);
        }

        if (f === "to") {
            const to = message.to;
            if (! to)
                return false;
            return to.some(ea => this.eval_op(ea.address, op, value));
        }

        if (f === "cc") {
            const cc = message.cc;
            if (! cc)
                return false;
            return cc.some(ea => this.eval_op(ea.address, op, value));
        }

        return message.getHeaderStringValueArray(field).some(v => this.eval_op(v, op, value));
    }

    eval_op(headerValue, op, value) {
        if (headerValue === null || headerValue === undefined)
            return false;

        const h = headerValue.toLowerCase();
        const v = (value ?? "").toLowerCase();

        switch (op) {
        case "is":
            return h === v;
        case "not-is":
            return h !== v;
        case "contains":
            return h.includes(v);
        case "not-contains":
            return ! h.includes(v);
        case "matches":
            // an invalid user-supplied pattern must not break mail delivery
            try {
                return new RegExp(value, "i").test(headerValue);
            }
            catch (e) {
                soba.log.warning(`Invalid filter regexp '${value}': ${e.message}`);
                return false;
            }
        default:
            return false;
        }
    }
}
